// src/app/_components/RequestsFeedList.tsx
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
  if (isAuthed) return target;
  return `/signin?callbackUrl=${encodeURIComponent(target)}`;
}

export default function RequestsFeedList({
  items,
  isAuthed,
  onNavigate,
}: {
  items: RequestsFeedItem[];
  isAuthed: boolean;
  onNavigate?: () => void;
}) {
  const ordered = React.useMemo(() => {
    const xs = Array.isArray(items) ? [...items] : [];
    xs.sort((a, b) => {
      const ab = isBoosted(a.boostUntil) ? 1 : 0;
      const bb = isBoosted(b.boostUntil) ? 1 : 0;
      if (ab !== bb) return bb - ab; // boosted first
      return createdMs(b.createdAt) - createdMs(a.createdAt); // newest first
    });
    return xs;
  }, [items]);

  return (
    <div className="space-y-3" data-testid="requests-feed-list">
      {ordered.map((it) => {
        const id = String(it.id || "");
        const href = hrefFor(id, isAuthed);

        return (
          <div key={id} onClick={onNavigate ? () => onNavigate() : undefined}>
            <RequestCard
              item={it}
              href={href}
              isAuthed={isAuthed}
              className="p-3"
            />
          </div>
        );
      })}

      {ordered.length > 0 ? (
        <div className="pt-1 text-center">
          <Link
            href="/requests"
            prefetch={false}
            className="text-xs text-muted-foreground underline hover:text-foreground"
          >
            View all requests
          </Link>
        </div>
      ) : null}
    </div>
  );
}
