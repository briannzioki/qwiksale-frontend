"use client";

import * as React from "react";
import ExclusivePopoverGroup from "@/app/components/ExclusivePopoverGroup";

export type EcosystemTileSpec = {
  id: string;
  ariaLabel: string;
  title: string;
  subtitle: string;
  iconKey: "account" | "browse" | "shield" | "chart";
  content: React.ReactNode;
};

function cx(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

function Icon({ kind }: { kind: EcosystemTileSpec["iconKey"] }) {
  const cls = "h-4 w-4";
  const common = {
    className: cls,
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": "true" as const,
  };

  if (kind === "account") {
    return (
      <svg viewBox="0 0 24 24" {...common}>
        <path d="M20 21a8 8 0 0 0-16 0" />
        <path d="M12 13a4 4 0 1 0-4-4 4 4 0 0 0 4 4Z" />
      </svg>
    );
  }

  if (kind === "browse") {
    return (
      <svg viewBox="0 0 24 24" {...common}>
        <path d="M10 3h11v11H10z" />
        <path d="M3 10h7v11H3z" />
        <path d="M14 7h3" />
        <path d="M6 14h2" />
      </svg>
    );
  }

  if (kind === "shield") {
    return (
      <svg viewBox="0 0 24 24" {...common}>
        <path d="M12 2l8 4v6c0 6-4 10-8 10S4 18 4 12V6z" />
        <path d="M12 7v5" />
        <path d="M12 15h.01" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" {...common}>
      <path d="M4 19V5" />
      <path d="M4 19h16" />
      <path d="M8 15v-4" />
      <path d="M12 15V7" />
      <path d="M16 15v-2" />
    </svg>
  );
}

export default function EcosystemTilesClient({ tiles }: { tiles: EcosystemTileSpec[] }) {
  const closeBtnRef = React.useRef<HTMLButtonElement>(null);

  return (
    <ExclusivePopoverGroup>
      {({ openId, setOpenId, close, registerTrigger, panelRef }) => {
        const active = openId ? tiles.find((t) => t.id === openId) ?? null : null;

        React.useEffect(() => {
          if (!openId) return;
          const id = window.setTimeout(() => {
            if (closeBtnRef.current) {
              try {
                closeBtnRef.current.focus();
              } catch {}
            }
          }, 0);
          return () => window.clearTimeout(id);
        }, [openId]);

        return (
          <div className="relative">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {tiles.map((t) => {
                const isOpen = openId === t.id;

                return (
                  <div key={t.id} id={t.id} className="relative">
                    <button
                      type="button"
                      ref={(el) => registerTrigger(t.id, el)}
                      onClick={() => setOpenId(isOpen ? null : t.id, { focus: false })}
                      aria-label={t.ariaLabel}
                      aria-expanded={isOpen ? "true" : "false"}
                      className={cx(
                        "w-full text-left",
                        "focus-visible:outline-none focus-visible:ring-2 ring-focus rounded-2xl",
                      )}
                    >
                      <div
                        className={cx(
                          "relative overflow-hidden rounded-2xl border border-[var(--border-subtle)] shadow-soft",
                          "min-h-[88px] sm:min-h-[96px]",
                        )}
                      >
                        <div
                          aria-hidden
                          className="pointer-events-none absolute left-0 top-0 h-1 w-full bg-gradient-to-r from-[#161748] via-[#478559] to-[#39a0ca]"
                        />
                        <div
                          aria-hidden
                          className="pointer-events-none absolute inset-0 bg-[var(--bg-elevated)] opacity-[0.72] dark:opacity-[0.78]"
                        />

                        <div className="relative z-10 flex items-start gap-3 p-3 sm:p-4">
                          <span
                            className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-[var(--border-subtle)] bg-[var(--bg)] text-[var(--text)] shadow-sm"
                            aria-hidden="true"
                          >
                            <Icon kind={t.iconKey} />
                          </span>

                          <div className="min-w-0">
                            <div className="text-sm font-extrabold tracking-tight text-[var(--text)]">{t.title}</div>
                            <div className="mt-0.5 text-xs text-[var(--text-muted)] line-clamp-2">{t.subtitle}</div>
                          </div>

                          <div className="ml-auto flex items-center gap-2">
                            <span className="text-xs font-semibold text-[var(--text)]">{isOpen ? "Close" : "Open"}</span>
                          </div>
                        </div>
                      </div>
                    </button>
                  </div>
                );
              })}
            </div>

            {active ? (
              <div
                className="fixed inset-0 z-50"
                aria-hidden="false"
                onMouseDown={(e) => {
                  if (e.target === e.currentTarget) close({ focus: false });
                }}
              >
                <div className="absolute inset-0 bg-black/20" aria-hidden="true" />

                <div
                  ref={panelRef}
                  role="dialog"
                  aria-label={`${active.title} details`}
                  className={cx(
                    "absolute left-1/2 top-[92px] w-[min(980px,calc(100vw-24px))] -translate-x-1/2",
                    "rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] shadow-soft",
                  )}
                >
                  <div className="flex items-start justify-between gap-3 border-b border-[var(--border-subtle)] p-3 sm:p-4">
                    <div className="min-w-0">
                      <div className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                        Ecosystem
                      </div>
                      <div className="mt-1 text-base font-extrabold tracking-tight text-[var(--text)] sm:text-lg">
                        {active.title}
                      </div>
                      <div className="mt-1 text-sm text-[var(--text-muted)]">{active.subtitle}</div>
                    </div>

                    <button
                      ref={closeBtnRef}
                      type="button"
                      onClick={() => close({ focus: true })}
                      className={cx(
                        "btn-outline",
                        "focus-visible:outline-none focus-visible:ring-2 ring-focus",
                      )}
                      aria-label="Close panel"
                      title="Close"
                    >
                      Close
                    </button>
                  </div>

                  <div
                    className={cx(
                      "p-3 sm:p-4",
                      "max-h-[calc(100svh-160px)] overflow-auto",
                    )}
                  >
                    {active.content}
                  </div>

                  <div className="px-3 pb-3 sm:px-4 sm:pb-4">
                    <p className="text-xs text-[var(--text-muted)]">
                      Tip: Press Escape to close. Click outside to close. Opening another tile switches panels.
                    </p>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        );
      }}
    </ExclusivePopoverGroup>
  );
}
