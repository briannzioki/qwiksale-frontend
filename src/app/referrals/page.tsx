// src/app/referrals/page.tsx
"use client";

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
      if (!loading) load();
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
    const nav = navigator as unknown as { share?: (data: { title?: string; text?: string; url?: string }) => Promise<void> };

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
        headers: { "Content-Type": "application/json", Accept: "application/json" },
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
    <div className="container-page py-8">
      <div className="mx-auto max-w-3xl space-y-6">
        <div className="hero-surface">
          <h1 className="text-2xl md:text-3xl font-extrabold">Refer &amp; Earn</h1>
          <p className="text-sm text-white/80">
            Invite friends to QwikSale. Get <b>30 days of GOLD</b> for every 10 qualified referrals.
          </p>
        </div>

        <div className="card-surface p-4 space-y-4">
          {loading ? (
            <div className="text-sm text-gray-600 dark:text-slate-300">Loading…</div>
          ) : (
            <>
              <div>
                <div className="text-sm text-gray-600 mb-1">Your referral code</div>
                <div className="inline-flex items-center gap-3 rounded-xl border px-3 py-2 bg-white dark:bg-slate-900">
                  <code className="font-mono text-sm">{code || "—"}</code>
                  <span className="opacity-60" aria-hidden>
                    •
                  </span>
                  <button className="text-sm underline" onClick={copy} disabled={!shareUrl}>
                    Copy signup link
                  </button>
                  <span className="opacity-60" aria-hidden>
                    •
                  </span>
                  <button className="text-sm underline" onClick={share} disabled={!shareUrl}>
                    Share
                  </button>
                </div>
                <div className="mt-2 text-xs text-gray-500 break-all">{shareUrl || "—"}</div>
                <div className="mt-3">
                  <a
                    href={`https://wa.me/?text=${encodeURIComponent(`Join me on QwikSale: ${shareUrl}`)}`}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-lg border px-4 py-2 font-semibold hover:bg-gray-50 dark:hover:bg-slate-800"
                    aria-disabled={!shareUrl}
                  >
                    Share on WhatsApp
                  </a>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl border bg-white dark:bg-slate-900 p-4">
                  <div className="text-sm text-gray-500">Invited</div>
                  <div className="text-2xl font-bold">{counts.invited}</div>
                </div>
                <div className="rounded-xl border bg-white dark:bg-slate-900 p-4">
                  <div className="text-sm text-gray-500">Qualified</div>
                  <div className="text-2xl font-bold">{counts.qualified}</div>
                </div>
              </div>

              <div className="pt-2 text-xs text-gray-500">
                A referral qualifies when your friend creates an account (you can later tighten this to phone
                verification or first listing posted).
              </div>
            </>
          )}
        </div>

        <div className="card-surface p-4 space-y-3">
          <div className="text-sm font-semibold">Have a code?</div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void claim();
            }}
            className="flex gap-2"
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
            <button type="submit" disabled={claiming || !refInput.trim()} className="btn-gradient-primary">
              {claiming ? "Claiming…" : "Claim"}
            </button>
          </form>
          <div className="text-xs text-gray-500">
            Tip: If you arrived via <code className="font-mono">?ref=CODE</code>, we’ll remember it—just sign up, then
            claim.
          </div>
        </div>

        <div className="text-sm">
          <Link href="/dashboard" className="underline">
            Back to dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
