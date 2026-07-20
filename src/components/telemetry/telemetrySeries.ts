import type { TelemetryChartRow, TelemetryChartSeries } from "./TelemetryLineChart";
import type { XrkParseResult } from "./TelemetryReportView";

export type XrkChannel = NonNullable<XrkParseResult["channels"]>[number];
export type XrkLap = NonNullable<XrkParseResult["laps"]>[number];

export type TelemetryLapRef = {
  color?: string;
  id: string;
  label: string;
  lap: XrkLap;
  payload: XrkParseResult;
};

export type TelemetryAlignmentMode = "distance" | "time";

const metersPerSecondToMph = 2.2369362921;
const metersToFeet = 3.280839895;

export function buildTelemetrySeriesForLapRefs({
  channelName,
  alignmentMode = "time",
  colors,
  convertValue = (value) => value,
  lapRefs,
  smoothingWindow = 1,
}: {
  alignmentMode?: TelemetryAlignmentMode;
  channelName: string;
  colors?: string[];
  convertValue?: (value: number) => number;
  lapRefs: TelemetryLapRef[];
  smoothingWindow?: number;
}): TelemetryChartSeries[] {
  return lapRefs
    .map((lapRef, index) => {
      const channel = findTelemetryChannel(lapRef.payload.channels, channelName);
      const rows = buildTelemetryRows({
        alignmentMode,
        channel,
        convertValue,
        lap: lapRef.lap,
        payload: lapRef.payload,
        smoothingWindow,
      });
      if (!rows.length) return null;

      return {
        color: lapRef.color ?? colors?.[index % colors.length] ?? "#287a3e",
        id: lapRef.id,
        label: lapRef.label,
        rows,
      };
    })
    .filter((series): series is TelemetryChartSeries => Boolean(series));
}

export function buildTelemetryRows({
  alignmentMode = "time",
  channel,
  convertValue = (value) => value,
  lap,
  maxRows = 1200,
  payload,
  smoothingWindow = 1,
}: {
  alignmentMode?: TelemetryAlignmentMode;
  channel: XrkChannel | null;
  convertValue?: (value: number) => number;
  lap: XrkLap;
  maxRows?: number;
  payload?: XrkParseResult;
  smoothingWindow?: number;
}): TelemetryChartRow[] {
  if (!channel?.samples) return [];

  const startSeconds = lap.startSeconds;
  const endSeconds = lap.endSeconds;
  if (
    typeof startSeconds !== "number" ||
    typeof endSeconds !== "number" ||
    endSeconds <= startSeconds
  ) {
    return [];
  }

  const distanceTrace =
    alignmentMode === "distance" && payload
      ? buildLapDistanceTrace(payload, lap)
      : [];

  if (alignmentMode === "distance" && !distanceTrace.length) {
    return [];
  }

  const rows: TelemetryChartRow[] = [];
  for (const sample of channel.samples) {
    const timeSeconds = sample.timeSeconds;
    const value = sample.value;
    if (
      typeof timeSeconds !== "number" ||
      typeof value !== "number" ||
      !Number.isFinite(timeSeconds) ||
      !Number.isFinite(value) ||
      timeSeconds < startSeconds ||
      timeSeconds > endSeconds
    ) {
      continue;
    }

    const distanceIntoLapFeet =
      alignmentMode === "distance"
        ? interpolateDistanceFeetAtTime(distanceTrace, timeSeconds)
        : undefined;
    if (alignmentMode === "distance" && typeof distanceIntoLapFeet !== "number") {
      continue;
    }

    rows.push({
      distanceIntoLapFeet,
      value: convertValue(value),
      timeIntoLapSeconds: timeSeconds - startSeconds,
    });
  }

  return downsampleTelemetryRows(
    smoothTelemetryRows(rows, smoothingWindow),
    maxRows,
  );
}

export function findTelemetryChannel(
  channels: XrkParseResult["channels"],
  name: string,
): XrkChannel | null {
  return (
    channels?.find((channel) => channel.name === name) ??
    channels?.find(
      (channel) => channel.name?.toLowerCase() === name.toLowerCase(),
    ) ??
    null
  );
}

export function hasTelemetryChannel(
  lapRefs: TelemetryLapRef[],
  channelName: string,
) {
  return lapRefs.some((lapRef) =>
    findTelemetryChannel(lapRef.payload.channels, channelName),
  );
}

export function telemetryChannelUnits(
  lapRefs: TelemetryLapRef[],
  channelName: string,
) {
  for (const lapRef of lapRefs) {
    const channel = findTelemetryChannel(lapRef.payload.channels, channelName);
    if (channel?.units) return channel.units;
  }
  return "";
}

export function telemetryRpmRange(payload: XrkParseResult, lap: XrkLap) {
  const rpmChannel = findRpmChannel(payload.channels);
  const samples = rpmChannel?.samples ?? [];
  const startSeconds = lap.startSeconds;
  const endSeconds = lap.endSeconds;

  if (
    typeof startSeconds !== "number" ||
    typeof endSeconds !== "number" ||
    endSeconds <= startSeconds
  ) {
    return null;
  }

  const values = samples
    .filter(
      (sample) =>
        typeof sample.timeSeconds === "number" &&
        typeof sample.value === "number" &&
        sample.timeSeconds >= startSeconds &&
        sample.timeSeconds <= endSeconds,
    )
    .map((sample) => sample.value as number);

  if (!values.length) return null;
  return {
    max: Math.max(...values),
    min: Math.min(...values),
  };
}

export function hasGpsDistanceAlignment(lapRefs: TelemetryLapRef[]) {
  return lapRefs.some((lapRef) => buildLapDistanceTrace(lapRef.payload, lapRef.lap).length);
}

