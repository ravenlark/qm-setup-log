import * as Slider from "@radix-ui/react-slider";
import { useMemo, useState } from "react";
import type { SessionTelemetryFile } from "../../data/sessionTelemetry";
import {
  LapTimesBarChart,
  type LapTimeChartRow,
} from "./LapTimesBarChart";
import {
  TelemetryLineChart,
  type TelemetryChartRow,
  type TelemetryChartSeries,
} from "./TelemetryLineChart";
import type { XrkParseResult } from "./TelemetryReportView";

type TelemetryReportFile = {
  file: SessionTelemetryFile;
  payload: XrkParseResult;
};

type XrkChannel = NonNullable<XrkParseResult["channels"]>[number];
type XrkLap = NonNullable<XrkParseResult["laps"]>[number];

type CombinedLap = {
  file: SessionTelemetryFile;
  fileIndex: number;
  globalLapIndex: number;
  isCompleteLap: boolean;
  label: string;
  lap: XrkLap;
  payload: XrkParseResult;
  sourceLapIndex: number;
};

type SessionTelemetryReportViewProps = {
  files: TelemetryReportFile[];
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

export function SessionTelemetryReportView({
  files,
}: SessionTelemetryReportViewProps) {
  const combinedLaps = useMemo(() => buildCombinedLaps(files), [files]);
  const defaultLapSelection = useMemo(
    () => defaultSelectedLapIndices(combinedLaps),
    [combinedLaps],
  );
  const bestCompleteLapSeconds = useMemo(
    () => bestCompleteLap(combinedLaps),
    [combinedLaps],
  );
  const [selectedLapIndices, setSelectedLapIndices] = useState(() =>
    defaultSelectedLapIndices(combinedLaps),
  );
  const [visibleLapRange, setVisibleLapRange] = useState(() =>
    defaultLapRange(combinedLaps, defaultLapSelection),
  );
  const [accelerationSmoothingWindow, setAccelerationSmoothingWindow] =
    useState(17);
  const [lateralGripSmoothingWindow, setLateralGripSmoothingWindow] =
    useState(17);
  const [lateralAccelerationSmoothingWindow, setLateralAccelerationSmoothingWindow] =
    useState(17);
  const [gpsSpeedSmoothingWindow, setGpsSpeedSmoothingWindow] = useState(1);

  const selectedLapColors = useMemo(() => {
    return selectedLapIndices.map(
      (_, index) => lapSeriesColors[index % lapSeriesColors.length],
    );
  }, [selectedLapIndices]);
  const lapTimeRows = useMemo(
    () => buildLapTimeRows(combinedLaps, bestCompleteLapSeconds),
    [bestCompleteLapSeconds, combinedLaps],
  );
  const visibleLapTimeRows = useMemo(
    () =>
      lapTimeRows.filter(
        (row) =>
          row.lapIndex >= visibleLapRange.startIndex &&
          row.lapIndex <= visibleLapRange.endIndex,
      ),
    [lapTimeRows, visibleLapRange.endIndex, visibleLapRange.startIndex],
  );
  const selectedOutsideVisibleRange = useMemo(
    () =>
      selectedLapIndices.filter(
        (lapIndex) =>
          lapIndex < visibleLapRange.startIndex ||
          lapIndex > visibleLapRange.endIndex,
      ).length,
    [selectedLapIndices, visibleLapRange.endIndex, visibleLapRange.startIndex],
  );
  const accelerationSeries = useMemo(() => {
    return buildTelemetrySeries(
      combinedLaps,
      selectedLapIndices,
      "GPS_InlineAcc",
      accelerationSmoothingWindow,
    );
  }, [accelerationSmoothingWindow, combinedLaps, selectedLapIndices]);
  const gpsSpeedSeries = useMemo(() => {
    return buildTelemetrySeries(
      combinedLaps,
      selectedLapIndices,
      "GPS Speed",
      gpsSpeedSmoothingWindow,
      convertGpsSpeedToMph,
    );
  }, [combinedLaps, gpsSpeedSmoothingWindow, selectedLapIndices]);
  const lateralGripSeries = useMemo(() => {
    return buildTelemetrySeries(
      combinedLaps,
      selectedLapIndices,
      "Lateral Grip",
      lateralGripSmoothingWindow,
    );
  }, [combinedLaps, lateralGripSmoothingWindow, selectedLapIndices]);
  const lateralAccelerationSeries = useMemo(() => {
    return buildTelemetrySeries(
      combinedLaps,
      selectedLapIndices,
      "GPS_LateralAcc",
      lateralAccelerationSmoothingWindow,
    );
  }, [combinedLaps, lateralAccelerationSmoothingWindow, selectedLapIndices]);

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
        <MetricCard label="Total Laps" value={String(combinedLaps.length)} />
        <MetricCard
          label="Best Complete Lap"
          value={formatSeconds(bestCompleteLapSeconds)}
        />
      </section>

      <section className="panel xrk-test-panel">
        <div className="panel-header">
          <div>
            <h2>Combined lap times</h2>
          </div>
        </div>
        <p className="xrk-chart-note">
          Click lap bars to select or remove laps from the overlay charts. The
          narrow floating bars show min-to-max RPM for each lap.
        </p>
        <LapTimesBarChart
          rows={visibleLapTimeRows}
          selectedLapColors={selectedLapColors}
          selectedLapIndices={selectedLapIndices}
          onToggleLap={toggleSelectedLap}
        />
        <LapRangeControl
          endIndex={visibleLapRange.endIndex}
          lapCount={lapTimeRows.length}
          selectedOutsideCount={selectedOutsideVisibleRange}
          startIndex={visibleLapRange.startIndex}
          onChange={setVisibleLapRange}
        />
      </section>

      <ChannelChart
        emptyMessage="No GPS_InlineAcc channel was found in the attached files."
        hasSourceChannel={hasChannel(combinedLaps, "GPS_InlineAcc")}
        missingSamplesMessage="No acceleration samples were found for the selected lap."
        series={accelerationSeries}
        smoothingWindow={accelerationSmoothingWindow}
        title="Inline acceleration by lap"
        tooltipLabel="Inline acceleration"
        units={channelUnits(combinedLaps, "GPS_InlineAcc")}
        onSmoothingChange={setAccelerationSmoothingWindow}
      />

      <ChannelChart
        emptyMessage="No GPS Speed channel was found in the attached files."
        hasSourceChannel={hasChannel(combinedLaps, "GPS Speed")}
        missingSamplesMessage="No GPS speed samples were found for the selected lap."
        series={gpsSpeedSeries}
        smoothingWindow={gpsSpeedSmoothingWindow}
        title="GPS speed by lap"
        tooltipLabel="GPS speed"
        units="mph"
        sourceUnitsSuffix="displayed as mph"
        onSmoothingChange={setGpsSpeedSmoothingWindow}
      />

      <ChannelChart
        emptyMessage="No Lateral Grip channel was found in the attached files."
        hasSourceChannel={hasChannel(combinedLaps, "Lateral Grip")}
        missingSamplesMessage="No lateral grip samples were found for the selected lap."
        series={lateralGripSeries}
        smoothingWindow={lateralGripSmoothingWindow}
        title="Lateral grip by lap"
        tooltipLabel="Lateral grip"
        units={channelUnits(combinedLaps, "Lateral Grip")}
        onSmoothingChange={setLateralGripSmoothingWindow}
      />

      <ChannelChart
        emptyMessage="No GPS_LateralAcc channel was found in the attached files."
        hasSourceChannel={hasChannel(combinedLaps, "GPS_LateralAcc")}
        missingSamplesMessage="No lateral acceleration samples were found for the selected lap."
        series={lateralAccelerationSeries}
        smoothingWindow={lateralAccelerationSmoothingWindow}
        title="Lateral acceleration by lap"
        tooltipLabel="Lateral acceleration"
        units={channelUnits(combinedLaps, "GPS_LateralAcc")}
        onSmoothingChange={setLateralAccelerationSmoothingWindow}
      />

      <details className="panel xrk-test-panel telemetry-file-details-panel">
        <summary>Telemetry File Details</summary>
        <div className="telemetry-file-detail-meta">
          <span>{files.length} files parsed</span>
          <span>{combinedLaps.length} combined laps</span>
        </div>
        <div className="session-telemetry-file-starts">
          {files.map(({ file, payload }, index) => (
            <div key={file.id}>
              <strong>{index + 1}. {file.original_filename}</strong>
              <span>
                {formatRecordingStart(file)} - {countImportedLaps(payload)} laps
              </span>
            </div>
          ))}
        </div>
      </details>
    </div>
  );
}

