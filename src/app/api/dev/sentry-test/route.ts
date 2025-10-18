import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  if (process.env.NODE_ENV === "production") {
    return new NextResponse("Not found", { status: 404 });
  }

  try {
    // Simulate something going wrong and capture it
    throw new Error("Sentry dev test error");
  } catch (err) {
    Sentry.setTag("area", "admin"); // harmless here; consistent tagging
    Sentry.captureException(err);
    return NextResponse.json({ ok: true, captured: true });
  }
}