export function convertGpsSpeedToMph(value: number) {
  return value * metersPerSecondToMph;
}

export function smoothTelemetryRows(
  rows: TelemetryChartRow[],
  windowSize: number,
) {
  if (rows.length <= 2 || windowSize <= 1) return rows;

  const radius = Math.floor(windowSize / 2);
  return rows.map((row, index) => {
    const start = Math.max(0, index - radius);
    const end = Math.min(rows.length, index + radius + 1);
    const window = rows.slice(start, end);
    const average =
      window.reduce((sum, item) => sum + item.value, 0) / window.length;

    return {
      ...row,
      value: average,
    };
  });
}

export function downsampleTelemetryRows(
  rows: TelemetryChartRow[],
  maxRows: number,
) {
  if (rows.length <= maxRows) return rows;

  const step = rows.length / maxRows;
  return Array.from(
    { length: maxRows },
    (_, index) => rows[Math.floor(index * step)],
  );
}

function findRpmChannel(channels: XrkParseResult["channels"]) {
  return (
    findTelemetryChannel(channels, "RPM") ??
    channels?.find((channel) => channel.name?.toLowerCase().includes("rpm")) ??
    null
  );
}

type DistanceTracePoint = {
  distanceFeet: number;
  latitude: number;
  longitude: number;
  timeSeconds: number;
};

function buildLapDistanceTrace(
  payload: XrkParseResult,
  lap: XrkLap,
): DistanceTracePoint[] {
  const latitudeChannel = findTelemetryChannel(payload.channels, "GPS Latitude");
  const longitudeChannel = findTelemetryChannel(payload.channels, "GPS Longitude");
  if (!latitudeChannel?.samples?.length || !longitudeChannel?.samples?.length) {
    return [];
  }

  const startSeconds = lap.startSeconds;
  const endSeconds = lap.endSeconds;
  if (
    typeof startSeconds !== "number" ||
    typeof endSeconds !== "number" ||
    endSeconds <= startSeconds
  ) {
    return [];
  }

  const longitudeByTime = new Map<number, number>();
  for (const sample of longitudeChannel.samples) {
    if (
      typeof sample.timeSeconds === "number" &&
      typeof sample.value === "number" &&
      Number.isFinite(sample.timeSeconds) &&
      Number.isFinite(sample.value)
    ) {
      longitudeByTime.set(sample.timeSeconds, sample.value);
    }
  }

  const positionRows = latitudeChannel.samples
    .map((sample) => {
      const timeSeconds = sample.timeSeconds;
      const latitude = sample.value;
      if (
        typeof timeSeconds !== "number" ||
        typeof latitude !== "number" ||
        !Number.isFinite(timeSeconds) ||
        !Number.isFinite(latitude) ||
        timeSeconds < startSeconds ||
        timeSeconds > endSeconds
      ) {
        return null;
      }

      const longitude = longitudeByTime.get(timeSeconds);
      if (typeof longitude !== "number" || !Number.isFinite(longitude)) {
        return null;
      }

      return {
        latitude,
        longitude,
        timeSeconds,
      };
    })
    .filter(
      (
        row,
      ): row is {
        latitude: number;
        longitude: number;
        timeSeconds: number;
      } => Boolean(row),
    )
    .sort((first, second) => first.timeSeconds - second.timeSeconds);

  if (positionRows.length < 2) return [];

  let distanceFeet = 0;
  return positionRows.map((row, index) => {
    if (index > 0) {
      const previous = positionRows[index - 1];
      distanceFeet +=
        haversineDistanceMeters(
          previous.latitude,
          previous.longitude,
          row.latitude,
          row.longitude,
        ) * metersToFeet;
    }

    return {
      distanceFeet,
      latitude: row.latitude,
      longitude: row.longitude,
      timeSeconds: row.timeSeconds,
    };
  });
}

function interpolateDistanceFeetAtTime(
  trace: DistanceTracePoint[],
  timeSeconds: number,
) {
  if (!trace.length) return undefined;
  if (timeSeconds <= trace[0].timeSeconds) return trace[0].distanceFeet;

  const lastPoint = trace[trace.length - 1];
  if (timeSeconds >= lastPoint.timeSeconds) return lastPoint.distanceFeet;

  for (let index = 1; index < trace.length; index += 1) {
    const current = trace[index];
    const previous = trace[index - 1];
    if (timeSeconds > current.timeSeconds) continue;

    const timeSpan = current.timeSeconds - previous.timeSeconds;
    if (timeSpan <= 0) return current.distanceFeet;

    const ratio = (timeSeconds - previous.timeSeconds) / timeSpan;
    return (
      previous.distanceFeet +
      (current.distanceFeet - previous.distanceFeet) * ratio
    );
  }

  return lastPoint.distanceFeet;
}

function haversineDistanceMeters(
  latitudeA: number,
  longitudeA: number,
  latitudeB: number,
  longitudeB: number,
) {
  const earthRadiusMeters = 6371000;
  const deltaLatitude = degreesToRadians(latitudeB - latitudeA);
  const deltaLongitude = degreesToRadians(longitudeB - longitudeA);
  const latARadians = degreesToRadians(latitudeA);
  const latBRadians = degreesToRadians(latitudeB);

  const haversine =
    Math.sin(deltaLatitude / 2) ** 2 +
    Math.cos(latARadians) *
      Math.cos(latBRadians) *
      Math.sin(deltaLongitude / 2) ** 2;

  return (
    earthRadiusMeters *
    2 *
    Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine))
  );
}

function degreesToRadians(value: number) {
  return (value * Math.PI) / 180;
}
