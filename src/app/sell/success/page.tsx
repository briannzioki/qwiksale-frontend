// src/app/sell/success/page.tsx
"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { track } from "@/app/lib/analytics";

// Prefer configured public URL; fall back to current origin (client-only)
const ENV_SITE = (process.env["NEXT_PUBLIC_APP_URL"] ?? "").replace(/\/+$/, "");
const SUBSCRIPTIONS_ENABLED =
  (process.env["NEXT_PUBLIC_SUBSCRIPTIONS_ENABLED"] ?? "1") !== "0";
const REDIRECT_SECONDS = 6;

function SellSuccessInner() {
  const sp = useSearchParams();
  const router = useRouter();

  const [origin, setOrigin] = useState<string>("");
  const [canNativeShare, setCanNativeShare] = useState<boolean>(false);
  const [secondsLeft, setSecondsLeft] = useState<number>(REDIRECT_SECONDS);

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

  // Auto-redirect to /dashboard with a small countdown
  useEffect(() => {
    // tick every second
    const tick = setInterval(() => {
      setSecondsLeft((s) => Math.max(0, s - 1));
    }, 1000);

    // final redirect
    const t = setTimeout(() => {
      router.replace("/dashboard");
    }, REDIRECT_SECONDS * 1000);

    return () => {
      clearTimeout(t);
      clearInterval(tick);
    };
  }, [router]);

  async function copy() {
    if (!productUrl) return;
    try {
      await navigator.clipboard.writeText(productUrl);
      toast.success("Link copied to clipboard");
      track("contact_click", { where: "sell_success_copy", productId, productUrl });
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
      track("message_sent", { where: "sell_success_native_share", productId, productUrl });
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
    <div className="container-page py-8">
      <div className="mx-auto max-w-2xl space-y-6 text-center">
        {/* Success hero */}
        <div
          className="rounded-2xl p-10 text-white bg-gradient-to-br from-brandNavy via-brandGreen to-brandBlue shadow-soft dark:shadow-none animate-in fade-in zoom-in duration-500"
          role="status"
          aria-live="polite"
        >
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-white/15 ring-2 ring-white/20">
            <CheckIcon />
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight">Listing Posted 🎉</h1>
          <p className="mt-2 text-white/90">
            Your item is now live on QwikSale. Share it with buyers and start getting
            messages.
          </p>
          <p className="mt-3 text-sm text-white/90">
            Redirecting to your dashboard in <strong>{secondsLeft}</strong>s…
          </p>
        </div>

        {/* Actions */}
        <div className="card p-5 space-y-4">
          {productId ? (
            <>
              <div className="text-sm text-gray-700 dark:text-slate-200">
                Listing URL:{" "}
                <code className="font-mono break-all">{productUrl || "…"}</code>
              </div>

              <div className="flex flex-wrap items-center justify-center gap-3">
                <Link
                  href={`/product/${productId}`}
                  className="btn-gradient-primary"
                  onClick={() => track("product_created", { where: "sell_success_view", productId })}
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
                  className={`btn-gradient-accent ${!waShare ? "pointer-events-none opacity-60" : ""}`}
                  aria-disabled={!waShare}
                  onClick={() =>
                    waShare &&
                    track("message_sent", { where: "sell_success_whatsapp", productId, productUrl })
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
            <div className="text-sm text-gray-700 dark:text-slate-200">
              Your listing was posted. (Tip: pass{" "}
              <code className="font-mono">?id=&lt;productId&gt;</code> to this page to enable share
              buttons.)
            </div>
          )}

          <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
            <Link href="/dashboard" className="btn-outline">
              Go to dashboard now
            </Link>
            <Link
              href="/sell"
              className="btn-outline"
              onClick={() => track("product_created", { where: "sell_success_post_another" })}
            >
              Post another
            </Link>
          </div>
        </div>

        {/* Tips / upsell */}
        {SUBSCRIPTIONS_ENABLED && (
          <div className="card p-5 text-left">
            <h2 className="text-base font-semibold mb-2">Boost your chances</h2>
            <ul className="ml-5 list-disc space-y-1 text-sm text-gray-700 dark:text-slate-300">
              <li>Add 3–6 clear photos from different angles.</li>
              <li>Write an honest description and mention any accessories/warranty.</li>
              <li>Enable WhatsApp on your phone number so buyers can reach you fast.</li>
              <li>
                Upgrade to <strong>Gold</strong> or <strong>Platinum</strong> for a badge and top
                placement in search results.
              </li>
            </ul>
            <div className="mt-3">
              <Link
                href="/account/billing"
                className="btn-gradient-primary"
                onClick={() => track("payment_initiated", { where: "sell_success_upgrade_cta" })}
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
  // Wrap useSearchParams usage in a Suspense boundary to satisfy Next.js 15 CSR bailout rules.
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
