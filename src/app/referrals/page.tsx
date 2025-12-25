"use client";
// src/app/referrals/page.tsx

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import toast from "react-hot-toast";

type StatsOk = {
  code: string;
  counts: { invited: number; qualified: number };
};

type ClaimOk = { ok: true };

const FETCH_TIMEOUT_MS = 12_000;

export default function ReferralsPage() {
  const [loading, setLoading] = useState(true);
  const [code, setCode] = useState<string>("");
  const [counts, setCounts] = useState<{ invited: number; qualified: number }>({
    invited: 0,
    qualified: 0,
  });

  const [claiming, setClaiming] = useState(false);
  const [refInput, setRefInput] = useState("");
  const abortRef = useRef<AbortController | null>(null);

  const shareUrl = useMemo(() => {
    const origin =
      typeof window !== "undefined"
        ? window.location.origin
        : process.env["NEXT_PUBLIC_APP_URL"] ?? "https://qwiksale.sale";
    return code ? `${origin}/signup?ref=${encodeURIComponent(code)}` : "";
  }, [code]);

  useEffect(() => {
    let alive = true;

    const load = async () => {
      try {
        setLoading(true);
        abortRef.current?.abort();
        const controller = new AbortController();
        abortRef.current = controller;

        const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

        const r = await fetch("/api/referrals/stats", {
          cache: "no-store",
          signal: controller.signal,
          headers: { Accept: "application/json" },
        });

        clearTimeout(timer);

        let j: any = null;
        try {
          j = (await r.json()) as StatsOk | { error?: string };
        } catch {
          j = { error: `Non-JSON response (${r.status})` };
        }

        if (!alive) return;

        if (!r.ok || j?.error) {
          throw new Error(j?.error || `Failed to load (${r.status})`);
        }

        setCode(String(j.code || ""));
        const c = j.counts || {};
        setCounts({
          invited: Number.isFinite(c.invited) ? c.invited : 0,
          qualified: Number.isFinite(c.qualified) ? c.qualified : 0,
        });
      } catch (e: any) {
        if (e?.name === "AbortError") return;
        toast.error(e?.message || "Could not load referral stats");
      } finally {
        if (alive) setLoading(false);
      }
    };

    load();

    const onFocus = () => {
      // Re-fetch on focus; abort controller prevents piling up requests.
      load();
    };
    window.addEventListener("focus", onFocus);

    return () => {
      alive = false;
      abortRef.current?.abort();
      window.removeEventListener("focus", onFocus);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function copy() {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      toast.success("Link copied");
    } catch {
      try {
        const ta = document.createElement("textarea");
        ta.value = shareUrl;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
        toast.success("Link copied");
      } catch {
        toast.error("Couldn't copy link");
      }
    }
  }

  async function share() {
    if (!shareUrl) return;
    const text = `Join me on QwikSale: ${shareUrl}`;
    const nav = navigator as unknown as {
      share?: (data: { title?: string; text?: string; url?: string }) => Promise<void>;
    };

    if (typeof nav?.share === "function") {
      try {
        await nav.share({ title: "QwikSale", text, url: shareUrl });
        return;
      } catch {
        // fall back below
      }
    }
    const wa = `https://wa.me/?text=${encodeURIComponent(text)}`;
    window.open(wa, "_blank", "noopener,noreferrer");
  }

  async function claim() {
    const codeToClaim = refInput.trim();
    if (!codeToClaim) return toast.error("Paste a referral code first");

    try {
      setClaiming(true);
      const r = await fetch("/api/referrals/claim", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({ code: codeToClaim }),
      });

      let j: any = null;
      try {
        j = (await r.json()) as ClaimOk | { error?: string };
      } catch {
        j = { error: `Non-JSON response (${r.status})` };
      }

      if (!r.ok || j?.error) {
        throw new Error(j?.error || "Claim failed");
      }

      toast.success("Referral claimed!");
      setRefInput("");
    } catch (e: any) {
      toast.error(e?.message || "Claim failed");
    } finally {
      setClaiming(false);
    }
  }

  return (
    <div className="container-page bg-[var(--bg)] py-4 sm:py-6 text-[var(--text)]">
      <div className="mx-auto max-w-3xl space-y-4 sm:space-y-6">
        <div className="hero-surface">
          <h1 className="text-xl font-extrabold sm:text-2xl md:text-3xl">
            Refer &amp; Earn
          </h1>
          <p className="mt-1 text-xs text-white/80 sm:text-sm">
            Invite friends to QwikSale. Get <b>30 days of GOLD</b> for every 10
            qualified referrals.
          </p>
        </div>

        <div className="card-surface space-y-4 p-3 sm:p-4">
          {loading ? (
            <div className="text-sm text-[var(--text-muted)]">Loading…</div>
          ) : (
            <>
              <div>
                <div className="mb-1 text-xs text-[var(--text-muted)] sm:text-sm">
                  Your referral code
                </div>

                {/* On phones: stack actions, no giant pill row */}
                <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-3">
                  <div className="flex items-center justify-between gap-3">
                    <code className="font-mono text-sm">{code || "-"}</code>

                    <div className="flex shrink-0 items-center gap-2">
                      <button
                        className="btn-outline h-9 px-3 text-xs sm:text-sm"
                        onClick={copy}
                        disabled={!shareUrl}
                        type="button"
                      >
                        Copy
                      </button>
                      <button
                        className="btn-outline h-9 px-3 text-xs sm:text-sm"
                        onClick={share}
                        disabled={!shareUrl}
                        type="button"
                      >
                        Share
                      </button>
                    </div>
                  </div>

                  <div className="mt-2 break-all text-[11px] text-[var(--text-muted)] sm:text-xs">
                    {shareUrl || "-"}
                  </div>

                  <div className="mt-3">
                    <a
                      href={`https://wa.me/?text=${encodeURIComponent(
                        `Join me on QwikSale: ${shareUrl}`,
                      )}`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex h-9 w-full items-center justify-center rounded-xl border border-[var(--border-subtle)] bg-[var(--bg)] px-4 text-xs font-semibold text-[var(--text)] transition hover:bg-[var(--bg-subtle)] active:scale-[.99] focus-visible:outline-none focus-visible:ring-2 ring-focus sm:w-auto sm:text-sm"
                      aria-disabled={!shareUrl}
                    >
                      Share on WhatsApp
                    </a>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-3 sm:p-4">
                  <div className="text-xs text-[var(--text-muted)] sm:text-sm">
                    Invited
                  </div>
                  <div className="text-xl font-bold text-[var(--text)] sm:text-2xl">
                    {counts.invited}
                  </div>
                </div>
                <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-3 sm:p-4">
                  <div className="text-xs text-[var(--text-muted)] sm:text-sm">
                    Qualified
                  </div>
                  <div className="text-xl font-bold text-[var(--text)] sm:text-2xl">
                    {counts.qualified}
                  </div>
                </div>
              </div>

              <div className="pt-1 text-xs text-[var(--text-muted)]">
                A referral qualifies when your friend creates an account (you
                can later tighten this to phone verification or first listing
                posted).
              </div>
            </>
          )}
        </div>

        <div className="card-surface space-y-3 p-3 sm:p-4">
          <div className="text-sm font-semibold text-[var(--text)]">
            Have a code?
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              void claim();
            }}
            className="flex flex-col gap-2 min-[420px]:flex-row"
          >
            <input
              className="input flex-1"
              placeholder="Paste a referral code"
              value={refInput}
              onChange={(e) => setRefInput(e.target.value)}
              aria-label="Referral code"
              autoComplete="off"
              inputMode="text"
            />
            <button
              type="submit"
              disabled={claiming || !refInput.trim()}
              className="btn-gradient-primary h-9 px-4 text-xs sm:text-sm"
            >
              {claiming ? "Claiming…" : "Claim"}
            </button>
          </form>

          <div className="text-xs text-[var(--text-muted)]">
            Tip: If you arrived via <code className="font-mono">?ref=CODE</code>,
            we’ll remember it - just sign up, then claim.
          </div>
        </div>

        <div className="text-sm">
          <Link href="/dashboard" className="underline underline-offset-2">
            Back to dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
