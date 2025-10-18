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
  // App-specific events emitted in UI:
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
// Vercel will inline this at build time; undefined locally is fine.
const IS_PREVIEW = process.env["VERCEL_ENV"] === "preview";

/* ----------------------------- DNT / bots ----------------------------- */

function isDoNotTrack(): boolean {
  if (typeof window === "undefined") return false;
  // Respect common DNT flags
  const w: any = window;
  const n: any = navigator;
  return (
    n?.doNotTrack === "1" ||
    w?.doNotTrack === "1" ||
    n?.msDoNotTrack === "1"
  );
}

function isAutomation(): boolean {
  if (typeof navigator === "undefined") return false;
  return !!(navigator as any).webdriver;
}

/* ------------------------- Client: context utils ---------------------- */

let cachedCtx: TrackContext | null = null;

function getViewport(): string {
  try {
    // Prefer VisualViewport when available to account for zoom/OSK
    const vv = (window as any).visualViewport;
    if (vv && typeof vv.width === "number" && typeof vv.height === "number") {
      return `${Math.max(0, Math.round(vv.width))}x${Math.max(0, Math.round(vv.height))}`;
    }
  } catch {}
  try {
    return `${Math.max(0, window.innerWidth)}x${Math.max(0, window.innerHeight)}`;
  } catch {}
  return "";
}

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

  const base: TrackContext = { sessionId, vp: getViewport() };
  try {
    if (document.referrer) base.ref = document.referrer;
  } catch {}

  cachedCtx = base;
  return { ...cachedCtx, url: location.href, ts: Date.now() };
}

/* ---------------------------- PII guardrail --------------------------- */

function sanitizePayload(p: Payload): Payload {
  // Keep this aggressive; add keys if you see leaks in Sentry/GA logs.
  const banned = /pass(word)?|token|secret|otp|pin|mpesa|phone|msisdn|card/i;
  const out: Payload = {};
  for (const [k, v] of Object.entries(p || {})) {
    if (banned.test(k)) continue;
    // Avoid shipping gigantic strings
    if (typeof v === "string" && v.length > 4000) {
      out[k] = (v as string).slice(0, 4000);
      continue;
    }
    out[k] = v;
  }
  return out;
}

/* ------------------------ Third-party forwarders ---------------------- */

function trySentryBreadcrumb(event: EventName, payload: Payload & TrackContext) {
  try {
    // @ts-ignore - optional global from @sentry/nextjs client
    const S = (window as any).Sentry;
    if (S?.addBreadcrumb) {
      S.addBreadcrumb({
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
    const w: any = window;
    // Prefer gtag; fall back to dataLayer if present
    if (typeof w.gtag === "function") {
      w.gtag("event", event, payload);
      return;
    }
    if (Array.isArray(w.dataLayer)) {
      w.dataLayer.push({ event, ...payload });
    }
  } catch {}
}

function tryPlausible(event: EventName, payload: Payload & TrackContext) {
  try {
    const w: any = window;
    if (typeof w.plausible === "function") {
      w.plausible(event, { props: payload });
    }
  } catch {}
}

/* ---------------------------- Public API ------------------------------ */

/**
 * Client-side track:
 * - respects Do-Not-Track and webdriver (bots)
 * - adds context (session, viewport, ref, url, ts)
 * - sanitizes payload
 * - forwards to GA/Plausible/Sentry breadcrumb
 * - dispatches a DOM CustomEvent for in-app listeners (back-compat)
 */
export function track(event: EventName, payload: Payload = {}) {
  if (typeof window === "undefined") return;
  if (isAutomation()) return; // skip automation
  if (isDoNotTrack()) return; // respect DNT

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

/** Mark a page view once after hydration. */
let __pvSent = false;
export function trackPageView(extra?: Payload) {
  if (__pvSent) return;
  __pvSent = true;
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
