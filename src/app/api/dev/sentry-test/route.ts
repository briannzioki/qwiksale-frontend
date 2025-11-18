import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

// Keep this route from dragging in any Sentry bundles.
// If you need to test Sentry, use __testSentryServer in instrumentation.ts
export async function GET() {
  if (process.env["NODE_ENV"] === "production") {
    return new NextResponse("Not found", { status: 404 });
  }
  try {
    throw new Error("Dev test error (no sentry import)");
  } catch {
    return NextResponse.json({ ok: true, captured: false });
  }
}
