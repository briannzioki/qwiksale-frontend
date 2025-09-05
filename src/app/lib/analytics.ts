// src/app/lib/analytics.ts
import { NextResponse } from "next/server";

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
  | "stk_initiated";

type Payload = Record<string, unknown>;

/** Server-side: log + set response headers you can inspect later. */
export function serverTrack<T>(
  res: NextResponse<T>,
  event: EventName,
  payload: Payload = {}
): NextResponse<T> {
  try {
    // Log now (observability during dev)
    // eslint-disable-next-line no-console
    console.info("[track:server]", event, payload);

    // Add lightweight headers (safe for 1 value; for multiples, append with index)
    const b64 = Buffer.from(JSON.stringify(payload)).toString("base64");
    res.headers.set("X-QS-Event", event);
    res.headers.set("X-QS-Event-Payload", b64);
  } catch {
    /* ignore */
  }
  return res;
}

/** Client-side: console + forward to GA / Plausible if present. */
export function track(event: EventName, payload: Payload = {}) {
  if (typeof window === "undefined") return;
  // Debug
  // eslint-disable-next-line no-console
  console.info("[track]", event, payload);

  // GA4 (gtag)
  try {
    // @ts-ignore
    if (window.gtag) {
      // @ts-ignore
      window.gtag("event", event, payload);
    }
  } catch {}

  // Plausible
  try {
    // @ts-ignore
    if (window.plausible) {
      // @ts-ignore
      window.plausible(event, { props: payload });
    }
  } catch {}
}
