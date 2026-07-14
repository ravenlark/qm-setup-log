import { useMemo, useState } from "react";
import {
  LapTimesBarChart,
  type LapTimeChartRow,
} from "./LapTimesBarChart";
import {
  TelemetryLineChart,
  type TelemetryChartRow,
  type TelemetryChartSeries,
} from "./TelemetryLineChart";

type XrkChannelSample = {
  timeSeconds?: number | null;
  value?: number | null;
};

type XrkChannel = {
  average?: number | null;
  max?: number | null;
  metadata?: Record<string, unknown>;
  min?: number | null;
  name?: string;
  sampleCount?: number;
  samples?: XrkChannelSample[] | null;
  units?: string | null;
};

export type XrkParseResult = {
  channels?: XrkChannel[];
  channelSummary?: XrkChannel[];
  derived?: {
    averageRpm?: number | null;
    bestCompleteLapSeconds?: number | null;
    completeLapCount?: number | null;
    maxRpm?: number | null;
    recordingDurationSeconds?: number | null;
    shortestLapSeconds?: number | null;
    totalLaps?: number | null;
  };
  file?: {
    name?: string;
    originalName?: string;
    sha256?: string;
    sizeBytes?: number;
  };
  laps?: Array<{
    durationSeconds?: number | null;
    endSeconds?: number | null;
    index?: number;
    lapNumber?: number | string;
    startSeconds?: number | null;
  }>;
  metadata?: Record<string, unknown>;
};

type TelemetryReportViewProps = {
  payload: XrkParseResult;
  rawJson?: string;
  showRawJson?: boolean;
  title?: string;
};

const metersPerSecondToMph = 2.2369362921;
const smoothingOptions = [
  { label: "Raw", value: 1 },
  { label: "Light", value: 9 },
  { label: "Medium", value: 17 },
  { label: "Heavy", value: 31 },
];
const lapSeriesColors = [
  "#e11d48",
  "#2563eb",
  "#16a34a",
  "#f97316",
  "#7c3aed",
  "#0891b2",
  "#ca8a04",
  "#db2777",
  "#0f766e",
  "#dc2626",
  "#4f46e5",
  "#65a30d",
  "#9333ea",
  "#0284c7",
  "#c2410c",
  "#475569",
  "#be123c",
  "#15803d",
  "#a21caf",
  "#0369a1",
  "#854d0e",
  "#4338ca",
  "#047857",
  "#b91c1c",
];

