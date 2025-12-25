"use client";

import * as React from "react";
import Link from "next/link";
import RequestMeta from "@/app/requests/_components/RequestMeta";

export type SafeRequestCardItem = {
  id: string;
  kind?: "product" | "service" | string | null;
  title?: string | null;
  description?: string | null;
  location?: string | null;
  category?: string | null;
  tags?: string[] | string | null;
  createdAt?: string | null;
  expiresAt?: string | null;
  boostUntil?: string | null;
  status?: string | null;
};

function isBoosted(boostUntil?: string | null) {
  if (!boostUntil) return false;
  const t = new Date(boostUntil).getTime();
  return Number.isFinite(t) && t > Date.now();
}

function expiryLabel(expiresAt?: string | null) {
  if (!expiresAt) return null;
  const t = new Date(expiresAt).getTime();
  if (!Number.isFinite(t)) return null;

  const ms = t - Date.now();
  if (ms <= 0) return "Expired";

  const hours = Math.floor(ms / (1000 * 60 * 60));
  if (hours < 24) return `Expires in ${Math.max(1, hours)}h`;

  const days = Math.floor(ms / (1000 * 60 * 60 * 24));
  return `Expires in ${Math.max(1, days)}d`;
}

function normalizeTags(tags?: string[] | string | null) {
  if (Array.isArray(tags)) return tags.map((t) => String(t).trim()).filter(Boolean);
  if (typeof tags === "string") {
    return tags
      .split(/[,\n]/g)
      .map((t) => t.trim())
      .filter(Boolean);
  }
  return [];
}

export default function RequestCard({
  item,
  href,
  isAuthed,
  className = "",
  // Optional: lets parent close drawers/menus on navigation without wrapper click hacks.
  onNavigateAction,
  onNavigate,
}: {
  item: SafeRequestCardItem;
  href?: string;
  isAuthed?: boolean;
  className?: string;
  // Use the *Action suffix to satisfy Next's serializable-props rule.
  // Keep `onNavigate` as unknown for backward compatibility without tripping the rule.
  onNavigateAction?: () => void;
  onNavigate?: unknown;
}) {
  const id = String(item.id || "");
  const kind = String(item.kind || "request");
  const title = String(item.title || "Untitled"); // must render verbatim (including bracket prefixes)
  const desc = item.description ? String(item.description) : "";
  const boosted = isBoosted(item.boostUntil);
  const exp = expiryLabel(item.expiresAt);

  const to = href || `/requests/${encodeURIComponent(id)}`;
  const tags = normalizeTags(item.tags).slice(0, 6);

  const navigate = React.useCallback(() => {
    const fn =
      onNavigateAction ??
      (typeof onNavigate === "function" ? (onNavigate as () => void) : undefined);
    fn?.();
  }, [onNavigateAction, onNavigate]);

  const hasNavigate = Boolean(onNavigateAction) || typeof onNavigate === "function";

  const clickProps = React.useMemo(() => {
    if (!hasNavigate) return {};
    const onClick: React.MouseEventHandler<HTMLAnchorElement> = () => {
      // Close after the click is processed so it doesn't interfere with navigation.
      Promise.resolve().then(navigate);
    };
    return { onClick };
  }, [hasNavigate, navigate]);

  return (
    <Link
      href={to}
      prefetch={false}
      aria-label={`Request: ${title}`}
      data-testid="request-card"
      {...clickProps}
      className={[
        "group block h-full rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-2.5 shadow-soft transition sm:p-4",
        "hover:bg-[var(--bg-subtle)] hover:border-[var(--border)]",
        "focus-visible:outline-none focus-visible:ring-2 ring-focus",
        className,
      ].join(" ")}
    >
      <div className="flex items-start justify-between gap-2 sm:gap-3">
        <div className="min-w-0">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
            {kind}
            {boosted ? " · boosted" : ""}
          </div>

          <div className="mt-1 line-clamp-2 text-sm font-semibold text-[var(--text)]">
            {title}
          </div>
        </div>

        <div className="shrink-0 text-right">
          {exp ? (
            <span className="inline-flex items-center rounded-full border border-[var(--border-subtle)] bg-[var(--bg-subtle)] px-2 py-1 text-[11px] font-semibold text-[var(--text-muted)]">
              {exp}
            </span>
          ) : (
            <span className="inline-flex items-center rounded-full border border-[var(--border-subtle)] bg-[var(--bg-subtle)] px-2 py-1 text-[11px] font-semibold text-[var(--text-muted)]">
              {String(item.status || "ACTIVE")}
            </span>
          )}
        </div>
      </div>

      {desc ? (
        <p className="mt-1.5 line-clamp-2 text-[13px] leading-relaxed text-[var(--text-muted)] sm:mt-2 sm:line-clamp-3 sm:text-sm">
          {desc}
        </p>
      ) : null}

      <div className="mt-3">
        <RequestMeta
          location={item.location ?? null}
          createdAt={item.createdAt ?? null}
          expiresAt={item.expiresAt ?? null}
          category={item.category ?? null}
        />
      </div>

      {tags.length ? (
        <div className="mt-3 flex gap-1.5 overflow-x-auto whitespace-nowrap [-webkit-overflow-scrolling:touch] sm:flex-wrap sm:overflow-visible sm:whitespace-normal">
          {tags.map((t) => (
            <span
              key={t}
              className="shrink-0 rounded-full border border-[var(--border-subtle)] bg-[var(--bg-subtle)] px-2 py-1 text-[11px] text-[var(--text-muted)]"
            >
              {t}
            </span>
          ))}
        </div>
      ) : null}

      {isAuthed === false ? (
        <div className="mt-2 text-[11px] text-[var(--text-muted)]">
          Sign in to view full details
        </div>
      ) : null}
    </Link>
  );
}
