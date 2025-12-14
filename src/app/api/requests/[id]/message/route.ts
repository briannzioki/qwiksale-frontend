// src/app/api/requests/[id]/message/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/prisma";

type RouteCtx = { params: Promise<{ id: string }> };

function noStore(json: unknown, init?: ResponseInit) {
  const res = NextResponse.json(json, init);
  res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
  res.headers.set("Pragma", "no-cache");
  res.headers.set("Expires", "0");
  return res;
}

async function readParamId(ctx: RouteCtx): Promise<string> {
  const p: any = (ctx as any)?.params;
  const params = p && typeof p?.then === "function" ? await p : p;
  return String(params?.id ?? "").trim();
}

function safeKind(v: unknown): "product" | "service" {
  const s = String(v ?? "").trim().toLowerCase();
  return s === "service" ? "service" : "product";
}

/**
 * POST /api/requests/[id]/message
 * Auth required; opens/creates a conversation thread with poster.
 * Uses existing Thread model (listingType + listingId + buyerId + sellerId).
 */
export async function POST(_req: Request, ctx: RouteCtx) {
  try {
    const session = await auth();
    const meId = (session as any)?.user?.id as string | undefined;
    if (!meId) return noStore({ error: "Unauthorized" }, { status: 401 });

    const id = await readParamId(ctx);
    if (!id) return noStore({ error: "Missing id" }, { status: 400 });

    const requestModel = (prisma as any).request;

    const r = await requestModel?.findUnique?.({
      where: { id },
      select: { id: true, ownerId: true, kind: true },
    });

    if (!r) return noStore({ error: "Not found" }, { status: 404 });

    const sellerId = String(r.ownerId || "");
    if (!sellerId) return noStore({ error: "Server error" }, { status: 500 });
    if (sellerId === meId) return noStore({ error: "You cannot message yourself" }, { status: 400 });

    const listingType = safeKind(r.kind);
    const listingId = String(r.id);

    const now = new Date();

    // Create or open thread (idempotent via @@unique)
    let thread: any = null;
    try {
      thread = await prisma.thread.upsert({
        where: {
          listingType_listingId_buyerId_sellerId: {
            listingType: listingType as any,
            listingId,
            buyerId: meId,
            sellerId,
          },
        },
        update: { lastMessageAt: now },
        create: {
          listingType: listingType as any,
          listingId,
          buyerId: meId,
          sellerId,
          lastMessageAt: now,
        },
        select: { id: true },
      });
    } catch {
      thread = await prisma.thread.findFirst({
        where: {
          listingType: listingType as any,
          listingId,
          buyerId: meId,
          sellerId,
        },
        select: { id: true },
      });
      if (!thread) {
        // final fallback create
        thread = await prisma.thread.create({
          data: {
            listingType: listingType as any,
            listingId,
            buyerId: meId,
            sellerId,
            lastMessageAt: now,
          },
          select: { id: true },
        });
      }
    }

    const threadId = String(thread?.id || "");
    if (!threadId) return noStore({ error: "Server error" }, { status: 500 });

    return noStore({
      ok: true,
      threadId,
    });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn("[/api/requests/[id]/message POST] error:", e);
    return noStore({ error: "Server error" }, { status: 500 });
  }
}
