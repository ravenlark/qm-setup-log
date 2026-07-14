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
  timeIntoLapSeconds: number;
  value: number;
};

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
};

export function TelemetryLineChart({
  emptyMessage,
  series,
  tooltipLabel,
  units,
}: TelemetryLineChartProps) {
  const chartRows = series.flatMap((item) => item.rows);

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
            dataKey="timeIntoLapSeconds"
            tick={{ fill: "#405343", fontSize: 12, fontWeight: 750 }}
            tickFormatter={(value) => `${Number(value).toFixed(1)}s`}
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
}) {
  if (!active || !payload?.length) return null;

  const row = payload[0].payload;
  const hoverSeconds = row.timeIntoLapSeconds;
  const seriesRows = series
    .map((item) => {
      const nearestRow = nearestTelemetryRow(item.rows, hoverSeconds);
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
      <strong>{hoverSeconds.toFixed(3)}s into lap</strong>
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

function nearestTelemetryRow(rows: TelemetryChartRow[], hoverSeconds: number) {
  if (!rows.length) return null;

  let nearestRow = rows[0];
  let nearestDistance = Math.abs(rows[0].timeIntoLapSeconds - hoverSeconds);

  for (let index = 1; index < rows.length; index += 1) {
    const row = rows[index];
    const distance = Math.abs(row.timeIntoLapSeconds - hoverSeconds);
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearestRow = row;
    }
  }

  return nearestRow;
}
