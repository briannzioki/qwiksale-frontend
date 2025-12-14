// src/app/components/charts/LineChart.tsx
"use client";

import {
  LineChart as ReLineChart,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";

export type LineDatum = Record<
  string,
  string | number | null | undefined
>;

export type LineSeries = {
  /** key in your data objects, e.g. "users" */
  dataKey: string;
  /** human-readable legend label */
  label?: string;
  /** optional custom color; falls back to brand palette */
  color?: string;
  /** stroke width in px (default 2) */
  strokeWidth?: number;
};

export type LineChartProps = {
  /** array of data points, e.g. [{ date: "2025-01-01", users: 12, products: 3 }] */
  data: LineDatum[];
  /** key used for the x-axis, e.g. "date" */
  xKey: string;
  /** series to draw as individual lines */
  series: LineSeries[];
  /** fixed height in px (default 220) */
  height?: number;
  /** show legend (default true) */
  showLegend?: boolean;
  /** show grid lines (default true) */
  showGrid?: boolean;
  /** extra classes for outer container */
  className?: string;
};

const brandLineColors = [
  "#161748", // navy
  "#39a0ca", // blue
  "#478559", // green
  "#f97316", // orange
  "#e11d48", // rose
];

function formatNumber(value: unknown): string {
  const num =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value)
        : NaN;

  if (!Number.isFinite(num)) return String(value ?? "—");
  try {
    return num.toLocaleString("en-KE");
  } catch {
    return String(num);
  }
}

/**
 * Thin wrapper around Recharts' LineChart for time-series metrics.
 * Note: public props are JSON-serializable only (no function props)
 * to keep Next 15 happy at the RSC boundary.
 */
export function LineChart({
  data,
  xKey,
  series,
  height = 220,
  showLegend = true,
  showGrid = true,
  className,
}: LineChartProps) {
  const safeData = Array.isArray(data) ? data : [];

  if (!series.length) {
    return (
      <div
        className={`flex items-center justify-center rounded-xl border border-dashed border-border bg-card/60 p-4 text-xs text-muted-foreground ${className ?? ""}`}
        style={{ height }}
      >
        LineChart: no series configured.
      </div>
    );
  }

  return (
    <div
      className={`relative w-full overflow-hidden rounded-xl bg-card/80 p-3 text-xs shadow-sm ring-1 ring-border/70 ${className ?? ""}`}
      style={{ height }}
    >
      {safeData.length === 0 ? (
        <div className="flex h-full items-center justify-center text-[11px] text-muted-foreground">
          No data
        </div>
      ) : (
        <ResponsiveContainer width="100%" height="100%">
          <ReLineChart data={safeData}>
            {showGrid && (
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="hsl(var(--border))"
              />
            )}
            <XAxis
              dataKey={xKey}
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              tickFormatter={(v) => String(v)}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              width={48}
              tickFormatter={(v) => formatNumber(v)}
            />
            <Tooltip
              cursor={{ stroke: "hsl(var(--border))", strokeWidth: 1 }}
              contentStyle={{
                borderRadius: 8,
                border: "1px solid hsl(var(--border))",
                background: "hsl(var(--card))",
                fontSize: 11,
              }}
              labelStyle={{
                fontWeight: 600,
                marginBottom: 4,
              }}
              formatter={(value: any, name: any) => {
                return [formatNumber(value), String(name)];
              }}
            />
            {showLegend && (
              <Legend
                verticalAlign="top"
                height={24}
                iconType="circle"
                wrapperStyle={{
                  paddingBottom: 4,
                  fontSize: 11,
                }}
              />
            )}
            {series.map((s, idx) => (
              <Line
                key={s.dataKey}
                type="monotone"
                dataKey={s.dataKey}
                name={s.label ?? s.dataKey}
                stroke={
                  s.color ?? brandLineColors[idx % brandLineColors.length]
                }
                strokeWidth={s.strokeWidth ?? 2}
                dot={{ r: 2 }}
                activeDot={{ r: 4 }}
              />
            ))}
          </ReLineChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
