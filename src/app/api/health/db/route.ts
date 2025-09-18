import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const VERSION = process.env["NEXT_PUBLIC_APP_VERSION"] || "dev";

export async function GET() {
  const started = Date.now();
  let dbOk = false;
  try {
    await prisma.$queryRaw`SELECT 1`;
    dbOk = true;
  } catch {
    dbOk = false;
  }
  const latencyMs = Date.now() - started;

  const ok = dbOk;
  return NextResponse.json(
    {
      status: ok ? "ok" : "degraded",
      version: VERSION,
      time: new Date().toISOString(),
      db: { ok: dbOk, latencyMs },
    },
    { status: ok ? 200 : 503, headers: { "Cache-Control": "no-store" } }
  );
}
