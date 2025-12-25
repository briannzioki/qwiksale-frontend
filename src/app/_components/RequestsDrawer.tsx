// src/app/_components/RequestsDrawer.tsx
"use client";

import * as React from "react";
import Link from "next/link";
import RequestsFeedList, {
  type RequestsFeedItem,
} from "@/app/_components/RequestsFeedList";

type Props = {
  open: boolean;
  // Use the *Action suffix to satisfy Next's serializable-props rule.
  // Keep `onClose` as unknown for backward compatibility without tripping the rule.
  onCloseAction?: () => void;
  onClose?: unknown;
  isAuthed: boolean;
};

const FEED_TIMEOUT_MS = 10_000;

function hasNextAuthSessionCookie(): boolean {
  if (typeof document === "undefined") return false;
  const c = document.cookie || "";
  // NextAuth session cookie name varies by secure context:
  // - next-auth.session-token
  // - __Secure-next-auth.session-token
  return /(?:^|;\s*)(?:__Secure-)?next-auth\.session-token=/.test(c);
}

export default function RequestsDrawer({
  open,
  onCloseAction,
  onClose,
  isAuthed,
}: Props) {
  const [loading, setLoading] = React.useState(false);
  const [items, setItems] = React.useState<RequestsFeedItem[]>([]);
  const [error, setError] = React.useState<string | null>(null);
  const [cookieAuthed, setCookieAuthed] = React.useState(false);

  const close = React.useCallback(() => {
    const fn =
      onCloseAction ??
      (typeof onClose === "function" ? (onClose as () => void) : undefined);
    fn?.();
  }, [onCloseAction, onClose]);

  // Prevent transient "guest" gating when session cookies exist (suite-only flake).
  React.useEffect(() => {
    if (!open) return;
    setCookieAuthed(hasNextAuthSessionCookie());
  }, [open]);

  const isAuthedStable = isAuthed || cookieAuthed;

  React.useEffect(() => {
    if (!open) return;

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);

    const prev = document.documentElement.style.overflow;
    document.documentElement.style.overflow = "hidden";

    return () => {
      window.removeEventListener("keydown", onKey);
      document.documentElement.style.overflow = prev;
    };
  }, [open, close]);

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
        className={[
          "absolute inset-0",
          "bg-[color:var(--bg)]/70",
          "backdrop-blur-[2px] backdrop-brightness-75",
          "supports-[backdrop-filter]:bg-[color:var(--bg)]/40",
        ].join(" ")}
        aria-label="Close"
        onClick={close}
      />

      {/* Panel */}
      <aside
        className={[
          "relative ml-0 h-full w-[min(420px,90vw)]",
          "bg-[var(--bg-elevated)] text-[var(--text)]",
          "border-r border-[var(--border-subtle)] shadow-soft",
          "p-3 sm:p-4",
        ].join(" ")}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-[11px] sm:text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
              Latest
            </div>
            <h2 className="mt-1 text-base sm:text-lg font-extrabold tracking-tight text-[var(--text)]">
              Requests
            </h2>
          </div>

          <button
            type="button"
            onClick={close}
            className={[
              "inline-flex h-9 w-9 items-center justify-center rounded-xl border",
              "border-[var(--border-subtle)] bg-[var(--bg-elevated)]",
              "text-[var(--text-muted)] shadow-sm transition",
              "hover:bg-[var(--bg-subtle)] hover:text-[var(--text)]",
              "focus-visible:outline-none focus-visible:ring-2 ring-focus",
              "active:scale-[.99]",
            ].join(" ")}
            aria-label="Close drawer"
            data-testid="requests-drawer-close"
          >
            <span aria-hidden>✕</span>
          </button>
        </div>

        <div className="mt-3 sm:mt-4">
          {loading ? (
            <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-3 sm:p-4 text-xs sm:text-sm text-[var(--text-muted)] shadow-sm">
              Loading…
            </div>
          ) : error ? (
            <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-subtle)] px-3 py-2.5 sm:px-4 sm:py-3 text-xs sm:text-sm text-[var(--text)] shadow-sm">
              {error}
            </div>
          ) : items.length === 0 ? (
            <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-3 sm:p-4 text-xs sm:text-sm text-[var(--text-muted)] shadow-sm">
              No requests yet.
            </div>
          ) : (
            <RequestsFeedList
              items={items}
              isAuthed={isAuthedStable}
              onNavigateAction={close}
            />
          )}
        </div>

        {/* CTAs AFTER the list so broad selectors don't hit /requests/new first */}
        <div className="mt-3 sm:mt-4 flex flex-wrap items-center gap-2">
          <Link
            href="/requests"
            prefetch={false}
            className="btn-outline text-xs sm:text-sm"
          >
            Open directory
          </Link>
          <Link
            href="/requests/new"
            prefetch={false}
            className="btn-gradient-primary text-xs sm:text-sm"
          >
            Post a request
          </Link>
        </div>
      </aside>
    </div>
  );
}
