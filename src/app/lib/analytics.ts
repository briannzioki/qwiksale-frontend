// src/app/lib/analytics.ts
import { NextResponse } from "next/server";

/* ------------------------------- Types -------------------------------- */

export type EventName =
  | "product_created"
  | "product_deleted"
  | "product_featured_toggle"
  | "favorite_added"
  | "favorite_removed"
  | "contact_click"
  | "message_sent"
  | "report_submitted"
  | "profile_completed"
  | "email_verified"
  | "payment_initiated"
  | "stk_initiated"
  | "page_view";

type JsonPrimitive = string | number | boolean | null;
export type Payload = Record<string, JsonPrimitive | JsonPrimitive[] | undefined>;

type TrackContext = {
  sessionId?: string;
  userId?: string;
  url?: string;
  ref?: string;
  vp?: string; // viewport WxH
  ts?: number; // epoch ms
};

/* --------------------------- Environment gates ------------------------ */

const ENV = process.env.NODE_ENV;
const IS_PROD = ENV === "production";
const IS_PREVIEW = process.env["VERCEL_ENV"] === "preview";

/** Flip to true to POST to your own endpoint (implement /api/analytics). */
const USE_BEACON_ENDPOINT = false;

/* ------------------------- Client: context utils ---------------------- */

let cachedCtx: TrackContext | null = null;

function getClientContext(): TrackContext {
  if (typeof window === "undefined") return {};
  if (cachedCtx) return { ...cachedCtx, url: location.href, ts: Date.now() };

  // Lazy-create a session id that survives reloads
  let sessionId = "";
  try {
    sessionId = localStorage.getItem("qs_sid") || "";
    if (!sessionId) {
      sessionId = Math.random().toString(36).slice(2) + Date.now().toString(36);
      localStorage.setItem("qs_sid", sessionId);
    }
  } catch {}

  const vp = `${Math.max(0, window.innerWidth)}x${Math.max(0, window.innerHeight)}`;

  // Build without undefined fields (to satisfy exactOptionalPropertyTypes)
  const base: TrackContext = { sessionId, vp };
  if (document.referrer) base.ref = document.referrer;

  cachedCtx = base;

  return { ...cachedCtx, url: location.href, ts: Date.now() };
}

/* ---------------------------- PII guardrail --------------------------- */
/** Best-effort guard: drops obviously sensitive keys. */
function sanitizePayload(p: Payload): Payload {
  const banned = /pass(word)?|token|secret|otp|pin|mpesa|phone|msisdn|card/i;
  const out: Payload = {};
  for (const [k, v] of Object.entries(p || {})) {
    if (banned.test(k)) continue;
    out[k] = v;
  }
  return out;
}

/* ------------------------ Third-party forwarders ---------------------- */

function trySentryBreadcrumb(event: EventName, payload: Payload & TrackContext) {
  try {
    // @ts-ignore - optional global from @sentry/nextjs client
    if (window.Sentry?.addBreadcrumb) {
      // @ts-ignore
      window.Sentry.addBreadcrumb({
        category: "analytics",
        level: "info",
        message: event,
        data: payload,
      });
    }
  } catch {}
}

function tryGA(event: EventName, payload: Payload & TrackContext) {
  try {
    // @ts-ignore
    if (typeof window.gtag === "function") {
      // @ts-ignore
      window.gtag("event", event, payload);
    }
  } catch {}
}

function tryPlausible(event: EventName, payload: Payload & TrackContext) {
  try {
    // @ts-ignore
    if (typeof window.plausible === "function") {
      // @ts-ignore
      window.plausible(event, { props: payload });
    }
  } catch {}
}

function tryBeacon(event: EventName, payload: Payload & TrackContext) {
  if (!USE_BEACON_ENDPOINT) return;
  try {
    const body = JSON.stringify({ event, ...payload });
    if (navigator.sendBeacon) {
      navigator.sendBeacon("/api/analytics", new Blob([body], { type: "application/json" }));
    } else {
      // fire-and-forget
      fetch("/api/analytics", { method: "POST", body, headers: { "Content-Type": "application/json" }, keepalive: true })
        .catch(() => {});
    }
  } catch {}
}

/* ---------------------------- Public API ------------------------------ */

/**
 * Client-side track:
 * - adds context
 * - sanitizes payload
 * - forwards to GA/Plausible/Sentry (and optional beacon)
 */
export function track(event: EventName, payload: Payload = {}) {
  if (typeof window === "undefined") return;
  const ctx = getClientContext();
  const safe = sanitizePayload(payload);
  const merged: Payload & TrackContext = { ...safe, ...ctx };

  // Reduce noise in dev/preview but still log
  if (!IS_PROD || IS_PREVIEW) {
    // eslint-disable-next-line no-console
    console.info("[track]", event, merged);
  }

  trySentryBreadcrumb(event, merged);
  tryGA(event, merged);
  tryPlausible(event, merged);
  tryBeacon(event, merged);
}

/**
 * Convenience: mark a page view once after hydration.
 * Call inside a client effect (e.g., in AppShell).
 */
export function trackPageView(extra?: Payload) {
  track("page_view", extra);
}

/**
 * Micro RUM marks to measure UX timings in your UI flow.
 * Example:
 *  startMark("sell_flow"); …; endMark("sell_flow");
 */
export function startMark(name: string) {
  try {
    performance.mark(`${name}_start`);
  } catch {}
}
export function endMark(name: string, asEvent?: EventName) {
  try {
    performance.mark(`${name}_end`);
    performance.measure(name, `${name}_start`, `${name}_end`);
    const m = performance.getEntriesByName(name, "measure").pop();
    if (m && asEvent) {
      track(asEvent, { dur_ms: Math.round(m.duration) });
    }
  } catch {}
}

/* ------------------------ Server-side helpers ------------------------ */

/**
 * Attach tiny analytics headers to a NextResponse you already created.
 * Payload is chunked to avoid very long headers.
 */
export function serverTrack<T>(
  res: NextResponse<T>,
  event: EventName,
  payload: Payload = {}
): NextResponse<T> {
  try {
    // eslint-disable-next-line no-console
    if (!IS_PROD || IS_PREVIEW) console.info("[track:server]", event, payload);

    const safe = sanitizePayload(payload);
    const json = JSON.stringify(safe);
    const b64 = Buffer.from(json).toString("base64");

    // Some CDNs cap header length; chunk defensively at ~3.5KB
    const chunkSize = 3584;
    if (b64.length <= chunkSize) {
      res.headers.set("X-QS-Event", event);
      res.headers.set("X-QS-Event-Payload", b64);
    } else {
      res.headers.set("X-QS-Event", event);
      const chunks = Math.ceil(b64.length / chunkSize);
      res.headers.set("X-QS-Event-Chunks", String(chunks));
      for (let i = 0; i < chunks; i++) {
        const part = b64.slice(i * chunkSize, (i + 1) * chunkSize);
        res.headers.set(`X-QS-Event-Payload-${i + 1}`, part);
      }
    }
  } catch {
    /* ignore */
  }
  return res;
}

/**
 * Helper to create a JSON NextResponse with server tracking in one go.
 * Usage:
 *   return jsonWithTrack({ok:true}, "favorite_added", {productId});
 */
export function jsonWithTrack<T extends object>(
  body: T,
  event: EventName,
  payload: Payload = {},
  init?: ResponseInit
) {
  const res = NextResponse.json(body, init);
  return serverTrack(res, event, payload);
}
