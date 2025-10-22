// src/app/api/billing/portal/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextResponse } from "next/server";
import { auth } from "@/auth";

function noStore(json: unknown, init?: ResponseInit) {
  const res = NextResponse.json(json, init);
  res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
  return res;
}

export async function POST() {
  const STRIPE_SECRET_KEY = process.env["STRIPE_SECRET_KEY"];
  const STRIPE_BILLING_PORTAL = process.env["STRIPE_BILLING_PORTAL"] || "";

  const returnUrl =
    process.env["NEXT_PUBLIC_APP_URL"] ??
    process.env["NEXTAUTH_URL"] ??
    (process.env["VERCEL_URL"] ? `https://${process.env["VERCEL_URL"]}` : "http://localhost:3000");

  if (!STRIPE_SECRET_KEY || !STRIPE_BILLING_PORTAL) {
    return noStore({ error: "Stripe not configured" }, { status: 501 });
  }

  try {
    const session = await auth().catch(() => null);
    const email = (session?.user as any)?.email as string | undefined;
    if (!email) return noStore({ error: "Unauthorized" }, { status: 401 });

    // Normally you'd create a portal session via Stripe SDK here.
    // For now, redirect to configured portal URL (or fallback to app origin).
    const res = NextResponse.redirect(STRIPE_BILLING_PORTAL || returnUrl, { status: 303 }); // 303 after POST
    res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
    return res;
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn("[billing/portal POST] error:", e);
    return noStore({ error: "Server error" }, { status: 500 });
  }
}
