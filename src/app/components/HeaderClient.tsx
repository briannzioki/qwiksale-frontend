// src/app/components/HeaderClient.tsx
"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";

import Navbar from "@/app/components/Navbar";
import { Icon } from "@/app/components/Icon";
import HeaderInlineSearch from "@/app/components/HeaderInlineSearch";
import AuthButtons from "@/app/components/AuthButtons";

type Props = {
  initialAuth: {
    isAuthed: boolean;
    isAdmin: boolean;
    isVerified?: boolean;
  };
};

type FeedItem = {
  id: string;
  kind: "product" | "service";
  title: string;
  location?: string | null;
  createdAt?: string | null;
  expiresAt?: string | null;
  boostUntil?: string | null;
  category?: string | null;
};

const FEED_TIMEOUT_MS = 12_000;

// Avoid SSR warnings while still running "early" on the client.
const useIsoLayoutEffect =
  typeof window !== "undefined" ? React.useLayoutEffect : React.useEffect;

function RequestsIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={className}
      fill="currentColor"
    >
      <path d="M7 3h10a2 2 0 0 1 2 2v14.5a1.5 1.5 0 0 1-2.4 1.2l-3.7-2.78a1.5 1.5 0 0 0-1.8 0l-3.7 2.78A1.5 1.5 0 0 1 5 19.5V5a2 2 0 0 1 2-2Zm0 2v14.1l3.1-2.33a3.5 3.5 0 0 1 4.2 0L17 19.1V5H7Zm2.5 3.5h5a1 1 0 1 1 0 2h-5a1 1 0 1 1 0-2Zm0 4h6a1 1 0 1 1 0 2h-6a1 1 0 1 1 0-2Z" />
    </svg>
  );
}

function fmtRelativeIso(iso?: string | null) {
  if (!iso) return null;
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return null;

  const diff = Date.now() - d.getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.floor(h / 24);
  return `${days}d ago`;
}

