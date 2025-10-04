// src/app/api/upload/delete/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextResponse } from "next/server";
import { deleteByUrlOrId } from "@/app/lib/media";
import { auth } from "@/auth";

function noStore(json: unknown, init?: ResponseInit) {
  const res = NextResponse.json(json, init);
  res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
  res.headers.set("Pragma", "no-cache");
  res.headers.set("Expires", "0");
  res.headers.set("Vary", "Authorization, Cookie, Accept-Encoding, Origin");
  return res;
}

function isAdminEmail(email?: string | null) {
  const raw = process.env["ADMIN_EMAILS"] || "";
  const set = new Set(
    raw
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean)
  );
  return !!email && set.has(email.toLowerCase());
}

async function requireAdmin() {
  let session: any = null;
  try {
    session = await auth();
  } catch {
    /* ignore */
  }
  const user = session?.user;
  if (!user?.email) return { ok: false as const, status: 401 as const };
  // If you want to allow any signed-in user, relax this check.
  if (!isAdminEmail(user.email)) return { ok: false as const, status: 403 as const };
  return { ok: true as const };
}

async function handleDelete(req: Request) {
  try {
    const authz = await requireAdmin();
    if (!authz.ok) {
      return noStore(
        { ok: false, error: authz.status === 401 ? "Unauthorized" : "Forbidden" },
        { status: authz.status }
      );
    }

    const url = new URL(req.url);
    const qpId = url.searchParams.get("id") || url.searchParams.get("url") || "";
    const ctype = (req.headers.get("content-type") || "").toLowerCase();

    let body: any = null;
    if (ctype.includes("application/json")) {
      body = await req.json().catch(() => null);
    }

    const raw = String(body?.id || body?.url || qpId || "").trim();
    if (!raw) return noStore({ ok: false, error: "Missing id" }, { status: 400 });

    await deleteByUrlOrId(raw);
    return noStore({ ok: true });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn("[upload/delete] error", e);
    return noStore({ ok: false, error: "Failed to delete" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  return handleDelete(req);
}

export async function DELETE(req: Request) {
  // Support DELETE with ?id=... or ?url=... or JSON body {id|url}
  return handleDelete(req);
}

export function OPTIONS() {
  const origin =
    process.env["NEXT_PUBLIC_APP_URL"] ??
    process.env["APP_ORIGIN"] ??
    "*";
  const res = new NextResponse(null, { status: 204 });
  res.headers.set("Access-Control-Allow-Origin", origin);
  res.headers.set("Vary", "Origin");
  res.headers.set("Access-Control-Allow-Methods", "POST, DELETE, OPTIONS, HEAD");
  res.headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.headers.set("Access-Control-Max-Age", "86400");
  res.headers.set("Cache-Control", "no-store");
  return res;
}

export async function HEAD() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Cache-Control": "no-store, no-cache, must-revalidate",
      "Vary": "Origin",
    },
  });
}
