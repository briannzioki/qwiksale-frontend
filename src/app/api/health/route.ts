import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma"; // adjust import if your prisma client lives elsewhere

const VERSION = process.env["NEXT_PUBLIC_APP_VERSION"] || "dev";

export async function GET() {
  const started = Date.now();
  let dbOk = false;
  try {
    // Fast ping — change to any simple query your DB supports
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
    { status: ok ? 200 : 503, headers: { "cache-control": "no-store" } }
  );
}
