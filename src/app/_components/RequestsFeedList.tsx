"use client";

import * as React from "react";
import Link from "next/link";
import RequestCard, {
  type SafeRequestCardItem,
} from "@/app/requests/_components/RequestCard";

export type RequestsFeedItem = SafeRequestCardItem;

function isBoosted(boostUntil?: string | null) {
  if (!boostUntil) return false;
  const t = new Date(boostUntil).getTime();
  return Number.isFinite(t) && t > Date.now();
}

function createdMs(createdAt?: string | null) {
  if (!createdAt) return 0;
  const t = new Date(createdAt).getTime();
  return Number.isFinite(t) ? t : 0;
}

function hrefFor(id: string, isAuthed: boolean) {
  const target = `/requests/${encodeURIComponent(id)}`;
  // Do not rely on client auth hints for correctness.
  // The server detail page enforces auth and will redirect guests to signin.
  void isAuthed;
  return target;
}

export default function RequestsFeedList({
  items,
  isAuthed,
  onNavigateAction,
  onNavigate,
}: {
  items: RequestsFeedItem[];
  isAuthed: boolean;
  // Use the *Action suffix to satisfy Next's serializable-props rule.
  // Keep `onNavigate` as unknown for backward compatibility without tripping the rule.
  onNavigateAction?: () => void;
  onNavigate?: unknown;
}) {
  const ordered = React.useMemo(() => {
    const xs = Array.isArray(items) ? [...items] : [];
    xs.sort((a, b) => {
      const ab = isBoosted(a.boostUntil) ? 1 : 0;
      const bb = isBoosted(b.boostUntil) ? 1 : 0;
      if (ab !== bb) return bb - ab; // boosted first
      const dt = createdMs(b.createdAt) - createdMs(a.createdAt); // newest first
      if (dt !== 0) return dt;
      return String(b.id).localeCompare(String(a.id)); // tie-breaker (desc)
    });
    return xs;
  }, [items]);

  // Only pass props if they actually exist (exactOptionalPropertyTypes).
  const navProps = React.useMemo(() => {
    const p: { onNavigateAction?: () => void; onNavigate?: unknown } = {};
    if (typeof onNavigateAction === "function") p.onNavigateAction = onNavigateAction;
    if (typeof onNavigate === "function") p.onNavigate = onNavigate;
    return p;
  }, [onNavigateAction, onNavigate]);

  return (
    <div className="space-y-2 sm:space-y-3" data-testid="requests-feed-list">
      {ordered.map((it) => {
        const id = String(it.id || "");
        const href = hrefFor(id, isAuthed);

        return (
          <RequestCard
            key={id}
            item={it}
            href={href}
            isAuthed={isAuthed}
            className="p-2.5 sm:p-3"
            {...navProps}
          />
        );
      })}

      {ordered.length > 0 ? (
        <div className="pt-0.5 text-center">
          <Link
            href="/requests"
            prefetch={false}
            className="text-[11px] sm:text-xs text-[var(--text-muted)] underline underline-offset-2 transition hover:text-[var(--text)] focus-visible:outline-none focus-visible:ring-2 ring-focus"
          >
            View all requests
          </Link>
        </div>
      ) : null}
    </div>
  );
}
