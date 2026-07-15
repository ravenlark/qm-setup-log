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

const metersPerSecondToMph = 2.2369362921;

export function buildTelemetrySeriesForLapRefs({
  channelName,
  colors,
  convertValue = (value) => value,
  lapRefs,
  smoothingWindow = 1,
}: {
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
        channel,
        convertValue,
        lap: lapRef.lap,
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
  channel,
  convertValue = (value) => value,
  lap,
  maxRows = 1200,
  smoothingWindow = 1,
}: {
  channel: XrkChannel | null;
  convertValue?: (value: number) => number;
  lap: XrkLap;
  maxRows?: number;
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

  return downsampleTelemetryRows(
    smoothTelemetryRows(
      channel.samples
        .map((sample) => {
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
            return null;
          }

          return {
            value: convertValue(value),
            timeIntoLapSeconds: timeSeconds - startSeconds,
          };
        })
        .filter((row): row is TelemetryChartRow => Boolean(row)),
      smoothingWindow,
    ),
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
