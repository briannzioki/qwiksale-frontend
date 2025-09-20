// src/app/api/health/db/route.ts
export const runtime = "nodejs";
export const preferredRegion = 'fra1';
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";

const VERSION = process.env['NEXT_PUBLIC_APP_VERSION'] ?? "dev";
const TIMEOUT_MS = 1500;

function noStoreHeaders(extra?: Record<string, string>) {
  return {
    "Cache-Control": "no-store, no-cache, must-revalidate",
    Pragma: "no-cache",
    Expires: "0",
    "x-app-version": VERSION,
    ...(process.env['VERCEL_REGION']
      ? { "x-vercel-region": process.env['VERCEL_REGION'] }
      : {}),
    ...extra,
  };
}

async function checkDb(): Promise<{ ok: boolean; latencyMs: number; reason?: string }> {
  const started = Date.now();
  try {
    const result = await Promise.race([
      prisma.$queryRaw`SELECT 1`,
      new Promise<"timeout">((r) => setTimeout(() => r("timeout"), TIMEOUT_MS)),
    ]);
    const latencyMs = Date.now() - started;
    if (result === "timeout") return { ok: false, latencyMs, reason: "timeout" };
    return { ok: true, latencyMs };
  } catch (err) {
    const latencyMs = Date.now() - started;
    // Keep this log — shows up in Vercel logs when DB is sick
    console.error("[health/db] prisma ping failed:", err);
    return { ok: false, latencyMs, reason: "error" };
  }
}

export async function GET() {
  const db = await checkDb();
  const ok = db.ok;

  return NextResponse.json(
    {
      status: ok ? "ok" : "degraded",
      version: VERSION,
      time: new Date().toISOString(),
      db,
    },
    {
      status: ok ? 200 : 503,
      headers: noStoreHeaders(),
    }
  );
}

// Optional but handy for uptime checks:
export async function HEAD() {
  const db = await checkDb();
  return new NextResponse(null, {
    status: db.ok ? 200 : 503,
    headers: noStoreHeaders(),
  });
}


