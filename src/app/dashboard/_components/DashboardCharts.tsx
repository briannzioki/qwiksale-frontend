// src/app/dashboard/_components/DashboardCharts.tsx

type DashboardChartPoint = {
  date: string; // YYYY-MM-DD
  label: string; // e.g. "Dec 10"
  listings: number;
  messages: number;
};

type Props = {
  title?: string;
  description?: string;
  data: DashboardChartPoint[];
};

/**
 * DashboardCharts
 *
 * Tailwind-only dual-series bar chart (no extra libs).
 * Expects pre-aggregated daily data from the server:
 *
 *   <DashboardCharts
 *     title="Last 7 days"
 *     description="Listings created vs messages received"
 *     data={[
 *       { date: "2025-12-01", label: "Dec 1", listings: 3, messages: 5 },
 *       ...
 *     ]}
 *   />
 */
export default function DashboardCharts({
  title = "Activity (last 7 days)",
  description = "Listings created vs messages received",
  data,
}: Props) {
  if (!data || data.length === 0) return null;

  const maxValue = Math.max(
    1,
    ...data.map((d) => Math.max(d.listings || 0, d.messages || 0)),
  );

  const hasAnyActivity = data.some(
    (d) => (d.listings || 0) > 0 || (d.messages || 0) > 0,
  );

  const barHeightPct = (value: number) => {
    if (!value || value <= 0) return 0;
    // Keep a minimum height so small values are still visible
    return Math.max(10, (value / maxValue) * 100);
  };

  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold text-foreground">
              {title}
            </h2>
            {description && (
              <p className="mt-0.5 text-xs text-muted-foreground">
                {description}
              </p>
            )}
          </div>

          {/* Legend */}
          <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <span className="h-2 w-2 rounded-sm bg-brandBlue" />
              <span>Listings</span>
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="h-2 w-2 rounded-sm bg-brandGreen" />
              <span>Messages</span>
            </span>
          </div>
        </div>

        {!hasAnyActivity ? (
          <div className="flex h-32 items-center justify-center rounded-xl bg-muted/40 text-xs text-muted-foreground">
            No recent activity yet. Your listings and messages will appear
            here.
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {/* Bars */}
            <div className="flex items-end gap-2">
              {data.map((point) => {
                const listingsHeight = barHeightPct(point.listings || 0);
                const messagesHeight = barHeightPct(point.messages || 0);

                return (
                  <div key={point.date} className="min-w-0 flex-1">
                    <div className="flex h-32 items-end justify-center gap-1">
                      {/* Listings bar */}
                      <div className="relative flex-1 max-w-[0.9rem]">
                        {point.listings > 0 && (
                          <div className="absolute -top-4 left-1/2 -translate-x-1/2 text-[10px] text-muted-foreground">
                            {point.listings}
                          </div>
                        )}
                        <div className="flex h-full items-end" aria-hidden="true">
                          <div
                            className="w-full rounded-t-lg bg-brandBlue"
                            style={{ height: `${listingsHeight}%` }}
                          />
                        </div>
                      </div>

                      {/* Messages bar */}
                      <div className="relative flex-1 max-w-[0.9rem]">
                        {point.messages > 0 && (
                          <div className="absolute -top-4 left-1/2 -translate-x-1/2 text-[10px] text-muted-foreground">
                            {point.messages}
                          </div>
                        )}
                        <div className="flex h-full items-end" aria-hidden="true">
                          <div
                            className="w-full rounded-t-lg bg-brandGreen"
                            style={{ height: `${messagesHeight}%` }}
                          />
                        </div>
                      </div>
                    </div>

                    {/* X-axis label */}
                    <div className="mt-1 text-center text-[10px] text-muted-foreground">
                      {point.label}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Max hint */}
            <p className="text-[10px] text-muted-foreground">
              Peak day: {maxValue} item{maxValue === 1 ? "" : "s"} (combined).
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
