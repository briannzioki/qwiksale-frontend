// src/app/_components/RequestsDrawer.tsx
"use client";

import * as React from "react";
import Link from "next/link";
import RequestsFeedList, { type RequestsFeedItem } from "@/app/_components/RequestsFeedList";

type Props = {
  open: boolean;
  onClose: () => void;
  isAuthed: boolean;
};

const FEED_TIMEOUT_MS = 10_000;

export default function RequestsDrawer({ open, onClose, isAuthed }: Props) {
  const [loading, setLoading] = React.useState(false);
  const [items, setItems] = React.useState<RequestsFeedItem[]>([]);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open) return;

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);

    const prev = document.documentElement.style.overflow;
    document.documentElement.style.overflow = "hidden";

    return () => {
      window.removeEventListener("keydown", onKey);
      document.documentElement.style.overflow = prev;
    };
  }, [open, onClose]);

  React.useEffect(() => {
    if (!open) return;

    let alive = true;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FEED_TIMEOUT_MS);

    (async () => {
      try {
        setLoading(true);
        setError(null);

        const res = await fetch("/api/requests/feed", {
          cache: "no-store",
          headers: { Accept: "application/json" },
          signal: controller.signal,
        });

        const j: any = await res.json().catch(() => null);
        if (!alive) return;

        if (!res.ok || j?.error) {
          throw new Error(j?.error || `Failed (${res.status})`);
        }

        const raw = Array.isArray(j?.items)
          ? j.items
          : Array.isArray(j?.requests)
          ? j.requests
          : Array.isArray(j)
          ? j
          : [];

        const mapped: RequestsFeedItem[] = raw
          .map((x: any) => ({
            id: String(x?.id || ""),
            kind: x?.kind ? String(x.kind) : null,
            title: x?.title ? String(x.title) : null,
            description: x?.description ? String(x.description) : null,
            location: x?.location ? String(x.location) : null,
            category: x?.category ? String(x.category) : null,
            createdAt: x?.createdAt ? String(x.createdAt) : null,
            expiresAt: x?.expiresAt ? String(x.expiresAt) : null,
            boostUntil: x?.boostUntil ? String(x.boostUntil) : null,
            status: x?.status ? String(x.status) : null,
            tags: x?.tags ?? null,
          }))
          .filter((x: RequestsFeedItem) => x.id);

        setItems(mapped);
      } catch (e: any) {
        if (e?.name === "AbortError") return;
        setError(e?.message || "Could not load feed");
        setItems([]);
      } finally {
        if (alive) setLoading(false);
        clearTimeout(timer);
      }
    })();

    return () => {
      alive = false;
      clearTimeout(timer);
      controller.abort();
    };
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[999] flex"
      role="dialog"
      aria-modal="true"
      aria-label="Requests"
      data-testid="requests-drawer"
    >
      {/* Backdrop */}
      <button
        type="button"
        className="absolute inset-0 bg-black/40"
        aria-label="Close"
        onClick={onClose}
      />

      {/* Panel */}
      <aside
        className={[
          "relative ml-0 h-full w-[min(420px,90vw)]",
          "bg-[var(--bg-elevated)] text-[var(--text)]",
          "border-r border-[var(--border-subtle)] shadow-soft",
          "p-4",
        ].join(" ")}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
              Latest
            </div>
            <h2 className="mt-1 text-lg font-extrabold">Requests</h2>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] text-[var(--text-muted)] hover:bg-subtle hover:text-[var(--text)] focus-visible:outline-none focus-visible:ring-2 ring-focus"
            aria-label="Close drawer"
            data-testid="requests-drawer-close"
          >
            <span aria-hidden>✕</span>
          </button>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Link href="/requests" prefetch={false} className="btn-outline text-sm">
            Open directory
          </Link>
          <Link href="/requests/new" prefetch={false} className="btn-gradient-primary text-sm">
            Post a request
          </Link>
        </div>

        <div className="mt-4">
          {loading ? (
            <div className="rounded-xl border border-border bg-card/80 p-4 text-sm text-muted-foreground">
              Loading…
            </div>
          ) : error ? (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-200">
              {error}
            </div>
          ) : items.length === 0 ? (
            <div className="rounded-xl border border-border bg-card/80 p-4 text-sm text-muted-foreground">
              No requests yet.
            </div>
          ) : (
            <RequestsFeedList items={items} isAuthed={isAuthed} onNavigate={onClose} />
          )}
        </div>
      </aside>
    </div>
  );
}
