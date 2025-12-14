// src/app/components/charts/BarChart.tsx
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

export type BarDatum = Record<
  string,
  string | number | null | undefined
>;

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

const barColors = [
  "#161748",
  "#39a0ca",
  "#478559",
  "#f97316",
  "#e11d48",
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
        className={`flex items-center justify-center rounded-xl border border-dashed border-border bg-card/60 p-4 text-xs text-muted-foreground ${className ?? ""}`}
        style={{ height }}
      >
        BarChart: no series configured.
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
          <ReBarChart
            data={safeData}
            layout={layout}
            margin={{ left: layout === "vertical" ? 24 : 0 }}
          >
            {showGrid && (
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="hsl(var(--border))"
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
              </>
            ) : (
              <>
                <XAxis
                  type="number"
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                  tickFormatter={(v) => formatNumber(v)}
                />
                <YAxis
                  dataKey={xKey}
                  type="category"
                  tickLine={false}
                  axisLine={false}
                  width={72}
                  tickFormatter={(v) => String(v)}
                />
              </>
            )}

            <Tooltip
              cursor={{ fill: "hsla(var(--muted),0.4)" }}
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

            {series.map((s, idx) => {
              const radius: [number, number, number, number] =
                layout === "horizontal"
                  ? [4, 4, 0, 0]
                  : [0, 4, 4, 0];

              if (s.stackId) {
                return (
                  <Bar
                    key={s.dataKey}
                    dataKey={s.dataKey}
                    name={s.label ?? s.dataKey}
                    fill={s.color ?? barColors[idx % barColors.length]}
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
                  fill={s.color ?? barColors[idx % barColors.length]}
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