export function TelemetryReportView({
  payload,
  rawJson,
  showRawJson = false,
  title,
}: TelemetryReportViewProps) {
  const [selectedLapIndices, setSelectedLapIndices] = useState(() =>
    defaultSelectedLapIndices(
      payload.laps,
      payload.derived?.bestCompleteLapSeconds,
    ),
  );
  const [accelerationSmoothingWindow, setAccelerationSmoothingWindow] =
    useState(17);
  const [lateralGripSmoothingWindow, setLateralGripSmoothingWindow] =
    useState(17);
  const [lateralAccelerationSmoothingWindow, setLateralAccelerationSmoothingWindow] =
    useState(17);
  const [gpsSpeedSmoothingWindow, setGpsSpeedSmoothingWindow] = useState(1);

  const topChannels = useMemo(() => {
    return [...(payload.channelSummary ?? [])]
      .sort((first, second) => (second.sampleCount ?? 0) - (first.sampleCount ?? 0))
      .slice(0, 12);
  }, [payload.channelSummary]);
  const lapTimeRows = useMemo(() => {
    return buildLapTimeRows(payload.laps, payload.derived?.bestCompleteLapSeconds);
  }, [payload.derived?.bestCompleteLapSeconds, payload.laps]);
  const accelerationChannel = useMemo(() => {
    return findChannel(payload.channels, "GPS_InlineAcc");
  }, [payload.channels]);
  const lateralGripChannel = useMemo(() => {
    return findChannel(payload.channels, "Lateral Grip");
  }, [payload.channels]);
  const lateralAccelerationChannel = useMemo(() => {
    return findChannel(payload.channels, "GPS_LateralAcc");
  }, [payload.channels]);
  const gpsSpeedChannel = useMemo(() => {
    return findChannel(payload.channels, "GPS Speed");
  }, [payload.channels]);
  const selectedLapColors = useMemo(() => {
    return selectedLapIndices.map(
      (_, index) => lapSeriesColors[index % lapSeriesColors.length],
    );
  }, [selectedLapIndices]);
  const accelerationSeries = useMemo(() => {
    return buildTelemetrySeries(
      accelerationChannel,
      payload.laps,
      selectedLapIndices,
      accelerationSmoothingWindow,
    );
  }, [
    accelerationChannel,
    accelerationSmoothingWindow,
    payload.laps,
    selectedLapIndices,
  ]);
  const lateralGripSeries = useMemo(() => {
    return buildTelemetrySeries(
      lateralGripChannel,
      payload.laps,
      selectedLapIndices,
      lateralGripSmoothingWindow,
    );
  }, [
    lateralGripChannel,
    lateralGripSmoothingWindow,
    payload.laps,
    selectedLapIndices,
  ]);
  const lateralAccelerationSeries = useMemo(() => {
    return buildTelemetrySeries(
      lateralAccelerationChannel,
      payload.laps,
      selectedLapIndices,
      lateralAccelerationSmoothingWindow,
    );
  }, [
    lateralAccelerationChannel,
    lateralAccelerationSmoothingWindow,
    payload.laps,
    selectedLapIndices,
  ]);
  const gpsSpeedSeries = useMemo(() => {
    return buildTelemetrySeries(
      gpsSpeedChannel,
      payload.laps,
      selectedLapIndices,
      gpsSpeedSmoothingWindow,
      convertGpsSpeedToMph,
    );
  }, [
    gpsSpeedChannel,
    gpsSpeedSmoothingWindow,
    payload.laps,
    selectedLapIndices,
  ]);

  function toggleSelectedLap(lapIndex: number) {
    setSelectedLapIndices((current) => {
      if (current.includes(lapIndex)) {
        return current.filter((index) => index !== lapIndex);
      }
      return [...current, lapIndex].sort((first, second) => first - second);
    });
  }

  return (
    <div className="xrk-test-layout">
      <section className="status-grid compact">
        <MetricCard
          label="Best Complete Lap"
          value={formatSeconds(payload.derived?.bestCompleteLapSeconds)}
        />
        <MetricCard
          label="Laps"
          value={`${payload.derived?.completeLapCount ?? 0} / ${payload.derived?.totalLaps ?? 0}`}
        />
        <MetricCard label="Max RPM" value={formatNumber(payload.derived?.maxRpm)} />
      </section>

      <section className="panel xrk-test-panel">
        <div className="panel-header">
          <div>
            <span className="eyebrow">Parsed File</span>
            <h2>
              {title ?? payload.file?.originalName ?? payload.file?.name ?? "XRK file"}
            </h2>
          </div>
        </div>
        <div className="xrk-detail-grid">
          <Detail label="Size" value={formatBytes(payload.file?.sizeBytes)} />
          <Detail label="SHA-256" value={payload.file?.sha256 ?? "Not available"} />
          <Detail label="Channels" value={String(payload.channelSummary?.length ?? 0)} />
          <Detail label="Average RPM" value={formatNumber(payload.derived?.averageRpm)} />
        </div>
      </section>

      <section className="panel xrk-test-panel">
        <div className="panel-header">
          <div>
            <span className="eyebrow">Laps</span>
            <h2>Lap times</h2>
          </div>
        </div>
        <p className="xrk-chart-note">
          Click lap bars to select or remove laps from the overlay charts.
        </p>
        <LapTimesBarChart
          rows={lapTimeRows}
          selectedLapColors={selectedLapColors}
          selectedLapIndices={selectedLapIndices}
          onToggleLap={toggleSelectedLap}
        />
      </section>

      <ChannelChart
        channel={accelerationChannel}
        emptyMessage="No GPS_InlineAcc channel was found in this file."
        missingSamplesMessage="No acceleration samples were found for the selected lap."
        series={accelerationSeries}
        smoothingWindow={accelerationSmoothingWindow}
        title="Inline acceleration by lap"
        tooltipLabel="Inline acceleration"
        units={accelerationChannel?.units ?? ""}
        eyebrow="Acceleration"
        onSmoothingChange={setAccelerationSmoothingWindow}
      />

      <ChannelChart
        channel={gpsSpeedChannel}
        emptyMessage="No GPS Speed channel was found in this file."
        missingSamplesMessage="No GPS speed samples were found for the selected lap."
        series={gpsSpeedSeries}
        smoothingWindow={gpsSpeedSmoothingWindow}
        title="GPS speed by lap"
        tooltipLabel="GPS speed"
        units="mph"
        sourceUnitsSuffix={
          gpsSpeedChannel?.units
            ? ` (${gpsSpeedChannel.units}, displayed as mph)`
            : " (displayed as mph)"
        }
        eyebrow="GPS Speed"
        onSmoothingChange={setGpsSpeedSmoothingWindow}
      />

      <ChannelChart
        channel={lateralGripChannel}
        emptyMessage="No Lateral Grip channel was found in this file."
        missingSamplesMessage="No lateral grip samples were found for the selected lap."
        series={lateralGripSeries}
        smoothingWindow={lateralGripSmoothingWindow}
        title="Lateral grip by lap"
        tooltipLabel="Lateral grip"
        units={lateralGripChannel?.units ?? ""}
        eyebrow="Lateral Grip"
        onSmoothingChange={setLateralGripSmoothingWindow}
      />

      <ChannelChart
        channel={lateralAccelerationChannel}
        emptyMessage="No GPS_LateralAcc channel was found in this file."
        missingSamplesMessage="No lateral acceleration samples were found for the selected lap."
        series={lateralAccelerationSeries}
        smoothingWindow={lateralAccelerationSmoothingWindow}
        title="Lateral acceleration by lap"
        tooltipLabel="Lateral acceleration"
        units={lateralAccelerationChannel?.units ?? ""}
        eyebrow="Lateral Acceleration"
        onSmoothingChange={setLateralAccelerationSmoothingWindow}
      />

      <section className="panel xrk-test-panel">
        <div className="panel-header">
          <div>
            <span className="eyebrow">Lap Table</span>
            <h2>Lap data</h2>
          </div>
        </div>
        <div className="xrk-table-wrap">
          <table className="report-table">
            <thead>
              <tr>
                <th>Lap</th>
                <th>Start</th>
                <th>Duration</th>
              </tr>
            </thead>
            <tbody>
              {(payload.laps ?? []).map((lap) => (
                <tr key={`${lap.index}-${lap.startSeconds}`}>
                  <th>{lap.lapNumber ?? lap.index}</th>
                  <td>{formatSeconds(lap.startSeconds)}</td>
                  <td>{formatSeconds(lap.durationSeconds)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel xrk-test-panel">
        <div className="panel-header">
          <div>
            <span className="eyebrow">Channels</span>
            <h2>Largest channel summaries</h2>
          </div>
        </div>
        <div className="xrk-table-wrap">
          <table className="report-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Samples</th>
                <th>Range</th>
              </tr>
            </thead>
            <tbody>
              {topChannels.map((channel) => (
                <tr key={channel.name}>
                  <th>
                    {channel.name}
                    {channel.units ? ` (${channel.units})` : ""}
                  </th>
                  <td>{formatNumber(channel.sampleCount)}</td>
                  <td>
                    {formatNumber(channel.min)} to {formatNumber(channel.max)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {showRawJson ? (
        <section className="panel xrk-test-panel">
          <div className="panel-header">
            <div>
              <span className="eyebrow">Raw Payload</span>
              <h2>Parser JSON</h2>
            </div>
          </div>
          <pre className="xrk-json-output">
            {rawJson ?? JSON.stringify(payload, null, 2)}
          </pre>
        </section>
      ) : null}
    </div>
  );
}

function ChannelChart({
  channel,
  emptyMessage,
  eyebrow,
  missingSamplesMessage,
  onSmoothingChange,
  series,
  smoothingWindow,
  sourceUnitsSuffix,
  title,
  tooltipLabel,
  units,
}: {
  channel: XrkChannel | null;
  emptyMessage: string;
  eyebrow: string;
  missingSamplesMessage: string;
  onSmoothingChange: (value: number) => void;
  series: TelemetryChartSeries[];
  smoothingWindow: number;
  sourceUnitsSuffix?: string;
  title: string;
  tooltipLabel: string;
  units: string;
}) {
  return (
    <section className="panel xrk-test-panel">
      <div className="panel-header">
        <div>
          <span className="eyebrow">{eyebrow}</span>
          <h2>{title}</h2>
        </div>
        <div className="xrk-chart-controls">
          <label>
            Smoothing
            <select
              value={smoothingWindow}
              onChange={(event) => onSmoothingChange(Number(event.target.value))}
            >
              {smoothingOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>
      {channel ? (
        <>
          <p className="xrk-chart-note">
            Source channel: {channel.name}
            {sourceUnitsSuffix ?? (channel.units ? ` (${channel.units})` : "")}
            {smoothingWindow > 1
              ? `. Displayed as a ${smoothingWindow}-sample rolling average.`
              : ". Displayed without smoothing."}
          </p>
          <TelemetryLineChart
            emptyMessage={missingSamplesMessage}
            series={series}
            tooltipLabel={tooltipLabel}
            units={units}
          />
        </>
      ) : (
        <div className="empty-state">{emptyMessage}</div>
      )}
    </section>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="status-item">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="detail-item">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function findChannel(channels: XrkChannel[] | undefined, name: string) {
  return channels?.find((channel) => channel.name === name) ?? null;
}

function findDefaultLapIndex(
  laps: XrkParseResult["laps"],
  bestCompleteLapSeconds: number | null | undefined,
) {
  const usableLaps = laps ?? [];
  const lastLapIndex = usableLaps.length - 1;

  if (typeof bestCompleteLapSeconds === "number") {
    const bestLapIndex = usableLaps.findIndex((lap, index) => {
      const isCompleteLap = index > 0 && index < lastLapIndex;
      return (
        isCompleteLap &&
        typeof lap.durationSeconds === "number" &&
        Math.abs(lap.durationSeconds - bestCompleteLapSeconds) < 0.001
      );
    });
    if (bestLapIndex !== -1) return bestLapIndex;
  }

  const firstCompleteLapIndex = usableLaps.findIndex(
    (lap, index) =>
      index > 0 &&
      index < lastLapIndex &&
      typeof lap.durationSeconds === "number",
  );
  return firstCompleteLapIndex === -1 ? null : firstCompleteLapIndex;
}

function defaultSelectedLapIndices(
  laps: XrkParseResult["laps"],
  bestCompleteLapSeconds: number | null | undefined,
) {
  const defaultLapIndex = findDefaultLapIndex(laps, bestCompleteLapSeconds);
  return defaultLapIndex === null ? [] : [defaultLapIndex];
}

function buildTelemetrySeries(
  channel: XrkChannel | null,
  laps: XrkParseResult["laps"],
  selectedLapIndices: number[],
  smoothingWindow: number,
  convertValue: (value: number) => number = (value) => value,
): TelemetryChartSeries[] {
  return selectedLapIndices
    .map((lapIndex, seriesIndex) => {
      const lap = laps?.[lapIndex] ?? null;
      const rows = buildTelemetryRows(channel, lap, smoothingWindow, convertValue);
      if (!rows.length) return null;

      return {
        color: lapSeriesColors[seriesIndex % lapSeriesColors.length],
        id: `lap-${lapIndex}`,
        label: `Lap ${lap?.lapNumber ?? lap?.index ?? lapIndex + 1}`,
        rows,
      };
    })
    .filter((series): series is TelemetryChartSeries => Boolean(series));
}

function buildTelemetryRows(
  channel: XrkChannel | null,
  lap: NonNullable<XrkParseResult["laps"]>[number] | null,
  smoothingWindow: number,
  convertValue: (value: number) => number = (value) => value,
): TelemetryChartRow[] {
  if (!channel?.samples || !lap) return [];

  const startSeconds = lap.startSeconds;
  const endSeconds = lap.endSeconds;
  if (
    typeof startSeconds !== "number" ||
    typeof endSeconds !== "number" ||
    endSeconds <= startSeconds
  ) {
    return [];
  }

  return downsampleRows(
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
    1200,
  );
}

function convertGpsSpeedToMph(value: number) {
  return value * metersPerSecondToMph;
}

function smoothTelemetryRows(rows: TelemetryChartRow[], windowSize: number) {
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

function downsampleRows(rows: TelemetryChartRow[], maxRows: number) {
  if (rows.length <= maxRows) return rows;

  const step = rows.length / maxRows;
  return Array.from({ length: maxRows }, (_, index) => rows[Math.floor(index * step)]);
}

function buildLapTimeRows(
  laps: XrkParseResult["laps"],
  bestCompleteLapSeconds: number | null | undefined,
): LapTimeChartRow[] {
  const usableLaps = laps ?? [];
  const lastLapIndex = usableLaps.length - 1;

  return usableLaps
    .map((lap, index) => {
      const durationSeconds = lap.durationSeconds;
      if (typeof durationSeconds !== "number" || !Number.isFinite(durationSeconds)) {
        return null;
      }

      const isCompleteLap = index > 0 && index < lastLapIndex;
      const isBestCompleteLap =
        isCompleteLap &&
        typeof bestCompleteLapSeconds === "number" &&
        Math.abs(durationSeconds - bestCompleteLapSeconds) < 0.001;

      return {
        durationSeconds,
        isBestCompleteLap,
        isCompleteLap,
        lapIndex: index,
        lapLabel: `Lap ${lap.lapNumber ?? lap.index ?? index + 1}`,
        startSeconds:
          typeof lap.startSeconds === "number" && Number.isFinite(lap.startSeconds)
            ? lap.startSeconds
            : null,
      };
    })
    .filter((row): row is LapTimeChartRow => Boolean(row));
}

function formatSeconds(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value)
    ? `${value.toFixed(3)}s`
    : "Not available";
}

function formatNumber(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value)
    ? value.toLocaleString(undefined, { maximumFractionDigits: 2 })
    : "Not available";
}

function formatBytes(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "Not available";
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}
