// src/app/sell/success/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import toast from "react-hot-toast";

const SITE_URL =
  (process.env.NEXT_PUBLIC_SITE_URL || "").replace(/\/+$/, ""); // no trailing slash
const SUBSCRIPTIONS_ENABLED = process.env.NEXT_PUBLIC_SUBSCRIPTIONS_ENABLED !== "0";

export default function SellSuccessPage() {
  const sp = useSearchParams();
  const [origin, setOrigin] = useState<string>("");
  const [canNativeShare, setCanNativeShare] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined") {
      // Prefer env base if provided; otherwise use current origin
      setOrigin(SITE_URL || window.location.origin);
      setCanNativeShare(typeof (navigator as any)?.share === "function");
    }
  }, []);

  const productId = sp.get("id") || "";
  const productUrl = useMemo(() => {
    if (!origin || !productId) return "";
    return `${origin}/product/${productId}`;
  }, [origin, productId]);

  async function copy() {
    if (!productUrl) return;
    try {
      await navigator.clipboard.writeText(productUrl);
      toast.success("Link copied to clipboard");
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
    } catch {
      // user canceled or share not available
    }
  }

  const waShare = useMemo(() => {
    if (!productUrl) return "";
    const text = `Check out my new listing on QwikSale:\n${productUrl}`;
    return `https://wa.me/?text=${encodeURIComponent(text)}`;
  }, [productUrl]);

  return (
    <div className="container-page py-8">
      <div className="max-w-2xl mx-auto space-y-6 text-center">
        {/* Success hero */}
        <div className="rounded-2xl p-10 text-white bg-gradient-to-br from-brandNavy via-brandGreen to-brandBlue shadow-soft dark:shadow-none animate-in fade-in zoom-in duration-500">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-white/15 ring-2 ring-white/20">
            <CheckIcon />
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight">Listing Posted 🎉</h1>
          <p className="mt-2 text-white/90">
            Your item is now live on QwikSale. Share it with buyers and start getting
            messages.
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
                <Link href={`/product/${productId}`} className="btn-primary">
                  View listing
                </Link>

                <button
                  type="button"
                  onClick={copy}
                  disabled={!productUrl}
                  className="btn-outline"
                >
                  Copy link
                </button>

                <a
                  href={waShare || "#"}
                  target="_blank"
                  rel="noreferrer"
                  className="btn-success"
                  aria-disabled={!waShare}
                >
                  Share on WhatsApp
                </a>

                {canNativeShare && (
                  <button
                    type="button"
                    onClick={shareNative}
                    className="btn-ghost"
                    disabled={!productUrl}
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
            <Link href="/" className="btn-outline">
              Go to homepage
            </Link>
            <Link href="/sell" className="btn-ghost">
              Post another
            </Link>
          </div>
        </div>

        {/* Tips / upsell */}
        {SUBSCRIPTIONS_ENABLED && (
          <div className="card p-5 text-left">
            <h2 className="text-base font-semibold mb-2">Boost your chances</h2>
            <ul className="list-disc ml-5 space-y-1 text-sm text-gray-700 dark:text-slate-300">
              <li>Add 3–6 clear photos from different angles.</li>
              <li>Write an honest description and mention any accessories/warranty.</li>
              <li>Enable WhatsApp on your phone number so buyers can reach you fast.</li>
              <li>
                Upgrade to <strong>Gold</strong> or <strong>Platinum</strong> for a badge and top
                placement in search results.
              </li>
            </ul>
            <div className="mt-3">
              <Link href="/settings/billing" className="btn-primary">
                Upgrade subscription
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function CheckIcon() {
  return (
    <svg className="h-8 w-8 text-white" viewBox="0 0 24 24" fill="none" aria-hidden>
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
