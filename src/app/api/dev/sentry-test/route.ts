export const preferredRegion = ['fra1'];
// src/app/api/dev/sentry-test/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";

function noStore(json: unknown, init?: ResponseInit) {
  const res = NextResponse.json(json, init);
  res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
  res.headers.set("Pragma", "no-cache");
  res.headers.set("Expires", "0");
  return res;
}

export async function POST() {
  try {
    // Simulate a server-side error and capture it.
    const err = new Error("qwiksale: server error (button)");
    Sentry.captureException(err);
    return noStore({ ok: true });
  } catch (e: any) {
    return noStore({ error: e?.message || "Server error" }, { status: 500 });
  }
}

export async function GET() {
  // Allow GET too if you want to click from the address bar (optional)
  return POST();
}
