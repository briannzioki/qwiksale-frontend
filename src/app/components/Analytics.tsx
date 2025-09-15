// src/app/components/Analytics.tsx
"use client";

import { useEffect, useMemo } from "react";
import Script from "next/script";
import { usePathname, useSearchParams } from "next/navigation";

/**
 * GA4 analytics with:
 * - Safe client-only initialization (no duplicate init on Fast Refresh)
 * - Support for multiple GA IDs via comma-separated NEXT_PUBLIC_GA_ID
 * - Manual SPA page_view on route changes (send_page_view: false on config)
 * - Optional consent defaults (respects DNT + NEXT_PUBLIC_GA_DEFAULT_CONSENT)
 * - Lightweight debug logs when NEXT_PUBLIC_ANALYTICS_DEBUG=1
 */

declare global {
  interface Window {
    dataLayer: unknown[];
    gtag: (...args: any[]) => void;
    __qs_ga_init?: boolean;
  }
}

function parseIds(raw?: string | null): string[] {
  if (!raw) return [];
  return raw
    .split(/[, \n]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export default function Analytics() {
  // ✅ Use DOT notation for public envs so Next can inline them on the client
  const gaIds = useMemo(() => parseIds(process.env["NEXT_PUBLIC_GA_ID"]), []);
  const debug = process.env["NEXT_PUBLIC_ANALYTICS_DEBUG"] === "1";
  const defaultConsent = (process.env["NEXT_PUBLIC_GA_DEFAULT_CONSENT"] || "granted").toLowerCase();

  const pathname = usePathname();
  const searchParams = useSearchParams();

  // No IDs configured → render nothing
  if (gaIds.length === 0) return null;

  // Make the first ID definitely a string (for <Script src=...>)
  const [primaryId, ...restIds] = gaIds as [string, ...string[]];
  void restIds; // silence unused var if not referenced elsewhere

  // Page view on route change
  useEffect(() => {
    const url = pathname + (searchParams?.toString() ? `?${searchParams}` : "");
    if (typeof window === "undefined" || typeof window.gtag !== "function") return;
    try {
      if (debug) console.log("[ga] page_view", { page_path: pathname, page_location: url });
      window.gtag("event", "page_view", {
        page_title: document.title,
        page_path: pathname,
        page_location: url,
      });
    } catch (e) {
      if (debug) console.warn("[ga] page_view failed", e);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, searchParams]);

  // One-time safety: if GA script is blocked, avoid console noise on later calls
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (typeof window.gtag !== "function") {
      // Create a no-op shim so calls don't explode before <Script> loads.
      // The real gtag will overwrite this once the script arrives.
      window.gtag = (..._args: any[]) => {
        if (debug) console.log("[ga:shim]", ..._args);
      };
    }
  }, [debug]);

  const initScript = `
    window.dataLayer = window.dataLayer || [];
    function gtag(){ dataLayer.push(arguments); }

    // Avoid double-init across Fast Refresh / re-mounts
    if (!window.__qs_ga_init) {
      // Basic consent model
      // Respect browser "Do Not Track" by defaulting to denied if enabled.
      var dnt = (navigator.doNotTrack == "1" || window.doNotTrack == "1" || navigator.msDoNotTrack == "1");
      var defaultConsent = "${defaultConsent}";
      var granted = dnt ? "denied" : (defaultConsent === "denied" ? "denied" : "granted");
      gtag('consent', 'default', {
        'ad_user_data': granted,
        'ad_personalization': granted,
        'ad_storage': granted,
        'analytics_storage': granted,
        'functionality_storage': 'granted',
        'personalization_storage': granted,
        'security_storage': 'granted'
      });

      gtag('js', new Date());

      // Configure all GA IDs with manual page_view (SPA)
      ${gaIds
        .map(
          (id) =>
            `gtag('config', '${id}', { send_page_view: false, debug_mode: ${
              debug ? "true" : "false"
            } });`
        )
        .join("\n")}

      window.__qs_ga_init = true;
    }
  `;

  return (
    <>
      {/* Load gtag only once — any GA ID works for the loader */}
      <Script
        src={`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(primaryId)}`}
        strategy="afterInteractive"
      />
      <Script id="ga-init" strategy="afterInteractive">
        {initScript}
      </Script>
    </>
  );
}
