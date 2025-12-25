"use client";

import {
  BarChart as ReBarChart,
  Bar,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";

export type BarDatum = Record<string, string | number | null | undefined>;

export type BarSeries = {
  /** key in your data objects, e.g. "value" or "products" */
  dataKey: string;
  /** legend label */
  label?: string;
  /** custom color (optional) */
  color?: string;
  /** stack group id for stacked bars (e.g. "stack-1") */
  stackId?: string;
};

export type BarChartProps = {
  data: BarDatum[];
  xKey: string;
  series: BarSeries[];
  height?: number;
  showLegend?: boolean;
  showGrid?: boolean;
  layout?: "horizontal" | "vertical";
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
 * Thin wrapper around Recharts' BarChart for aggregates/breakdowns.
 * Public props are JSON-serializable only (no function props)
 * to keep Next 15 happy.
 */
export function BarChart({
  data,
  xKey,
  series,
  height = 220,
  showLegend = true,
  showGrid = true,
  layout = "horizontal",
  className,
}: BarChartProps) {
  const safeData = Array.isArray(data) ? data : [];

  if (!series.length) {
    return (
      <div
        className={`flex items-center justify-center rounded-xl border border-dashed border-[var(--border-subtle)] bg-[var(--bg-subtle)] p-3 text-[11px] text-[var(--text-muted)] sm:p-4 sm:text-xs ${className ?? ""}`}
        style={{ height }}
      >
        BarChart: no series configured.
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
          <ReBarChart
            data={safeData}
            layout={layout}
            margin={{ left: layout === "vertical" ? 18 : 0, right: 4, top: showLegend ? 2 : 0 }}
          >
            {showGrid && (
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="var(--border-subtle)"
                horizontal={layout === "horizontal"}
                vertical={layout === "horizontal"}
              />
            )}

            {layout === "horizontal" ? (
              <>
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
              </>
            ) : (
              <>
                <XAxis
                  type="number"
                  tickLine={false}
                  axisLine={false}
                  tickMargin={6}
                  tickFormatter={(v) => formatNumber(v)}
                />
                <YAxis
                  dataKey={xKey}
                  type="category"
                  tickLine={false}
                  axisLine={false}
                  width={64}
                  tickFormatter={(v) => String(v)}
                />
              </>
            )}

            <Tooltip
              cursor={{ fill: "var(--bg-subtle)" }}
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

            {series.map((s, idx) => {
              const radius: [number, number, number, number] =
                layout === "horizontal" ? [4, 4, 0, 0] : [0, 4, 4, 0];

              if (s.stackId) {
                return (
                  <Bar
                    key={s.dataKey}
                    dataKey={s.dataKey}
                    name={s.label ?? s.dataKey}
                    fill={s.color ?? chartColors[idx % chartColors.length]}
                    radius={radius}
                    stackId={s.stackId}
                  />
                );
              }

              return (
                <Bar
                  key={s.dataKey}
                  dataKey={s.dataKey}
                  name={s.label ?? s.dataKey}
                  fill={s.color ?? chartColors[idx % chartColors.length]}
                  radius={radius}
                />
              );
            })}
          </ReBarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
