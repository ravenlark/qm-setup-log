import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export type TelemetryChartRow = {
  distanceIntoLapFeet?: number;
  timeIntoLapSeconds: number;
  value: number;
};

type TelemetryXAxisKey = "distanceIntoLapFeet" | "timeIntoLapSeconds";

export type TelemetryChartSeries = {
  color: string;
  id: string;
  label: string;
  rows: TelemetryChartRow[];
};

type TelemetryLineChartProps = {
  emptyMessage: string;
  series: TelemetryChartSeries[];
  tooltipLabel: string;
  units: string;
  xAxisKey?: TelemetryXAxisKey;
};

export function TelemetryLineChart({
  emptyMessage,
  series,
  tooltipLabel,
  units,
  xAxisKey = "timeIntoLapSeconds",
}: TelemetryLineChartProps) {
  const chartRows = series.flatMap((item) => item.rows);
  const xAxisUnit = xAxisKey === "distanceIntoLapFeet" ? "ft" : "s";
  const xAxisLabel =
    xAxisKey === "distanceIntoLapFeet" ? "feet into lap" : "seconds into lap";

  if (chartRows.length === 0) {
    return <div className="empty-state">{emptyMessage}</div>;
  }

  return (
    <div className="telemetry-chart-frame">
      <ResponsiveContainer width="100%" height={320}>
        <LineChart
          data={chartRows}
          margin={{ top: 18, right: 18, bottom: 8, left: 0 }}
        >
          <CartesianGrid stroke="#d8e1d6" strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey={xAxisKey}
            tick={{ fill: "#405343", fontSize: 12, fontWeight: 750 }}
            tickFormatter={(value) =>
              `${Number(value).toFixed(xAxisKey === "distanceIntoLapFeet" ? 0 : 1)}${xAxisUnit}`
            }
            tickLine={false}
            type="number"
          />
          <YAxis
            tick={{ fill: "#647268", fontSize: 12, fontWeight: 650 }}
            tickFormatter={(value) => `${Number(value).toFixed(1)}${units}`}
            tickLine={false}
            width={58}
          />
          <ReferenceLine y={0} stroke="#8a948c" strokeDasharray="4 4" />
          <Tooltip
            cursor={{ stroke: "#287a3e", strokeDasharray: "4 4" }}
            content={
              <TelemetryTooltip
                series={series}
                tooltipLabel={tooltipLabel}
                units={units}
                xAxisKey={xAxisKey}
                xAxisLabel={xAxisLabel}
                xAxisUnit={xAxisUnit}
              />
            }
          />
          {series.map((item) => (
            <Line
              data={item.rows}
              dataKey="value"
              dot={false}
              isAnimationActive={false}
              key={item.id}
              name={item.label}
              stroke={item.color}
              strokeWidth={2}
              type="monotone"
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
      <div className="telemetry-chart-legend">
        {series.map((item) => (
          <span key={item.id}>
            <i style={{ background: item.color }} />
            {item.label}
          </span>
        ))}
      </div>
    </div>
  );
}

function TelemetryTooltip({
  active,
  payload,
  series,
  tooltipLabel,
  units,
  xAxisKey,
  xAxisLabel,
  xAxisUnit,
}: {
  active?: boolean;
  payload?: Array<{
    color?: string;
    name?: string;
    payload: TelemetryChartRow;
    value?: number;
  }>;
  series: TelemetryChartSeries[];
  tooltipLabel: string;
  units: string;
  xAxisKey: TelemetryXAxisKey;
  xAxisLabel: string;
  xAxisUnit: string;
}) {
  if (!active || !payload?.length) return null;

  const row = payload[0].payload;
  const hoverXValue = telemetryRowXAxisValue(row, xAxisKey);
  if (hoverXValue === null) return null;

  const seriesRows = series
    .map((item) => {
      const nearestRow = nearestTelemetryRow(item.rows, hoverXValue, xAxisKey);
      if (!nearestRow) return null;

      return {
        color: item.color,
        label: item.label,
        value: nearestRow.value,
      };
    })
    .filter(
      (
        item,
      ): item is {
        color: string;
        label: string;
        value: number;
      } => Boolean(item),
    );

  return (
    <div className="lap-chart-tooltip">
      <strong>
        {hoverXValue.toFixed(xAxisKey === "distanceIntoLapFeet" ? 1 : 3)}
        {xAxisUnit} {xAxisLabel}
      </strong>
      {seriesRows.map((item) => (
        <span className="telemetry-tooltip-row" key={item.label}>
          <i style={{ background: item.color }} />
          {item.label}: {item.value.toFixed(3)}
          {units}
        </span>
      ))}
      <small>{tooltipLabel}</small>
    </div>
  );
}

function nearestTelemetryRow(
  rows: TelemetryChartRow[],
  hoverXValue: number,
  xAxisKey: TelemetryXAxisKey,
) {
  if (!rows.length) return null;

  let nearestRow: TelemetryChartRow | null = null;
  let nearestDistance = Infinity;

  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    const rowXValue = telemetryRowXAxisValue(row, xAxisKey);
    if (rowXValue === null) continue;

    const distance = Math.abs(rowXValue - hoverXValue);
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearestRow = row;
    }
  }

  return nearestRow;
}

function telemetryRowXAxisValue(
  row: TelemetryChartRow,
  xAxisKey: TelemetryXAxisKey,
) {
  const value = row[xAxisKey];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
