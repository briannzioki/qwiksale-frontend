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

export type LineDatum = Record<string, string | number | null | undefined>;

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

/**
 * Token-first series colors (no hardcoded hex).
 * If your theme defines --chart-1..--chart-5, those will be used.
 * Otherwise we fall back to the core tokens to stay readable in light/dark.
 */
const chartColors = [
  "var(--chart-1, var(--text))",
  "var(--chart-2, var(--text-muted))",
  "var(--chart-3, var(--border))",
  "var(--chart-4, var(--text))",
  "var(--chart-5, var(--text-muted))",
] as const;

function formatNumber(value: unknown): string {
  const num =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value)
        : NaN;

  if (!Number.isFinite(num)) return String(value ?? "-");
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
        className={`flex items-center justify-center rounded-xl border border-dashed border-[var(--border-subtle)] bg-[var(--bg-subtle)] p-3 text-[11px] text-[var(--text-muted)] sm:p-4 sm:text-xs ${className ?? ""}`}
        style={{ height }}
      >
        LineChart: no series configured.
      </div>
    );
  }

  return (
    <div
      className={`relative w-full overflow-hidden rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-2.5 text-[11px] text-[var(--text)] shadow-soft sm:p-3 sm:text-xs ${className ?? ""}`}
      style={{ height }}
    >
      {safeData.length === 0 ? (
        <div className="flex h-full items-center justify-center text-[11px] text-[var(--text-muted)]">
          No data
        </div>
      ) : (
        <ResponsiveContainer width="100%" height="100%">
          <ReLineChart data={safeData} margin={{ right: 4, top: showLegend ? 2 : 0 }}>
            {showGrid && (
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" />
            )}
            <XAxis
              dataKey={xKey}
              tickLine={false}
              axisLine={false}
              tickMargin={6}
              tickFormatter={(v) => String(v)}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              tickMargin={6}
              width={44}
              tickFormatter={(v) => formatNumber(v)}
            />
            <Tooltip
              cursor={{ stroke: "var(--border)", strokeWidth: 1 }}
              contentStyle={{
                borderRadius: 12,
                border: "1px solid var(--border)",
                background: "var(--bg-elevated)",
                color: "var(--text)",
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
                height={20}
                iconType="circle"
                wrapperStyle={{
                  paddingBottom: 2,
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
                stroke={s.color ?? chartColors[idx % chartColors.length]}
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
