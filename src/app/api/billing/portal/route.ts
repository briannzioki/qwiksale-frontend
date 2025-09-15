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
  const returnUrl = process.env["NEXT_PUBLIC_SITE_URL"] || process.env["NEXT_PUBLIC_APP_URL"] || "https://example.com";

  if (!STRIPE_SECRET_KEY || !STRIPE_BILLING_PORTAL) {
    return noStore({ error: "Stripe not configured" }, { status: 501 });
  }

  try {
    const session = await auth().catch(() => null);
    const email = (session?.user as any)?.email as string | undefined;
    if (!email) return noStore({ error: "Unauthorized" }, { status: 401 });

    // You would typically create a portal session with the Stripe SDK here:
    // const stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: "2024-06-20" });
    // const customer = await lookupStripeCustomerByEmail(email)...
    // const portal = await stripe.billingPortal.sessions.create({ customer, return_url: returnUrl });

    // For now, bounce to a configured portal URL or fallback home.
    return NextResponse.redirect(STRIPE_BILLING_PORTAL || returnUrl, { status: 302 });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn("[billing/portal POST] error:", e);
    return noStore({ error: "Server error" }, { status: 500 });
  }
}
