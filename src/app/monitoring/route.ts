import { NextResponse } from "next/server";

export const runtime = "edge"; // small & fast

export async function POST(req: Request) {
  // Forward browser Sentry envelopes to Sentry (replace endpoint with your DSN host/project)
  const url = "https://o.sentry.io/api/4509963654922320/envelope/";
  const body = await req.text();
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-sentry-envelope" },
    body,
    // no auth header required when using DSN public key in the envelope
  });
  return new NextResponse(null, { status: res.status });
}
