"use client";
// src/app/report/page.tsx

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import toast from "react-hot-toast";
import Link from "next/link";

type ReportType = "REPORT_LISTING" | "REPORT_USER" | "BUG";

type ApiOk = { ok: true; id?: string };
type ApiErr = { error?: string };

const FETCH_TIMEOUT_MS = 15_000;
const MAX_MESSAGE_LEN = 1200;
const MAX_URL_LEN = 512;
const MAX_ID_LEN = 64;

function ReportPageInner() {
  const sp = useSearchParams();
  const initialProductId = (sp.get("productId") || sp.get("id") || "").slice(0, MAX_ID_LEN);

  const [type, setType] = useState<ReportType>("REPORT_LISTING");
  const [productId, setProductId] = useState(initialProductId);
  const [url, setUrl] = useState("");
  const [message, setMessage] = useState("");
  const [hpt, setHpt] = useState(""); // honeypot
  const [submitting, setSubmitting] = useState(false);

  const abortRef = useRef<AbortController | null>(null);

  // Pre-fill current URL (client-only)
  useEffect(() => {
    if (typeof window !== "undefined") {
      setUrl(String(window.location.href).slice(0, MAX_URL_LEN));
    }
  }, []);

  const canSubmit = useMemo(() => {
    const m = message.trim();
    return m.length >= 8 && m.length <= MAX_MESSAGE_LEN && !submitting;
  }, [message, submitting]);

  function sanitizeId(v: string) {
    return v.replace(/[^\w-]/g, "").slice(0, MAX_ID_LEN);
  }

  function sanitizeUrl(v: string) {
    return String(v).slice(0, MAX_URL_LEN);
  }

  function sanitizeMessage(v: string) {
    return v.replace(/\s+/g, " ").trim().slice(0, MAX_MESSAGE_LEN);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();

    const msg = sanitizeMessage(message);
    if (msg.length < 8) {
      toast.error("Describe the problem (8+ characters).");
      return;
    }

    setSubmitting(true);
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    // Auto-enrich context (best-effort)
    const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
    const lang = typeof navigator !== "undefined" ? navigator.language : "";
    const ref = typeof document !== "undefined" ? document.referrer : "";

    const payload = {
      type,
      productId: productId ? sanitizeId(productId) : null,
      url: sanitizeUrl(url),
      message: msg,
      hpt, // honeypot
      meta: {
        ua,
        lang,
        ref,
        tz: Intl.DateTimeFormat().resolvedOptions().timeZone ?? "UTC",
      },
    };

    // Manual timeout
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    try {
      // ✅ FIX: post to the correct API route
      const res = await fetch("/api/report", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        cache: "no-store",
        keepalive: true, // still tries to send if user navigates away
        signal: controller.signal,
        body: JSON.stringify(payload),
      });

      clearTimeout(timer);

      let j: ApiOk | ApiErr = {};
      try {
        j = (await res.json()) as ApiOk | ApiErr;
      } catch {
        j = { error: `Non-JSON response (${res.status})` };
      }

      if (!res.ok || (j as ApiErr)?.error) {
        throw new Error((j as ApiErr)?.error || `Failed to submit (HTTP ${res.status})`);
      }

      toast.success("Report received. Thank you for keeping QwikSale safe.");
      setMessage("");
      // keep productId/url – useful if user wants to send another note
    } catch (err: any) {
      if (err?.name === "AbortError") {
        toast.error("Took too long — try again.");
      } else {
        toast.error(err?.message || "Something went wrong");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="container-page py-8">
      <div className="mx-auto max-w-2xl space-y-6">
        <div className="hero-surface">
          <h1 className="text-2xl md:text-3xl font-extrabold">Report a problem</h1>
          <p className="text-sm text-white/80">
            Flag suspicious listings, safety issues, or technical bugs. We review every report.
          </p>
        </div>

        <form onSubmit={submit} className="card-surface p-4 space-y-4">
          <div className="grid md:grid-cols-2 gap-3">
            <div>
              <label className="label" htmlFor="report-type">Report type</label>
              <select
                id="report-type"
                className="input"
                value={type}
                onChange={(e) => setType(e.target.value as ReportType)}
              >
                <option value="REPORT_LISTING">Problem with a listing</option>
                <option value="REPORT_USER">Problem with a user</option>
                <option value="BUG">Bug / Technical issue</option>
              </select>
            </div>

            <div>
              <label className="label" htmlFor="listing-id">Listing ID (optional)</label>
              <input
                id="listing-id"
                className="input"
                value={productId}
                onChange={(e) => setProductId(sanitizeId(e.target.value))}
                placeholder="Paste product ID if relevant"
                autoComplete="off"
                inputMode="text"
              />
            </div>
          </div>

          <div>
            <label className="label" htmlFor="page-url">Page URL (auto)</label>
            <input
              id="page-url"
              className="input"
              value={url}
              onChange={(e) => setUrl(sanitizeUrl(e.target.value))}
              inputMode="url"
            />
          </div>

          {/* Honeypot (hidden from humans) */}
          <div className="hidden" aria-hidden="true">
            <label htmlFor="hp">Leave empty</label>
            <input id="hp" value={hpt} onChange={(e) => setHpt(e.target.value)} />
          </div>

          <div>
            <label className="label" htmlFor="details">What happened?</label>
            <textarea
              id="details"
              className="input min-h-32"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              maxLength={MAX_MESSAGE_LEN}
              placeholder="Briefly describe the issue and include any relevant IDs or steps to reproduce…"
            />
            <div className="flex items-center justify-between">
              <p className="text-xs text-gray-500 mt-1">
                Don’t share sensitive info. We may contact you for details.
              </p>
              <p className="text-xs text-gray-400 mt-1">
                {message.length}/{MAX_MESSAGE_LEN}
              </p>
            </div>
          </div>

          <div className="flex gap-3">
            <button disabled={!canSubmit} className="btn-gradient-primary">
              {submitting ? "Sending…" : "Send report"}
            </button>
            <button
              type="button"
              className="btn-outline"
              onClick={() => {
                setMessage("");
              }}
              disabled={submitting || message.length === 0}
            >
              Clear
            </button>
          </div>

          <div className="text-xs text-gray-500">
            Need help now?{" "}
            <Link href="/contact" className="underline">
              Contact support
            </Link>
            .
          </div>
        </form>
      </div>
    </div>
  );
}

export default function Page() {
  return (
    <Suspense fallback={<div />}>
      <ReportPageInner />
    </Suspense>
  );
}
