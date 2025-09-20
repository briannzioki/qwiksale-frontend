export const preferredRegion = 'fra1';
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const STRIPE_SECRET_KEY = process.env["STRIPE_SECRET_KEY"];
  const STRIPE_WEBHOOK_SECRET = process.env["STRIPE_WEBHOOK_SECRET"];

  if (!STRIPE_SECRET_KEY || !STRIPE_WEBHOOK_SECRET) {
    return new NextResponse(JSON.stringify({ error: "Stripe not configured" }), {
      status: 501,
      headers: { "Cache-Control": "no-store" },
    });
  }

  // In a real integration: read raw body, verify signature, handle events
  // const body = await req.text();
  // const sig = req.headers.get("stripe-signature") || "";
  // const stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: "2024-06-20" });
  // const evt = stripe.webhooks.constructEvent(body, sig, STRIPE_WEBHOOK_SECRET);

  return new NextResponse(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "Cache-Control": "no-store" },
  });
}