function ChannelChart({
  emptyMessage,
  hasSourceChannel,
  missingSamplesMessage,
  onSmoothingChange,
  series,
  smoothingWindow,
  sourceUnitsSuffix,
  title,
  tooltipLabel,
  units,
}: {
  emptyMessage: string;
  hasSourceChannel: boolean;
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
      <div className="telemetry-chart-heading">
        <div className="telemetry-chart-heading-copy">
          <h2>{title}</h2>
          {hasSourceChannel ? (
            <p className="xrk-chart-note">
              Source channel spans attached recordings
              {units ? ` (${units})` : ""}
              {sourceUnitsSuffix ? `, ${sourceUnitsSuffix}` : ""}
              {smoothingWindow > 1
                ? `. Displayed as a ${smoothingWindow}-sample rolling average.`
                : ". Displayed without smoothing."}
            </p>
          ) : null}
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
      {hasSourceChannel ? (
        <TelemetryLineChart
          emptyMessage={missingSamplesMessage}
          series={series}
          tooltipLabel={tooltipLabel}
          units={units}
        />
      ) : (
        <div className="empty-state">{emptyMessage}</div>
      )}
    </section>
  );
}

function LapRangeControl({
  endIndex,
  lapCount,
  onChange,
  selectedOutsideCount,
  startIndex,
}: {
  endIndex: number;
  lapCount: number;
  onChange: (range: { endIndex: number; startIndex: number }) => void;
  selectedOutsideCount: number;
  startIndex: number;
}) {
  if (lapCount <= 18) return null;

  const startLap = startIndex + 1;
  const endLap = endIndex + 1;

  function updateRange(nextRange: number[]) {
    const [nextStartLap = startLap, nextEndLap = endLap] = nextRange;
    onChange({
      startIndex: Math.max(0, Math.min(nextStartLap - 1, lapCount - 1)),
      endIndex: Math.max(0, Math.min(nextEndLap - 1, lapCount - 1)),
    });
  }

  return (
    <div className="lap-range-control">
      <div className="lap-range-header">
        <strong>
          Showing laps {startLap}-{endLap} of {lapCount}
        </strong>
        <button
          className="secondary-button compact-button"
          type="button"
          onClick={() => onChange({ startIndex: 0, endIndex: lapCount - 1 })}
        >
          All
        </button>
      </div>
      <Slider.Root
        aria-label="Visible lap range"
        className="lap-range-slider"
        max={lapCount}
        min={1}
        minStepsBetweenThumbs={1}
        step={1}
        value={[startLap, endLap]}
        onValueChange={updateRange}
      >
        <Slider.Track className="lap-range-track">
          <Slider.Range className="lap-range-active-track" />
        </Slider.Track>
        <Slider.Thumb className="lap-range-handle" aria-label="Start lap">
          {startLap}
        </Slider.Thumb>
        <Slider.Thumb className="lap-range-handle" aria-label="End lap">
          {endLap}
        </Slider.Thumb>
      </Slider.Root>
      {selectedOutsideCount ? (
        <p>{selectedOutsideCount} selected outside the visible range.</p>
      ) : null}
    </div>
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

function buildCombinedLaps(files: TelemetryReportFile[]) {
  let globalLapIndex = 0;

  return files.flatMap(({ file, payload }, fileIndex) => {
    const laps = payload.laps ?? [];
    const lastLapIndex = laps.length - 1;

    return laps.flatMap((lap, sourceLapIndex): CombinedLap[] => {
      if (
        typeof lap.durationSeconds !== "number" ||
        !Number.isFinite(lap.durationSeconds)
      ) {
        return [];
      }

      const nextLap: CombinedLap = {
        file,
        fileIndex,
        globalLapIndex,
        isCompleteLap: sourceLapIndex > 0 && sourceLapIndex < lastLapIndex,
        label: `Lap ${globalLapIndex + 1}`,
        lap,
        payload,
        sourceLapIndex,
      };
      globalLapIndex += 1;
      return [nextLap];
    });
  });
}

function bestCompleteLap(laps: CombinedLap[]) {
  const durations = laps
    .filter((lap) => lap.isCompleteLap)
    .map((lap) => lap.lap.durationSeconds)
    .filter((duration): duration is number => typeof duration === "number");

  return durations.length ? Math.min(...durations) : null;
}

function defaultSelectedLapIndices(laps: CombinedLap[]) {
  const bestLap = laps
    .filter((lap) => lap.isCompleteLap)
    .sort(
      (first, second) =>
        (first.lap.durationSeconds ?? Infinity) -
        (second.lap.durationSeconds ?? Infinity),
    )[0];

  return bestLap ? [bestLap.globalLapIndex] : laps[0] ? [laps[0].globalLapIndex] : [];
}

function defaultLapRange(laps: CombinedLap[], selectedLapIndices: number[]) {
  const lapCount = laps.length;
  if (lapCount <= 24) {
    return {
      startIndex: 0,
      endIndex: Math.max(0, lapCount - 1),
    };
  }

  const windowSize = 20;
  const anchorIndex = selectedLapIndices[0] ?? 0;
  const halfWindow = Math.floor(windowSize / 2);
  const startIndex = Math.max(
    0,
    Math.min(anchorIndex - halfWindow, lapCount - windowSize),
  );

  return {
    startIndex,
    endIndex: Math.min(lapCount - 1, startIndex + windowSize - 1),
  };
}

function countImportedLaps(payload: XrkParseResult) {
  return (payload.laps ?? []).filter(
    (lap) =>
      typeof lap.durationSeconds === "number" &&
      Number.isFinite(lap.durationSeconds),
  ).length;
}

function buildLapTimeRows(
  laps: CombinedLap[],
  bestCompleteLapSeconds: number | null,
): LapTimeChartRow[] {
  return laps.map((combinedLap) => {
    const rpmRange = lapRpmRange(combinedLap.payload, combinedLap.lap);
    const durationSeconds = combinedLap.lap.durationSeconds ?? 0;
    const isBestCompleteLap =
      combinedLap.isCompleteLap &&
      typeof bestCompleteLapSeconds === "number" &&
      Math.abs(durationSeconds - bestCompleteLapSeconds) < 0.001;

    return {
      durationSeconds,
      isBestCompleteLap,
      isCompleteLap: combinedLap.isCompleteLap,
      lapIndex: combinedLap.globalLapIndex,
      lapLabel: combinedLap.label,
      maxRpm: rpmRange?.max ?? null,
      minRpm: rpmRange?.min ?? null,
      rpmRange: rpmRange ? [rpmRange.min, rpmRange.max] : null,
      startSeconds:
        typeof combinedLap.lap.startSeconds === "number"
          ? combinedLap.lap.startSeconds
          : null,
    };
  });
}

function buildTelemetrySeries(
  laps: CombinedLap[],
  selectedLapIndices: number[],
  channelName: string,
  smoothingWindow: number,
  convertValue: (value: number) => number = (value) => value,
): TelemetryChartSeries[] {
  return selectedLapIndices
    .map((lapIndex, seriesIndex) => {
      const combinedLap = laps.find((lap) => lap.globalLapIndex === lapIndex);
      if (!combinedLap) return null;

      const channel = findChannel(combinedLap.payload.channels, channelName);
      const rows = buildTelemetryRows(
        channel,
        combinedLap.lap,
        smoothingWindow,
        convertValue,
      );
      if (!rows.length) return null;

      return {
        color: lapSeriesColors[seriesIndex % lapSeriesColors.length],
        id: `lap-${combinedLap.globalLapIndex}`,
        label: combinedLap.label,
        rows,
      };
    })
    .filter((series): series is TelemetryChartSeries => Boolean(series));
}

function buildTelemetryRows(
  channel: XrkChannel | null,
  lap: XrkLap,
  smoothingWindow: number,
  convertValue: (value: number) => number = (value) => value,
): TelemetryChartRow[] {
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

function lapRpmRange(payload: XrkParseResult, lap: XrkLap) {
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

function hasChannel(laps: CombinedLap[], channelName: string) {
  return laps.some((lap) => findChannel(lap.payload.channels, channelName));
}

function channelUnits(laps: CombinedLap[], channelName: string) {
  for (const lap of laps) {
    const channel = findChannel(lap.payload.channels, channelName);
    if (channel?.units) return channel.units;
  }
  return "";
}

function findChannel(channels: XrkParseResult["channels"], name: string) {
  return (
    channels?.find((channel) => channel.name === name) ??
    channels?.find(
      (channel) => channel.name?.toLowerCase() === name.toLowerCase(),
    ) ??
    null
  );
}

function findRpmChannel(channels: XrkParseResult["channels"]) {
  return (
    findChannel(channels, "RPM") ??
    channels?.find((channel) => channel.name?.toLowerCase().includes("rpm")) ??
    null
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

function formatSeconds(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value)
    ? `${value.toFixed(3)}s`
    : "Not available";
}

function formatRecordingStart(file: SessionTelemetryFile) {
  if (!file.recording_started_at) return "start time not available";

  const startedAt = new Date(file.recording_started_at);
  if (Number.isNaN(startedAt.getTime())) return "start time not available";

  return startedAt.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}
