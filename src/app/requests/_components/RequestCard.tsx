// src/app/requests/_components/RequestCard.tsx
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
}: {
  item: SafeRequestCardItem;
  href?: string;
  isAuthed?: boolean;
  className?: string;
}) {
  const id = String(item.id || "");
  const kind = String(item.kind || "request");
  const title = String(item.title || "Untitled");
  const desc = item.description ? String(item.description) : "";
  const boosted = isBoosted(item.boostUntil);
  const exp = expiryLabel(item.expiresAt);

  const to = href || `/requests/${encodeURIComponent(id)}`;

  const tags = normalizeTags(item.tags).slice(0, 6);

  return (
    <Link
      href={to}
      prefetch={false}
      aria-label={`Request: ${title}`}
      data-testid="request-card"
      className={[
        "group block h-full rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-4 shadow-sm transition",
        "hover:shadow hover:border-brandBlue/70",
        "focus-visible:outline-none focus-visible:ring-2 ring-focus",
        className,
      ].join(" ")}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
            {kind}
            {boosted ? " • boosted" : ""}
          </div>

          <div className="mt-1 line-clamp-2 text-sm font-semibold text-[var(--text)]">
            {title}
          </div>
        </div>

        <div className="shrink-0 text-right">
          {exp ? (
            <span
              className={[
                "inline-flex items-center rounded-full px-2 py-1 text-[11px] font-semibold",
                exp === "Expired"
                  ? "bg-red-50 text-red-700 ring-1 ring-red-200 dark:bg-red-900/20 dark:text-red-200 dark:ring-red-900/40"
                  : "bg-muted/50 text-[var(--text-muted)]",
              ].join(" ")}
            >
              {exp}
            </span>
          ) : (
            <span className="inline-flex items-center rounded-full bg-muted/50 px-2 py-1 text-[11px] font-semibold text-[var(--text-muted)]">
              {String(item.status || "ACTIVE")}
            </span>
          )}
        </div>
      </div>

      {desc ? (
        <p className="mt-2 line-clamp-3 text-sm text-[var(--text-muted)]">
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
        <div className="mt-3 flex flex-wrap gap-1.5">
          {tags.map((t) => (
            <span
              key={t}
              className="rounded-full bg-muted/50 px-2 py-1 text-[11px] text-[var(--text-muted)]"
            >
              {t}
            </span>
          ))}
        </div>
      ) : null}

      {isAuthed === false ? (
        <div className="mt-3 text-[11px] text-[var(--text-muted)]">
          Sign in to view full details
        </div>
      ) : null}
    </Link>
  );
}
