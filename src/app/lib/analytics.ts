// src/app/lib/analytics.ts

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
  | "page_view"
  // App-specific events we already emit in UI:
  | "product_view"
  | "product_click"
  | "product_share"
  | "service_view"
  | "service_click"
  | "service_share"
  | "service_deleted";

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

  const base: TrackContext = { sessionId, vp };
  if (document.referrer) base.ref = document.referrer;
  cachedCtx = base;

  return { ...cachedCtx, url: location.href, ts: Date.now() };
}

/* ---------------------------- PII guardrail --------------------------- */

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

/* ---------------------------- Public API ------------------------------ */

/**
 * Client-side track:
 * - adds context
 * - sanitizes payload
 * - forwards to GA/Plausible/Sentry
 * - dispatches a DOM CustomEvent for in-app listeners (back-compat)
 */
export function track(event: EventName, payload: Payload = {}) {
  if (typeof window === "undefined") return;
  const ctx = getClientContext();
  const safe = sanitizePayload(payload);
  const merged: Payload & TrackContext = { ...safe, ...ctx };

  if (!IS_PROD || IS_PREVIEW) {
    // eslint-disable-next-line no-console
    console.info("[track]", event, merged);
  }

  trySentryBreadcrumb(event, merged);
  tryGA(event, merged);
  tryPlausible(event, merged);

  // Back-compat: let existing listeners keep working
  try {
    window.dispatchEvent(new CustomEvent("qs:track", { detail: { event, payload: merged } }));
  } catch {}
}

/** Convenience: mark a page view once after hydration. */
export function trackPageView(extra?: Payload) {
  track("page_view", extra);
}

/** Micro RUM marks to measure UX timings in your UI flow. */
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
