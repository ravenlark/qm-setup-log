import {
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export type LapTimeChartRow = {
  durationSeconds: number;
  isBestCompleteLap: boolean;
  isCompleteLap: boolean;
  lapIndex: number;
  lapLabel: string;
  maxRpm?: number | null;
  minRpm?: number | null;
  rpmRange?: [number, number] | null;
  startSeconds: number | null;
};

type LapTimesBarChartProps = {
  onToggleLap: (lapIndex: number) => void;
  rows: LapTimeChartRow[];
  selectedLapColors: string[];
  selectedLapIndices: number[];
};

export function LapTimesBarChart({
  onToggleLap,
  rows,
  selectedLapColors,
  selectedLapIndices,
}: LapTimesBarChartProps) {
  const hasRpmRanges = rows.some((row) => row.rpmRange);
  const lapTimeDomain = lapDurationDomain(rows);

  if (rows.length === 0) {
    return <div className="empty-state">No lap times were found in this file.</div>;
  }

  return (
    <div className="lap-chart-frame">
      <ResponsiveContainer width="100%" height={320}>
        <ComposedChart
          barGap={-33}
          barCategoryGap="22%"
          data={rows}
          margin={{ top: 22, right: 18, bottom: 8, left: 0 }}
        >
          <CartesianGrid stroke="#d8e1d6" strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="lapLabel"
            interval={0}
            minTickGap={8}
            tick={{ fill: "#405343", fontSize: 12, fontWeight: 750 }}
            tickFormatter={(value) => String(value).replace(/^Lap\s+/i, "")}
            tickLine={false}
          />
          <YAxis
            yAxisId="lapTime"
            domain={lapTimeDomain}
            tick={{ fill: "#647268", fontSize: 12, fontWeight: 650 }}
            tickFormatter={(value) => `${Number(value).toFixed(1)}s`}
            tickLine={false}
            width={58}
          />
          {hasRpmRanges ? (
            <YAxis
              yAxisId="rpm"
              domain={["dataMin - 250", "dataMax + 250"]}
              hide
              orientation="right"
            />
          ) : null}
          <Tooltip
            cursor={{ fill: "rgb(40 122 62 / 0.08)" }}
            content={<LapTooltip />}
          />
          <Bar
            background={
              <SelectionColumnBackground selectedLapIndices={selectedLapIndices} />
            }
            dataKey="durationSeconds"
            maxBarSize={48}
            onClick={(_, index) => onToggleLap(rows[index].lapIndex)}
            radius={[5, 5, 0, 0]}
            yAxisId="lapTime"
          >
            <LabelList
              dataKey="durationSeconds"
              formatter={(value: unknown) =>
                typeof value === "number" ? value.toFixed(3) : ""
              }
              position="top"
              className="lap-chart-label"
            />
            {rows.map((row) => (
              <Cell
                className="lap-chart-bar"
                fill={barFill(row, selectedLapIndices, selectedLapColors)}
                key={`${row.lapLabel}-${row.startSeconds ?? "unknown"}`}
                stroke={selectedLapIndices.includes(row.lapIndex) ? "#111827" : "none"}
                strokeWidth={selectedLapIndices.includes(row.lapIndex) ? 1 : 0}
              />
            ))}
          </Bar>
          {hasRpmRanges ? (
            <Bar
              dataKey="rpmRange"
              className="lap-chart-rpm-range"
              maxBarSize={22}
              onClick={(_, index) => onToggleLap(rows[index].lapIndex)}
              shape={<RpmRangeShape />}
              yAxisId="rpm"
            />
          ) : null}
        </ComposedChart>
      </ResponsiveContainer>
      <div className="lap-chart-legend">
        {selectedLapIndices.length ? (
          selectedLapIndices.map((lapIndex, selectedIndex) => {
            const row = rows.find((item) => item.lapIndex === lapIndex);
            return row ? (
              <span key={lapIndex}>
                <i
                  className="lap-chart-swatch"
                  style={{ background: selectedLapColors[selectedIndex] }}
                />
                {row.lapLabel}
              </span>
            ) : null;
          })
        ) : (
          <span>No laps selected</span>
        )}
      </div>
    </div>
  );
}

function LapTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload: LapTimeChartRow }>;
}) {
  if (!active || !payload?.length) return null;

  const row = payload[0].payload;
  return (
    <div className="lap-chart-tooltip">
      <strong>{row.lapLabel}</strong>
      <span>{row.durationSeconds.toFixed(3)}s</span>
      {typeof row.minRpm === "number" && typeof row.maxRpm === "number" ? (
        <span>
          RPM {Math.round(row.minRpm).toLocaleString()} -{" "}
          {Math.round(row.maxRpm).toLocaleString()}
        </span>
      ) : null}
      <small>
        {row.isCompleteLap ? "Complete lap" : "Partial lap"}
        {row.isBestCompleteLap ? " · best" : ""}
      </small>
    </div>
  );
}

function barFill(
  row: LapTimeChartRow,
  selectedLapIndices: number[],
  selectedLapColors: string[],
) {
  const selectedIndex = selectedLapIndices.indexOf(row.lapIndex);
  if (selectedIndex !== -1) return selectedLapColors[selectedIndex];
  if (row.isBestCompleteLap) return "#ed4d23";
  if (row.isCompleteLap) return "#287a3e";
  return "#8a948c";
}

function lapDurationDomain(rows: LapTimeChartRow[]): [number, number] {
  const durations = rows.map((row) => row.durationSeconds);
  const minDuration = Math.min(...durations);
  const maxDuration = Math.max(...durations);

  if (!Number.isFinite(minDuration) || !Number.isFinite(maxDuration)) {
    return [0, 1];
  }

  return [Math.max(0, minDuration - 0.25), maxDuration + 0.25];
}

function SelectionColumnBackground({
  height,
  payload,
  selectedLapIndices,
  width,
  x,
  y,
}: {
  height?: number;
  payload?: LapTimeChartRow;
  selectedLapIndices: number[];
  width?: number;
  x?: number;
  y?: number;
}) {
  if (
    !payload ||
    !selectedLapIndices.includes(payload.lapIndex) ||
    typeof x !== "number" ||
    typeof y !== "number" ||
    typeof width !== "number" ||
    typeof height !== "number" ||
    height <= 0
  ) {
    return null;
  }

  return (
    <rect
      className="lap-chart-selection-column"
      height={height}
      rx={6}
      width={width}
      x={x}
      y={y}
    />
  );
}

function RpmRangeShape({
  height,
  width,
  x,
  y,
}: {
  height?: number;
  width?: number;
  x?: number;
  y?: number;
}) {
  if (
    typeof x !== "number" ||
    typeof y !== "number" ||
    typeof width !== "number" ||
    typeof height !== "number" ||
    height <= 0
  ) {
    return null;
  }

  const centerX = x + width / 2;
  const capHalfWidth = Math.min(10, Math.max(5, width / 2));
  const topY = y;
  const bottomY = y + height;

  return (
    <g className="lap-chart-rpm-range">
      <line x1={centerX} x2={centerX} y1={topY} y2={bottomY} />
      <line
        x1={centerX - capHalfWidth}
        x2={centerX + capHalfWidth}
        y1={topY}
        y2={topY}
      />
      <line
        x1={centerX - capHalfWidth}
        x2={centerX + capHalfWidth}
        y1={bottomY}
        y2={bottomY}
      />
    </g>
  );
}
