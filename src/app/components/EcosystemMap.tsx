// src/app/components/EcosystemMap.tsx
"use client";

import * as React from "react";

type NodeKey = "products" | "services" | "requests" | "delivery" | "admin";

type EcosystemNode = {
  key: NodeKey;
  title: string;
  desc: string;
  metricLabel: string;
};

type Callout = {
  n: string; // "01".."08"
  label: string;
};

function cn(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

const card =
  "rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] shadow-soft";

const innerCard =
  "rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg)] shadow-sm";

const chip =
  "inline-flex items-center rounded-full border border-[var(--border-subtle)] bg-[var(--bg-subtle)] " +
  "px-2 py-1 text-[11px] font-semibold text-[var(--text)] shadow-sm";

const nodes: readonly EcosystemNode[] = [
  {
    key: "products",
    title: "Marketplace",
    desc: "Products people can buy/sell.",
    metricLabel: "+1.2k /wk",
  },
  {
    key: "services",
    title: "Services",
    desc: "Jobs and offers near you.",
    metricLabel: "4.8★ avg",
  },
  {
    key: "requests",
    title: "Requests",
    desc: "Buyer needs and gigs.",
    metricLabel: "92% seen",
  },
  {
    key: "delivery",
    title: "Delivery",
    desc: "Carriers near you/store.",
    metricLabel: "6m avg",
  },
  {
    key: "admin",
    title: "Trust & Admin",
    desc: "Moderation + enforcement.",
    metricLabel: "low risk",
  },
] as const;

const callouts: readonly Callout[] = [
  { n: "01", label: "Create account + profile" },
  { n: "02", label: "Browse listings" },
  { n: "03", label: "Chat to confirm details" },
  { n: "04", label: "Meet safe or request delivery" },
  { n: "05", label: "Carrier accepts + completes" },
  { n: "06", label: "Review after transaction" },
  { n: "07", label: "Report suspicious activity" },
  { n: "08", label: "Admin moderates + enforces" },
] as const;

function NodeIcon({ kind }: { kind: NodeKey }) {
  const cls = "h-4 w-4";
  if (kind === "products") {
    return (
      <svg viewBox="0 0 24 24" className={cls} fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
        <path d="M7 7h10v10H7z" />
        <path d="M7 7l5-3 5 3" />
        <path d="M7 12h10" />
      </svg>
    );
  }
  if (kind === "services") {
    return (
      <svg viewBox="0 0 24 24" className={cls} fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
        <path d="M14 7l3 3-7 7H7v-3l7-7Z" />
        <path d="M13 8l3 3" />
      </svg>
    );
  }
  if (kind === "requests") {
    return (
      <svg viewBox="0 0 24 24" className={cls} fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
        <path d="M7 3h10a2 2 0 0 1 2 2v14.5a1.5 1.5 0 0 1-2.4 1.2l-3.7-2.78a1.5 1.5 0 0 0-1.8 0l-3.7 2.78A1.5 1.5 0 0 1 5 19.5V5a2 2 0 0 1 2-2Z" />
        <path d="M9.5 8.5h6" />
        <path d="M9.5 12.5h7" />
      </svg>
    );
  }
  if (kind === "delivery") {
    return (
      <svg viewBox="0 0 24 24" className={cls} fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
        <path d="M4 7h11v10H4z" />
        <path d="M15 10h4l1 2v5h-5v-7Z" />
        <path d="M7 17a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3Z" />
        <path d="M17 17a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3Z" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" className={cls} fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <path d="M12 2 4 5v6c0 5 3.4 9.7 8 11 4.6-1.3 8-6 8-11V5l-8-3Z" />
      <path d="M9 12l2 2 4-4" />
    </svg>
  );
}

function MetricBadge({ label }: { label: string }) {
  return (
    <span className={cn(chip, "gap-1")}>
      <span
        className="inline-block h-1.5 w-1.5 rounded-full bg-[var(--accent)]"
        aria-hidden="true"
      />
      <span className="text-[11px] font-semibold text-[var(--text)]">{label}</span>
    </span>
  );
}

export default function EcosystemMap({
  className,
  title = "The QwikSale ecosystem",
  subtitle = "Everything connects: browse, request, deliver, review, and build trust.",
}: {
  className?: string;
  title?: string;
  subtitle?: string;
}) {
  return (
    <section className={cn("space-y-3 sm:space-y-4", className)} aria-label="Ecosystem map">
      <details className={cn(card, "group")} aria-label="Ecosystem map collapsible">
        <summary
          className={cn(
            "cursor-pointer list-none rounded-2xl p-4 sm:p-5",
            "focus-visible:outline-none focus-visible:ring-2 ring-focus",
          )}
          aria-label="Toggle ecosystem map"
        >
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                Ecosystem map
              </p>
              <h2 className="mt-1 text-lg font-extrabold tracking-tight text-[var(--text)] sm:text-xl">
                {title}
              </h2>
              <p className="mt-1 text-sm text-[var(--text-muted)]">{subtitle}</p>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-[var(--text)] group-open:hidden">Open</span>
              <span className="text-xs font-semibold text-[var(--text)] hidden group-open:inline">Close</span>
              <span
                className={cn(
                  "inline-flex h-9 w-9 items-center justify-center rounded-xl border",
                  "border-[var(--border-subtle)] bg-[var(--bg)] text-[var(--text)] shadow-sm",
                )}
                aria-hidden="true"
                title="Toggle"
              >
                +
              </span>
            </div>
          </div>
        </summary>

        <div className="px-4 pb-4 sm:px-5 sm:pb-5">
          <div
            className={cn(
              "relative overflow-hidden rounded-2xl border border-[var(--border-subtle)]",
              "bg-[var(--bg)] p-4 shadow-sm",
            )}
            aria-label="Ecosystem network diagram"
          >
            <div
              className="pointer-events-none absolute inset-0 opacity-[0.12]"
              aria-hidden="true"
              style={{
                backgroundImage:
                  "linear-gradient(to right, rgba(255,255,255,0.08) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.08) 1px, transparent 1px)",
                backgroundSize: "28px 28px",
              }}
            />

            <svg
              className="pointer-events-none absolute inset-0 opacity-[0.14]"
              viewBox="0 0 1200 520"
              preserveAspectRatio="none"
              aria-hidden="true"
            >
              <path
                d="M0,180 C180,120 280,260 460,210 C640,160 740,60 920,120 C1060,166 1120,240 1200,200 L1200,520 L0,520 Z"
                fill="currentColor"
                opacity="0.08"
              />
              <path
                d="M0,240 C220,310 320,150 520,220 C720,290 860,340 1040,260 C1120,224 1160,210 1200,230 L1200,520 L0,520 Z"
                fill="currentColor"
                opacity="0.06"
              />
            </svg>

            <svg
              className="pointer-events-none absolute inset-0"
              viewBox="0 0 1000 520"
              preserveAspectRatio="none"
              aria-hidden="true"
            >
              <defs>
                <marker id="qsArrow" markerWidth="10" markerHeight="10" refX="8" refY="5" orient="auto">
                  <path d="M0,0 L10,5 L0,10 Z" fill="rgba(255,255,255,0.35)" />
                </marker>
              </defs>

              <path d="M180,160 C320,90 420,120 520,170" fill="none" stroke="rgba(255,255,255,0.22)" strokeWidth="2" />
              <path d="M520,170 C650,240 710,280 820,240" fill="none" stroke="rgba(255,255,255,0.22)" strokeWidth="2" />
              <path d="M520,170 C520,290 520,320 520,390" fill="none" stroke="rgba(255,255,255,0.22)" strokeWidth="2" />
              <path
                d="M820,240 C720,340 640,420 520,390"
                fill="none"
                stroke="rgba(255,255,255,0.22)"
                strokeWidth="2"
                markerEnd="url(#qsArrow)"
              />
            </svg>

            <div className="relative grid grid-cols-1 gap-3 sm:gap-4 lg:grid-cols-5">
              {nodes.map((n) => (
                <div
                  key={n.key}
                  className={cn(innerCard, "p-3 sm:p-4", "relative")}
                  aria-label={`${n.title} node`}
                >
                  <div
                    className="pointer-events-none absolute -inset-1 rounded-2xl opacity-[0.22]"
                    aria-hidden="true"
                    style={{
                      background:
                        "radial-gradient(closest-side, rgba(57,160,202,0.20), transparent 70%)",
                    }}
                  />

                  <div className="relative flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span
                          className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] text-[var(--text)] shadow-sm"
                          aria-hidden="true"
                        >
                          <NodeIcon kind={n.key} />
                        </span>
                        <div className="min-w-0">
                          <div className="truncate text-sm font-extrabold tracking-tight text-[var(--text)]">
                            {n.title}
                          </div>
                          <div className="truncate text-[11px] text-[var(--text-muted)]">
                            {n.desc}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="relative mt-3">
                    <MetricBadge label={n.metricLabel} />
                  </div>
                </div>
              ))}
            </div>

            <div className="relative mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-wrap items-center gap-2">
                <span className={chip}>Browse</span>
                <span className={chip}>Chat</span>
                <span className={chip}>Meet safe</span>
                <span className={chip}>Deliver</span>
                <span className={chip}>Review</span>
                <span className={chip}>Trust</span>
              </div>

              <div className="text-[11px] text-[var(--text-muted)] sm:text-xs">
                Flow: Browse, Chat, Pay or meet safe, Deliver, Review, Trust score
              </div>
            </div>

            <div className="relative mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4" aria-label="Callouts">
              {callouts.map((c) => (
                <div
                  key={c.n}
                  className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-3 py-2 text-xs text-[var(--text)] shadow-sm"
                >
                  <span className="mr-2 inline-flex h-6 w-6 items-center justify-center rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-subtle)] text-[11px] font-extrabold text-[var(--text)]">
                    {c.n}
                  </span>
                  <span className="font-semibold">{c.label}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-4 text-xs text-[var(--text-muted)]">
            Tip: If you can’t find what you need in the marketplace, post a request. If you prefer not to meet, use delivery.
          </div>
        </div>
      </details>
    </section>
  );
}
