"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export type DeliverySearchValue = {
  q: string;
  near: "me" | "store";
  productId: string | null;
};

const LS_KEY = "qs.delivery.recentSearches.v1";

function safeParseJson<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    const j = JSON.parse(raw);
    return (j as T) ?? fallback;
  } catch {
    return fallback;
  }
}

function uniqPush(arr: string[], value: string, max = 8) {
  const v = value.trim();
  if (!v) return arr.slice(0, max);
  const next = [v, ...arr.filter((x) => x !== v)];
  return next.slice(0, max);
}

export default function DeliverySearch({
  value,
  busy,
  onSubmit,
}: {
  value: DeliverySearchValue;
  busy?: boolean;
  onSubmit: (next: DeliverySearchValue) => void | Promise<void>;
}) {
  const [q, setQ] = useState<string>(value.q ?? "");
  const [recent, setRecent] = useState<string[]>([]);
  const [open, setOpen] = useState(false);

  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setQ(value.q ?? "");
  }, [value.q]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const list = safeParseJson<string[]>(window.localStorage.getItem(LS_KEY), []);
    setRecent(Array.isArray(list) ? list.filter((x) => typeof x === "string").slice(0, 8) : []);
  }, []);

  const suggestions = useMemo(() => {
    const base = recent.slice(0, 6);
    const curated = [
      "Small parcel delivery",
      "Food delivery",
      "Documents delivery",
      "Same-day delivery",
      "Bulky item pickup",
    ];
    const merged: string[] = [];
    for (const s of base) if (!merged.includes(s)) merged.push(s);
    for (const s of curated) if (!merged.includes(s)) merged.push(s);
    return merged.slice(0, 8);
  }, [recent]);

  const persistRecent = useCallback((nextQ: string) => {
    if (typeof window === "undefined") return;
    const cleaned = nextQ.trim();
    if (!cleaned) return;
    const next = uniqPush(recent, cleaned, 8);
    setRecent(next);
    try {
      window.localStorage.setItem(LS_KEY, JSON.stringify(next));
    } catch {
      // ignore storage failures
    }
  }, [recent]);

  const submit = useCallback(async () => {
    const cleaned = q.trim();
    persistRecent(cleaned);
    await onSubmit({
      ...value,
      q: cleaned,
    });
  }, [q, onSubmit, value, persistRecent]);

  return (
    <div className="space-y-2" aria-label="Delivery search">
      <label htmlFor="delivery-q" className="block text-xs font-semibold text-[var(--text)]">
        What do you need delivered?
      </label>

      <div className="relative">
        <input
          id="delivery-q"
          ref={inputRef}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onFocus={() => setOpen(true)}
          onBlur={() => {
            // allow click on suggestion buttons
            window.setTimeout(() => setOpen(false), 120);
          }}
          placeholder="Example: small parcel, documents, food, fragile item…"
          className={[
            "w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--bg)] px-3 py-2",
            "text-sm text-[var(--text)] shadow-sm transition",
            "placeholder:text-[var(--text-muted)]",
            "focus-visible:outline-none focus-visible:ring-2 ring-focus",
          ].join(" ")}
          aria-describedby="delivery-q-help"
        />

        <div className="mt-2 flex flex-wrap gap-2">
          <button
            type="button"
            className="btn-gradient-primary"
            onClick={() => void submit()}
            disabled={Boolean(busy)}
            aria-disabled={Boolean(busy)}
          >
            {busy ? "Searching…" : "Search carriers"}
          </button>

          <button
            type="button"
            className={[
              "rounded-xl border border-[var(--border-subtle)] bg-[var(--bg)] px-3 py-2",
              "text-sm font-semibold text-[var(--text)] shadow-sm transition",
              "hover:bg-[var(--bg-subtle)] active:scale-[.99]",
              "focus-visible:outline-none focus-visible:ring-2 ring-focus",
            ].join(" ")}
            onClick={() => {
              setQ("");
              inputRef.current?.focus();
            }}
          >
            Clear
          </button>
        </div>

        <p id="delivery-q-help" className="mt-1 text-xs text-[var(--text-muted)]">
          Tip: add a short note like “fragile”, “cash on delivery”, or “need confirmation”.
        </p>

        {open && suggestions.length ? (
          <div
            className={[
              "absolute left-0 right-0 top-[calc(100%+10px)] z-20",
              "rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-2 shadow-soft",
            ].join(" ")}
            role="listbox"
            aria-label="Delivery suggestions"
          >
            <div className="px-2 pb-2 text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
              Suggestions
            </div>

            <div className="grid grid-cols-1 gap-1">
              {suggestions.map((s) => (
                <button
                  key={s}
                  type="button"
                  className={[
                    "text-left rounded-xl px-3 py-2 text-sm text-[var(--text)] transition",
                    "hover:bg-[var(--bg-subtle)] active:scale-[.99]",
                    "focus-visible:outline-none focus-visible:ring-2 ring-focus",
                  ].join(" ")}
                  onClick={() => {
                    setQ(s);
                    persistRecent(s);
                    void onSubmit({ ...value, q: s });
                  }}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
