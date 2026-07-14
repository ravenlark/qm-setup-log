import { FileJson, FileUp, Loader2 } from "lucide-react";
import { useMemo, useState } from "react";
import {
  TelemetryLineChart,
  type TelemetryChartSeries,
  type TelemetryChartRow,
} from "./telemetry/TelemetryLineChart";
import {
  LapTimesBarChart,
  type LapTimeChartRow,
} from "./telemetry/LapTimesBarChart";

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

type XrkParseResult = {
  channels?: XrkChannel[];
  channelSummary?: XrkChannel[];
  derived?: {
    averageRpm?: number | null;
    bestCompleteLapSeconds?: number | null;
    completeLapCount?: number | null;
    maxRpm?: number | null;
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

const parserUrl = import.meta.env.DEV
  ? "http://127.0.0.1:3015/api/telemetry/parse?includeSamples=true&maxSamples=5000"
  : "/api/telemetry/parse?includeSamples=true&maxSamples=5000";
const metersPerSecondToMph = 2.2369362921;
const accelerationSmoothingOptions = [
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

export function XrkUploadTestView() {
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<XrkParseResult | null>(null);
  const [rawResult, setRawResult] = useState("");
  const [error, setError] = useState("");
  const [isParsing, setIsParsing] = useState(false);
  const [selectedLapIndices, setSelectedLapIndices] = useState<number[]>([]);
  const [accelerationSmoothingWindow, setAccelerationSmoothingWindow] =
    useState(17);
  const [lateralGripSmoothingWindow, setLateralGripSmoothingWindow] =
    useState(17);
  const [lateralAccelerationSmoothingWindow, setLateralAccelerationSmoothingWindow] =
    useState(17);
  const [gpsSpeedSmoothingWindow, setGpsSpeedSmoothingWindow] = useState(1);

  const topChannels = useMemo(() => {
    return [...(result?.channelSummary ?? [])]
      .sort((first, second) => (second.sampleCount ?? 0) - (first.sampleCount ?? 0))
      .slice(0, 12);
  }, [result?.channelSummary]);
  const lapTimeRows = useMemo(() => {
    return buildLapTimeRows(result?.laps, result?.derived?.bestCompleteLapSeconds);
  }, [result?.derived?.bestCompleteLapSeconds, result?.laps]);
  const accelerationChannel = useMemo(() => {
    return findChannel(result?.channels, "GPS_InlineAcc");
  }, [result?.channels]);
  const lateralGripChannel = useMemo(() => {
    return findChannel(result?.channels, "Lateral Grip");
  }, [result?.channels]);
  const lateralAccelerationChannel = useMemo(() => {
    return findChannel(result?.channels, "GPS_LateralAcc");
  }, [result?.channels]);
  const gpsSpeedChannel = useMemo(() => {
    return findChannel(result?.channels, "GPS Speed");
  }, [result?.channels]);
  const selectedLapColors = useMemo(() => {
    return selectedLapIndices.map(
      (_, index) => lapSeriesColors[index % lapSeriesColors.length],
    );
  }, [selectedLapIndices]);
  const accelerationSeries = useMemo(() => {
    return buildTelemetrySeries(
      accelerationChannel,
      result?.laps,
      selectedLapIndices,
      accelerationSmoothingWindow,
    );
  }, [
    accelerationChannel,
    accelerationSmoothingWindow,
    result?.laps,
    selectedLapIndices,
  ]);
  const lateralGripSeries = useMemo(() => {
    return buildTelemetrySeries(
      lateralGripChannel,
      result?.laps,
      selectedLapIndices,
      lateralGripSmoothingWindow,
    );
  }, [
    lateralGripChannel,
    lateralGripSmoothingWindow,
    result?.laps,
    selectedLapIndices,
  ]);
  const lateralAccelerationSeries = useMemo(() => {
    return buildTelemetrySeries(
      lateralAccelerationChannel,
      result?.laps,
      selectedLapIndices,
      lateralAccelerationSmoothingWindow,
    );
  }, [
    lateralAccelerationChannel,
    lateralAccelerationSmoothingWindow,
    result?.laps,
    selectedLapIndices,
  ]);
  const gpsSpeedSeries = useMemo(() => {
    return buildTelemetrySeries(
      gpsSpeedChannel,
      result?.laps,
      selectedLapIndices,
      gpsSpeedSmoothingWindow,
      convertGpsSpeedToMph,
    );
  }, [
    gpsSpeedChannel,
    gpsSpeedSmoothingWindow,
    result?.laps,
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

  async function parseFile() {
    if (!file) {
      setError("Choose an XRK file first.");
      return;
    }

    setIsParsing(true);
    setError("");
    setResult(null);
    setRawResult("");

    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch(parserUrl, {
        method: "POST",
        body: formData,
      });
      const responseText = await response.text();
      let payload: unknown = responseText;

      try {
        payload = JSON.parse(responseText);
      } catch {
        // Keep non-JSON responses visible for local Vercel/dev-server debugging.
      }

      if (!response.ok) {
        const message =
          typeof payload === "object" && payload && "error" in payload
            ? String((payload as { error: unknown }).error)
            : `Parser returned ${response.status}.`;
        throw new Error(message);
      }

      const parsedPayload = payload as XrkParseResult;
      const defaultLapSelection = defaultSelectedLapIndices(
        parsedPayload.laps,
        parsedPayload.derived?.bestCompleteLapSeconds,
      );
      setResult(parsedPayload);
      setSelectedLapIndices(defaultLapSelection);
      setRawResult(JSON.stringify(payload, null, 2));
    } catch (parseError) {
      setError(
        parseError instanceof Error
          ? parseError.message
          : "XRK parsing failed.",
      );
    } finally {
      setIsParsing(false);
    }
  }

  return (
    <div className="xrk-test-layout">
      <section className="panel xrk-test-panel">
        <div className="panel-header">
          <div>
            <span className="eyebrow">Temporary Test Route</span>
            <h2>Upload an XRK file</h2>
          </div>
        </div>

        <div className="xrk-upload-dropzone">
          <FileUp size={28} />
          <label>
            XRK file
            <input
              accept=".xrk,.xrz"
              type="file"
              onChange={(event) => {
                setFile(event.target.files?.[0] ?? null);
                setError("");
              }}
            />
          </label>
          <p>
            {file
              ? `${file.name} (${formatBytes(file.size)})`
              : "Choose a local MyChron file to send to the parser."}
          </p>
        </div>

        <div className="button-row">
          <button
            className="primary-button"
            disabled={!file || isParsing}
            type="button"
            onClick={parseFile}
          >
            {isParsing ? <Loader2 className="spin-icon" size={17} /> : <FileJson size={17} />}
            {isParsing ? "Parsing" : "Parse file"}
          </button>
        </div>

        {error ? <p className="auth-error">{error}</p> : null}
      </section>

      {result ? (
        <>
          <section className="status-grid compact">
            <MetricCard
              label="Best Complete Lap"
              value={formatSeconds(result.derived?.bestCompleteLapSeconds)}
            />
            <MetricCard
              label="Laps"
              value={`${result.derived?.completeLapCount ?? 0} / ${result.derived?.totalLaps ?? 0}`}
            />
            <MetricCard
              label="Max RPM"
              value={formatNumber(result.derived?.maxRpm)}
            />
          </section>

          <section className="panel xrk-test-panel">
            <div className="panel-header">
              <div>
                <span className="eyebrow">Parsed File</span>
                <h2>{result.file?.originalName ?? result.file?.name ?? "XRK file"}</h2>
              </div>
            </div>
            <div className="xrk-detail-grid">
              <Detail label="Size" value={formatBytes(result.file?.sizeBytes)} />
              <Detail label="SHA-256" value={result.file?.sha256 ?? "Not available"} />
              <Detail
                label="Channels"
                value={String(result.channelSummary?.length ?? 0)}
              />
              <Detail
                label="Average RPM"
                value={formatNumber(result.derived?.averageRpm)}
              />
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

          <section className="panel xrk-test-panel">
            <div className="panel-header">
              <div>
                <span className="eyebrow">Acceleration</span>
                <h2>Inline acceleration by lap</h2>
              </div>
              <div className="xrk-chart-controls">
                  <label>
                    Smoothing
                    <select
                      value={accelerationSmoothingWindow}
                      onChange={(event) =>
                        setAccelerationSmoothingWindow(Number(event.target.value))
                      }
                    >
                      {accelerationSmoothingOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
              </div>
            </div>
            {accelerationChannel ? (
              <>
                <p className="xrk-chart-note">
                  Source channel: {accelerationChannel.name}
                  {accelerationChannel.units ? ` (${accelerationChannel.units})` : ""}
                  {accelerationSmoothingWindow > 1
                    ? `. Displayed as a ${accelerationSmoothingWindow}-sample rolling average.`
                    : ". Displayed without smoothing."}
                </p>
                <TelemetryLineChart
                  emptyMessage="No acceleration samples were found for the selected lap."
                  series={accelerationSeries}
                  tooltipLabel="Inline acceleration"
                  units={accelerationChannel.units ?? ""}
                />
              </>
            ) : (
              <div className="empty-state">
                No GPS_InlineAcc channel was found in this file.
              </div>
            )}
          </section>

          <section className="panel xrk-test-panel">
            <div className="panel-header">
              <div>
                <span className="eyebrow">GPS Speed</span>
                <h2>GPS speed by lap</h2>
              </div>
              <div className="xrk-chart-controls">
                  <label>
                    Smoothing
                    <select
                      value={gpsSpeedSmoothingWindow}
                      onChange={(event) =>
                        setGpsSpeedSmoothingWindow(Number(event.target.value))
                      }
                    >
                      {accelerationSmoothingOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
              </div>
            </div>
            {gpsSpeedChannel ? (
              <>
                <p className="xrk-chart-note">
                  Source channel: {gpsSpeedChannel.name}
                  {gpsSpeedChannel.units
                    ? ` (${gpsSpeedChannel.units}, displayed as mph)`
                    : " (displayed as mph)"}
                  {gpsSpeedSmoothingWindow > 1
                    ? `. Displayed as a ${gpsSpeedSmoothingWindow}-sample rolling average.`
                    : ". Displayed without smoothing."}
                </p>
                <TelemetryLineChart
                  emptyMessage="No GPS speed samples were found for the selected lap."
                  series={gpsSpeedSeries}
                  tooltipLabel="GPS speed"
                  units="mph"
                />
              </>
            ) : (
              <div className="empty-state">
                No GPS Speed channel was found in this file.
              </div>
            )}
          </section>

          <section className="panel xrk-test-panel">
            <div className="panel-header">
              <div>
                <span className="eyebrow">Lateral Grip</span>
                <h2>Lateral grip by lap</h2>
              </div>
              <div className="xrk-chart-controls">
                  <label>
                    Smoothing
                    <select
                      value={lateralGripSmoothingWindow}
                      onChange={(event) =>
                        setLateralGripSmoothingWindow(Number(event.target.value))
                      }
                    >
                      {accelerationSmoothingOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
              </div>
            </div>
            {lateralGripChannel ? (
              <>
                <p className="xrk-chart-note">
                  Source channel: {lateralGripChannel.name}
                  {lateralGripChannel.units ? ` (${lateralGripChannel.units})` : ""}
                  {lateralGripSmoothingWindow > 1
                    ? `. Displayed as a ${lateralGripSmoothingWindow}-sample rolling average.`
                    : ". Displayed without smoothing."}
                </p>
                <TelemetryLineChart
                  emptyMessage="No lateral grip samples were found for the selected lap."
                  series={lateralGripSeries}
                  tooltipLabel="Lateral grip"
                  units={lateralGripChannel.units ?? ""}
                />
              </>
            ) : (
              <div className="empty-state">
                No Lateral Grip channel was found in this file.
              </div>
            )}
          </section>

          <section className="panel xrk-test-panel">
            <div className="panel-header">
              <div>
                <span className="eyebrow">Lateral Acceleration</span>
                <h2>Lateral acceleration by lap</h2>
              </div>
              <div className="xrk-chart-controls">
                  <label>
                    Smoothing
                    <select
                      value={lateralAccelerationSmoothingWindow}
                      onChange={(event) =>
                        setLateralAccelerationSmoothingWindow(
                          Number(event.target.value),
                        )
                      }
                    >
                      {accelerationSmoothingOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
              </div>
            </div>
            {lateralAccelerationChannel ? (
              <>
                <p className="xrk-chart-note">
                  Source channel: {lateralAccelerationChannel.name}
                  {lateralAccelerationChannel.units
                    ? ` (${lateralAccelerationChannel.units})`
                    : ""}
                  {lateralAccelerationSmoothingWindow > 1
                    ? `. Displayed as a ${lateralAccelerationSmoothingWindow}-sample rolling average.`
                    : ". Displayed without smoothing."}
                </p>
                <TelemetryLineChart
                  emptyMessage="No lateral acceleration samples were found for the selected lap."
                  series={lateralAccelerationSeries}
                  tooltipLabel="Lateral acceleration"
                  units={lateralAccelerationChannel.units ?? ""}
                />
              </>
            ) : (
              <div className="empty-state">
                No GPS_LateralAcc channel was found in this file.
              </div>
            )}
          </section>

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
                  {(result.laps ?? []).map((lap) => (
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

          <section className="panel xrk-test-panel">
            <div className="panel-header">
              <div>
                <span className="eyebrow">Raw Payload</span>
                <h2>Parser JSON</h2>
              </div>
            </div>
            <pre className="xrk-json-output">{rawResult}</pre>
          </section>
        </>
      ) : (
        <div className="empty-state">Parsed XRK results will appear here.</div>
      )}
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
      const rows = buildTelemetryRows(
        channel,
        lap,
        smoothingWindow,
        convertValue,
      );
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
          const acceleration = sample.value;
          if (
            typeof timeSeconds !== "number" ||
            typeof acceleration !== "number" ||
            !Number.isFinite(timeSeconds) ||
            !Number.isFinite(acceleration) ||
            timeSeconds < startSeconds ||
            timeSeconds > endSeconds
          ) {
            return null;
          }

        return {
          value: convertValue(acceleration),
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

function smoothTelemetryRows(
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
