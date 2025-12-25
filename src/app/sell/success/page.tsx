"use client";
// src/app/sell/success/page.tsx

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import toast from "react-hot-toast";
import { track } from "@/app/lib/analytics";

// Prefer configured public URL; fall back to current origin (client-only)
const ENV_SITE = (process.env["NEXT_PUBLIC_APP_URL"] ?? "").replace(/\/+$/, "");
const SUBSCRIPTIONS_ENABLED =
  (process.env["NEXT_PUBLIC_SUBSCRIPTIONS_ENABLED"] ?? "1") !== "0";

function SellSuccessInner() {
  const sp = useSearchParams();

  const [origin, setOrigin] = useState<string>("");
  const [canNativeShare, setCanNativeShare] = useState<boolean>(false);

  useEffect(() => {
    if (typeof window !== "undefined") {
      setOrigin(ENV_SITE || window.location.origin);
      setCanNativeShare(typeof (navigator as any)?.share === "function");
    }
  }, []);

  const productId = sp.get("id") || "";

  const productUrl = useMemo(() => {
    if (!origin || !productId) return "";
    return `${origin}/product/${encodeURIComponent(productId)}`;
  }, [origin, productId]);

  async function copy() {
    if (!productUrl) return;
    try {
      await navigator.clipboard.writeText(productUrl);
      toast.success("Link copied to clipboard");
      track("contact_click", {
        where: "sell_success_copy",
        productId,
        productUrl,
      });
    } catch {
      toast.error("Couldn't copy link");
    }
  }

  async function shareNative() {
    if (!productUrl || !canNativeShare) return;
    try {
      await (navigator as any).share({
        title: "My QwikSale listing",
        text: "Check out my new listing on QwikSale:",
        url: productUrl,
      });
      track("message_sent", {
        where: "sell_success_native_share",
        productId,
        productUrl,
      });
    } catch {
      // user cancelled
    }
  }

  const waShare = useMemo(() => {
    if (!productUrl) return "";
    const text = `Check out my new listing on QwikSale:\n${productUrl}`;
    return `https://wa.me/?text=${encodeURIComponent(text)}`;
  }, [productUrl]);

  return (
    <div className="container-page py-8 text-[var(--text)]">
      <div className="mx-auto max-w-2xl space-y-6 text-center">
        {/* Success hero */}
        <div
          className="animate-in fade-in zoom-in duration-500 rounded-2xl bg-gradient-to-r from-[#161748] via-[#478559] to-[#39a0ca] text-white shadow-soft dark:shadow-none"
          role="status"
          aria-live="polite"
        >
          <div className="container-page py-8 text-white">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full border-2 border-[var(--border-subtle)] bg-[var(--bg-subtle)]/20 backdrop-blur-sm">
              <CheckIcon />
            </div>
            <h1 className="text-2xl font-semibold tracking-tight md:text-3xl text-white">
              Listing Posted 🎉
            </h1>
            <p className="mt-1 text-sm text-white/80">
              Your item is now live on QwikSale. Share it with buyers and start
              getting messages.
            </p>
          </div>
        </div>

        {/* Actions */}
        <div className="space-y-4 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-5 shadow-soft">
          {productId ? (
            <>
              <div className="text-sm text-[var(--text-muted)]">
                Listing URL:{" "}
                <code className="break-all rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-subtle)] px-2 py-1 font-mono text-[var(--text)]">
                  {productUrl || "…"}
                </code>
              </div>

              <div className="flex flex-wrap items-center justify-center gap-3">
                <Link
                  href={`/product/${productId}`}
                  className="btn-gradient-primary"
                  onClick={() =>
                    track("product_created", {
                      where: "sell_success_view",
                      productId,
                    })
                  }
                >
                  View listing
                </Link>

                <button
                  type="button"
                  onClick={copy}
                  disabled={!productUrl}
                  aria-disabled={!productUrl}
                  className="btn-outline"
                >
                  Copy link
                </button>

                <a
                  href={waShare || "#"}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`btn-outline ${
                    !waShare ? "pointer-events-none opacity-60" : ""
                  }`}
                  aria-disabled={!waShare}
                  onClick={() =>
                    waShare &&
                    track("message_sent", {
                      where: "sell_success_whatsapp",
                      productId,
                      productUrl,
                    })
                  }
                >
                  Share on WhatsApp
                </a>

                {canNativeShare && (
                  <button
                    type="button"
                    onClick={shareNative}
                    className="btn-outline"
                    disabled={!productUrl}
                    aria-disabled={!productUrl}
                  >
                    Share…
                  </button>
                )}
              </div>
            </>
          ) : (
            <div className="text-sm text-[var(--text-muted)]">
              Your listing was posted. (Tip: pass{" "}
              <code className="rounded-md border border-[var(--border-subtle)] bg-[var(--bg-subtle)] px-1.5 py-0.5 font-mono text-[var(--text)]">
                ?id=&lt;productId&gt;
              </code>{" "}
              to this page to enable share buttons.)
            </div>
          )}

          <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
            <Link href="/dashboard" className="btn-outline">
              Go to dashboard
            </Link>
            <Link
              href="/sell"
              className="btn-outline"
              onClick={() =>
                track("product_created", { where: "sell_success_post_another" })
              }
            >
              Post another
            </Link>
          </div>
        </div>

        {/* Tips / upsell */}
        {SUBSCRIPTIONS_ENABLED && (
          <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-5 text-left shadow-soft">
            <h2 className="mb-2 text-base font-extrabold tracking-tight text-[var(--text)]">
              Boost your chances
            </h2>
            <ul className="ml-5 list-disc space-y-1 text-sm text-[var(--text-muted)]">
              <li>Add 3-6 clear photos from different angles.</li>
              <li>
                Write an honest description and mention any
                accessories/warranty.
              </li>
              <li>
                Enable WhatsApp on your phone number so buyers can reach you fast.
              </li>
              <li>
                Upgrade to{" "}
                <strong className="text-[var(--text)]">Gold</strong> or{" "}
                <strong className="text-[var(--text)]">Platinum</strong> for a
                badge and top placement in search results.
              </li>
            </ul>
            <div className="mt-3">
              <Link
                href="/account/billing"
                className="btn-gradient-primary"
                onClick={() =>
                  track("payment_initiated", { where: "sell_success_upgrade_cta" })
                }
              >
                Upgrade subscription
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function SellSuccessPage() {
  return (
    <Suspense fallback={<div />}>
      <SellSuccessInner />
    </Suspense>
  );
}

function CheckIcon() {
  return (
    <svg
      className="h-8 w-8 text-white"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M20 7L10 17l-6-6"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
