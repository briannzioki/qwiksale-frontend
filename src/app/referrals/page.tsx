"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import toast from "react-hot-toast";

export default function ReferralsPage() {
  const [loading, setLoading] = useState(true);
  const [code, setCode] = useState<string>("");
  const [shareUrl, setShareUrl] = useState<string>("");
  const [counts, setCounts] = useState<{ invited: number; qualified: number }>({ invited: 0, qualified: 0 });
  const [claiming, setClaiming] = useState(false);
  const [refInput, setRefInput] = useState("");

  useEffect(() => {
    let origin = "";
    if (typeof window !== "undefined") origin = window.location.origin;

    (async () => {
      try {
        setLoading(true);
        const r = await fetch("/api/referrals/stats", { cache: "no-store" });
        const j = await r.json();
        if (!r.ok || j?.error) throw new Error(j?.error || "Failed to load");
        setCode(j.code);
        setCounts(j.counts || { invited: 0, qualified: 0 });
        setShareUrl(`${origin}/signup?ref=${j.code}`);
      } catch (e: any) {
        toast.error(e?.message || "Could not load referral stats");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function copy() {
    try {
      await navigator.clipboard.writeText(shareUrl);
      toast.success("Link copied");
    } catch {
      toast.error("Couldn't copy link");
    }
  }

  async function claim() {
    if (!refInput.trim()) return toast.error("Paste a referral code first");
    try {
      setClaiming(true);
      const r = await fetch("/api/referrals/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: refInput.trim() }),
      });
      const j = await r.json();
      if (!r.ok || j?.error) throw new Error(j?.error || "Claim failed");
      toast.success("Referral claimed!");
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
            <div>Loading…</div>
          ) : (
            <>
              <div>
                <div className="text-sm text-gray-600 mb-1">Your referral code</div>
                <div className="inline-flex items-center gap-3 rounded-xl border px-3 py-2 bg-white dark:bg-slate-900">
                  <code className="font-mono text-sm">{code}</code>
                  <span className="opacity-60">•</span>
                  <button className="text-sm underline" onClick={copy}>
                    Copy signup link
                  </button>
                </div>
                <div className="mt-2 text-xs text-gray-500 break-all">{shareUrl}</div>
                <div className="mt-3">
                  <a
                    href={`https://wa.me/?text=${encodeURIComponent(
                      `Join me on QwikSale: ${shareUrl}`
                    )}`}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-lg border px-4 py-2 font-semibold hover:bg-gray-50 dark:hover:bg-slate-800"
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
                A referral qualifies when your friend creates an account (you can later tighten this to phone verification or posting their first listing).
              </div>
            </>
          )}
        </div>

        <div className="card-surface p-4 space-y-3">
          <div className="text-sm font-semibold">Have a code?</div>
          <div className="flex gap-2">
            <input
              className="input flex-1"
              placeholder="Paste a referral code"
              value={refInput}
              onChange={(e) => setRefInput(e.target.value)}
            />
            <button onClick={claim} disabled={claiming} className="btn-primary">
              {claiming ? "Claiming…" : "Claim"}
            </button>
          </div>
          <div className="text-xs text-gray-500">
            Tip: If you arrived via <code>?ref=CODE</code>, we’ll remember it—just sign up, then claim.
          </div>
        </div>

        <div className="text-sm">
          <Link href="/dashboard" className="underline">Back to dashboard</Link>
        </div>
      </div>
    </div>
  );
}