function RequestsDrawer({
  open,
  onClose,
  isAuthedHint,
}: {
  open: boolean;
  onClose: () => void;
  isAuthedHint: boolean;
}) {
  const [loading, setLoading] = React.useState(false);
  const [items, setItems] = React.useState<FeedItem[]>([]);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open) return;

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  React.useEffect(() => {
    if (!open) return;

    let alive = true;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FEED_TIMEOUT_MS);

    const load = async () => {
      try {
        setLoading(true);
        setError(null);

        const r = await fetch("/api/requests/feed", {
          cache: "no-store",
          credentials: "include",
          signal: controller.signal,
          headers: { Accept: "application/json" },
        });

        let j: any = null;
        try {
          j = await r.json();
        } catch {
          j = null;
        }

        if (!alive) return;

        if (!r.ok) {
          const msg =
            (j && typeof j?.error === "string" && j.error) ||
            `Failed to load (${r.status})`;
          throw new Error(msg);
        }

        const raw = Array.isArray(j?.items) ? j.items : Array.isArray(j) ? j : [];
        const next: FeedItem[] = raw
          .map((x: any) => {
            const id = String(x?.id ?? "");
            const title = String(x?.title ?? x?.name ?? "");
            const kindRaw = String(x?.kind ?? "").toLowerCase();
            const kind: "product" | "service" =
              kindRaw === "service" ? "service" : "product";
            if (!id || !title) return null;
            return {
              id,
              title,
              kind,
              location: typeof x?.location === "string" ? x.location : null,
              createdAt: typeof x?.createdAt === "string" ? x.createdAt : null,
              expiresAt: typeof x?.expiresAt === "string" ? x.expiresAt : null,
              boostUntil: typeof x?.boostUntil === "string" ? x.boostUntil : null,
              category: typeof x?.category === "string" ? x.category : null,
            } as FeedItem;
          })
          .filter(Boolean) as FeedItem[];

        setItems(next);
      } catch (e: any) {
        if (e?.name === "AbortError") return;
        setError(e?.message || "Could not load requests");
      } finally {
        if (alive) setLoading(false);
      }
    };

    load();

    return () => {
      alive = false;
      clearTimeout(timer);
      controller.abort();
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60]">
      <button
        type="button"
        aria-label="Close requests drawer"
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Requests"
        className={[
          "absolute left-0 top-0 h-full w-[min(380px,86vw)]",
          "bg-[var(--bg-elevated)] text-[var(--text)]",
          "border-r border-[var(--border-subtle)] shadow-soft",
          "flex flex-col",
        ].join(" ")}
      >
        <div className="flex items-center justify-between gap-3 border-b border-[var(--border-subtle)] px-4 py-3">
          <div className="min-w-0">
            <div className="text-sm font-extrabold tracking-tight">Requests</div>
            <div className="text-xs text-[var(--text-muted)]">
              Latest gigs &amp; buyer needs
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className={[
              "inline-flex h-9 w-9 items-center justify-center rounded-xl border border-[var(--border-subtle)]",
              "text-[var(--text-muted)] transition hover:bg-[var(--bg-subtle)]",
              "focus-visible:outline-none focus-visible:ring-2 ring-focus",
            ].join(" ")}
            aria-label="Close"
            title="Close"
          >
            <span aria-hidden>×</span>
          </button>
        </div>

        <div className="flex-1 overflow-auto p-3">
          {loading ? (
            <div className="space-y-2">
              <div className="h-16 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-subtle)]/40" />
              <div className="h-16 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-subtle)]/40" />
              <div className="h-16 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-subtle)]/40" />
            </div>
          ) : error ? (
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-subtle)] px-4 py-3 text-sm text-[var(--text)]">
              {error}
            </div>
          ) : items.length === 0 ? (
            <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-subtle)]/40 px-4 py-6 text-sm text-[var(--text-muted)]">
              No requests yet.
            </div>
          ) : (
            <ul className="space-y-2">
              {items.map((it) => {
                const detail = `/requests/${encodeURIComponent(it.id)}`;
                const href = isAuthedHint
                  ? detail
                  : `/signin?callbackUrl=${encodeURIComponent(detail)}`;

                const when =
                  fmtRelativeIso(it.createdAt) || fmtRelativeIso(it.boostUntil) || null;

                return (
                  <li key={it.id}>
                    <Link
                      href={href}
                      prefetch={false}
                      onClick={onClose}
                      className={[
                        "block rounded-2xl border border-[var(--border-subtle)]",
                        "bg-[var(--bg-elevated)] transition hover:bg-[var(--bg-subtle)]",
                        "px-3 py-3",
                        "focus-visible:outline-none focus-visible:ring-2 ring-focus",
                      ].join(" ")}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                            {it.kind === "service" ? "Service" : "Product"}
                            {it.category ? ` • ${it.category}` : ""}
                          </div>
                          <div className="mt-1 line-clamp-2 text-sm font-semibold text-[var(--text)]">
                            {it.title}
                          </div>
                          {it.location ? (
                            <div className="mt-1 line-clamp-1 text-xs text-[var(--text-muted)]">
                              {it.location}
                            </div>
                          ) : null}
                        </div>
                        {when ? (
                          <div className="shrink-0 rounded-full bg-[var(--bg-subtle)] px-2 py-1 text-[11px] text-[var(--text-muted)]">
                            {when}
                          </div>
                        ) : null}
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="border-t border-[var(--border-subtle)] p-3">
          <Link
            href="/requests"
            prefetch={false}
            onClick={onClose}
            className={[
              "block rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-3 py-2 text-center",
              "text-sm font-semibold text-[var(--text)] transition hover:bg-[var(--bg-subtle)]",
              "focus-visible:outline-none focus-visible:ring-2 ring-focus",
            ].join(" ")}
          >
            View all requests
          </Link>
        </div>
      </aside>
    </div>
  );
}

export default function HeaderClient({ initialAuth }: Props) {
  const router = useRouter();
  const pathname = usePathname() || "/";
  const inAdmin = pathname.startsWith("/admin");

  // Live session (no /api/me), but still honor server hint to avoid flicker.
  const { status, data: session } = useSession();

  const liveAuthed = status === "authenticated" && !!session;
  const isAuthedHint = liveAuthed || initialAuth.isAuthed;

  const liveVerified = Boolean(
    (session as any)?.user?.verified || (session as any)?.user?.isVerified,
  );
  const isVerified = liveVerified || initialAuth.isVerified === true;

  const [requestsOpen, setRequestsOpen] = React.useState(false);

  React.useEffect(() => {
    setRequestsOpen(false);
  }, [pathname]);

  function getInlineSearch() {
    const root = document.getElementById("header-inline-search");
    if (!root) return null;
    const input = root.querySelector<HTMLInputElement>('input[name="q"]');
    const toggle = root.querySelector<HTMLButtonElement>(
      '[data-testid="header-inline-search-toggle"]',
    );
    return {
      root,
      input,
      toggle,
      isOpen: root.dataset["open"] === "true",
    };
  }

  /* -------------------------- Hotkey: Slash & Cmd+K -------------------------- */
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const key = typeof e.key === "string" ? e.key : "";
      if (!key) return;

      const isSlash = key === "/";
      const isCmdK = key.toLowerCase() === "k" && (e.metaKey || e.ctrlKey);
      if (!isSlash && !isCmdK) return;
      if (e.defaultPrevented) return;

      const t = e.target as HTMLElement | null;
      const tag = t?.tagName?.toLowerCase();
      if (tag === "input" || tag === "textarea" || t?.isContentEditable) return;

      const found = getInlineSearch();
      if (!found) return;

      e.preventDefault();

      const { input, toggle, isOpen } = found;
      if (!isOpen && toggle) toggle.click();
      input?.focus();
      input?.select?.();
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  /* -------------------- Hardening: Home/Logo must be a real "/" link -------------------- */
  useIsoLayoutEffect(() => {
    if (inAdmin) return;

    const root =
      (document.querySelector<HTMLElement>('[data-testid="site-header"]') ??
        document.querySelector<HTMLElement>("header") ??
        document.querySelector<HTMLElement>("nav") ??
        document.body) ||
      null;

    if (!root) return;

    const norm = (s?: string | null) => String(s ?? "").trim().toLowerCase();

    const scoreAnchor = (a: HTMLAnchorElement) => {
      let score = 0;

      const dt = a.getAttribute("data-testid");
      if (dt === "home-link") score += 1_000;
      if (dt === "site-home-link") score += 900;

      const href = norm(a.getAttribute("href"));
      if (href === "/") score += 800;

      const aria = norm(a.getAttribute("aria-label"));
      const title = norm(a.getAttribute("title"));
      const text = norm(a.textContent);
      const imgAlt = norm(a.querySelector("img")?.getAttribute("alt"));

      const name = `${aria} ${title} ${text} ${imgAlt}`;

      if (name.includes("qwiksale")) score += 250;
      if (name.includes("home")) score += 220;
      if (name.includes("logo")) score += 120;

      if (href.startsWith("/") && (name.includes("qwiksale") || name.includes("logo"))) {
        score += 60;
      }

      return score;
    };

    const pickLikelyHomeAnchor = (): HTMLAnchorElement | null => {
      const direct =
        root.querySelector<HTMLAnchorElement>('a[data-testid="home-link"]') ??
        root.querySelector<HTMLAnchorElement>('a[data-testid="site-home-link"]') ??
        root.querySelector<HTMLAnchorElement>('a[aria-label="Home"]') ??
        root.querySelector<HTMLAnchorElement>('a[aria-label="QwikSale"]') ??
        root.querySelector<HTMLAnchorElement>('a[href="/"]') ??
        null;

      if (direct) return direct;

      const anchors = Array.from(root.querySelectorAll<HTMLAnchorElement>("a[href]"));
      if (anchors.length === 0) return null;

      let best: HTMLAnchorElement | null = null;
      let bestScore = -1;

      for (const a of anchors) {
        const s = scoreAnchor(a);
        if (s > bestScore) {
          bestScore = s;
          best = a;
        }
      }

      if (!best || bestScore < 120) return null;
      return best;
    };

    const homeA = pickLikelyHomeAnchor();
    if (homeA) {
      if (!homeA.getAttribute("data-testid")) homeA.setAttribute("data-testid", "home-link");
      if (!norm(homeA.getAttribute("aria-label"))) homeA.setAttribute("aria-label", "Home");

      const hrefNow = (homeA.getAttribute("href") ?? "").trim();
      if (hrefNow !== "/") homeA.setAttribute("href", "/");
    }

    const looksLikeHome = (a: HTMLAnchorElement) => {
      const dt = norm(a.getAttribute("data-testid"));
      if (dt === "home-link" || dt === "site-home-link") return true;

      const href = (a.getAttribute("href") ?? "").trim();
      if (href === "/") return true;

      const aria = norm(a.getAttribute("aria-label"));
      const title = norm(a.getAttribute("title"));
      const text = norm(a.textContent);
      const imgAlt = norm(a.querySelector("img")?.getAttribute("alt"));
      const name = `${aria} ${title} ${text} ${imgAlt}`;

      return name.includes("home") || name.includes("qwiksale") || name.includes("logo");
    };

    const onClickCapture = (e: MouseEvent) => {
      const isModified =
        e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0;
      if (isModified) return;

      const t = e.target as HTMLElement | null;
      const a = (t?.closest?.("a") as HTMLAnchorElement | null) ?? null;
      if (!a) return;
      if (!looksLikeHome(a)) return;

      if (!a.getAttribute("data-testid")) a.setAttribute("data-testid", "home-link");
      if (!norm(a.getAttribute("aria-label"))) a.setAttribute("aria-label", "Home");
      const hrefNow = (a.getAttribute("href") ?? "").trim();
      if (hrefNow !== "/") a.setAttribute("href", "/");

      if (pathname === "/") return;

      e.preventDefault();
      e.stopPropagation();
      router.push("/");
    };

    root.addEventListener("click", onClickCapture, true);
    return () => root.removeEventListener("click", onClickCapture, true);
  }, [inAdmin, pathname, router]);

  /* ------------------------------ Header right slot ------------------------------ */
  const rightSlot = (
    <div className="flex shrink-0 items-center gap-1.5 sm:gap-2.5">
      {!inAdmin && (
        <>
          {/* Requests: icon-only on xs, label from sm+ */}
          <button
            type="button"
            onClick={() => setRequestsOpen(true)}
            aria-label="Requests"
            title="Requests"
            className={[
              "inline-flex shrink-0 items-center gap-2 rounded-xl transition",
              "px-2 py-1.5 sm:px-2.5 sm:py-1.5",
              "text-[var(--text-muted)] hover:bg-[var(--bg-subtle)]",
              "focus-visible:outline-none focus-visible:ring-2 ring-focus",
            ].join(" ")}
          >
            <RequestsIcon className="h-5 w-5" />
            <span className="hidden sm:inline text-sm font-semibold text-[var(--text)]">
              Requests
            </span>
          </button>

          {isAuthedHint && (
            <>
              {/* Hide these on xs to prevent header crowding; user still has Saved inside Account menu */}
              <Link
                href="/saved"
                prefetch={false}
                aria-label="Favorites"
                title="Favorites"
                className={[
                  "hidden sm:inline-flex",
                  "relative h-8 w-8 shrink-0 items-center justify-center rounded-xl",
                  "text-[var(--text-muted)] transition hover:bg-[var(--bg-subtle)]",
                  "focus-visible:outline-none focus-visible:ring-2 ring-focus",
                ].join(" ")}
              >
                <Icon name="heart" />
              </Link>

              <Link
                href="/messages"
                prefetch={false}
                aria-label="Messages"
                title="Messages"
                className={[
                  "hidden sm:inline-flex",
                  "relative h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-transparent",
                  "text-[var(--text-muted)] transition",
                  "hover:border-[var(--border-subtle)] hover:bg-[var(--bg-subtle)]",
                  "focus-visible:outline-none focus-visible:ring-2 ring-focus",
                ].join(" ")}
              >
                <Icon name="message" />
              </Link>
            </>
          )}
        </>
      )}

      <AuthButtons initialIsAuthedHint={isAuthedHint} isVerified={isVerified} />

      <RequestsDrawer
        open={requestsOpen}
        onClose={() => setRequestsOpen(false)}
        isAuthedHint={isAuthedHint}
      />
    </div>
  );

  return (
    <Navbar
      searchSlot={<HeaderInlineSearch />}
      rightSlot={rightSlot}
      hideSellCta={false}
      showSaved={false}
      showMessages={false}
      sticky
    />
  );
}
