export const preferredRegion = ['fra1'];
// src/app/api/messages/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { auth } from "@/auth";
import { checkRateLimit } from "@/app/lib/ratelimit";
import { tooMany } from "@/app/lib/ratelimit-response";

/* --------------------------- TS-safe Prisma alias --------------------------- */
const db = prisma as unknown as typeof prisma & {
  thread: {
    findMany: (args: any) => Promise<any[]>;
    findUnique: (args: any) => Promise<any | null>;
    create: (args: any) => Promise<any>;
    update: (args: any) => Promise<any>;
  };
  message: {
    create: (args: any) => Promise<any>;
  };
};

/* --------------------------------- helpers -------------------------------- */
function noStore(json: unknown, init?: ResponseInit) {
  const res = NextResponse.json(json, init);
  res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
  res.headers.set("Pragma", "no-cache");
  res.headers.set("Expires", "0");
  return res;
}

type ListingType = "product" | "service";

/* ----------------------------------- GET ---------------------------------- */
/** GET /api/messages -> my threads */
export async function GET(req: NextRequest) {
  try {
    const session = await auth().catch(() => null);
    const uid = (session?.user as any)?.id as string | undefined;
    if (!uid) return noStore({ error: "Unauthorized" }, { status: 401 });

    // Rate limit listing threads fetch (per user)
    const rl = await checkRateLimit(req.headers, {
      name: "messages_list",
      limit: 60,
      windowMs: 60_000,
      extraKey: uid,
    });
    if (!rl.ok) return tooMany("Please slow down.", rl.retryAfterSec);

    const threads = await db.thread.findMany({
      where: { OR: [{ buyerId: uid }, { sellerId: uid }] },
      orderBy: { lastMessageAt: "asc" }, // or "desc" if you prefer newest first
      select: {
        id: true,
        listingId: true,
        listingType: true,
        buyerId: true,
        sellerId: true,
        lastMessageAt: true,
        createdAt: true,
        updatedAt: true,
        buyerLastReadAt: true,
        sellerLastReadAt: true,
        buyer: { select: { id: true, name: true, username: true, image: true } },
        seller: { select: { id: true, name: true, username: true, image: true } },
        _count: { select: { messages: true } },
      },
    });

    return noStore({ items: threads });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn("[messages GET] error", e);
    return noStore({ error: "Server error" }, { status: 500 });
  }
}

/* ---------------------------------- POST ---------------------------------- */
/** POST /api/messages -> create thread (optional first message) */
export async function POST(req: NextRequest) {
  try {
    const session = await auth().catch(() => null);
    const uid = (session?.user as any)?.id as string | undefined;
    if (!uid) return noStore({ error: "Unauthorized" }, { status: 401 });

    // Quick content-type check
    const ctype = (req.headers.get("content-type") || "").toLowerCase();
    if (!ctype.includes("application/json")) {
      return noStore({ error: "Content-Type must be application/json" }, { status: 415 });
    }

    const b = await req.json().catch(() => ({} as any));
    const toUserId = String(b?.toUserId || "").trim();
    const listingType = String(b?.listingType || "") as ListingType;
    const listingId = String(b?.listingId || "").trim();
    const firstMessage = (b?.firstMessage ? String(b.firstMessage) : "").trim();

    if (!toUserId || !listingId || (listingType !== "product" && listingType !== "service")) {
      return noStore({ error: "Missing fields" }, { status: 400 });
    }
    if (toUserId === uid) {
      return noStore({ error: "Cannot message yourself" }, { status: 400 });
    }

    // Rate limit thread creation / first message (per user + target + listing)
    const rl = await checkRateLimit(req.headers, {
      name: "messages_create_or_send",
      limit: 30,
      windowMs: 60_000,
      extraKey: `${uid}:${toUserId}:${listingType}:${listingId}`,
    });
    if (!rl.ok) {
      return tooMany(
        "You’re sending messages too quickly. Please slow down.",
        rl.retryAfterSec
      );
    }

    const buyerId = uid;
    const sellerId = toUserId;

    // Find or create thread (composite unique in schema)
    let thread = await db.thread.findUnique({
      where: {
        listingType_listingId_buyerId_sellerId: {
          listingType,
          listingId,
          buyerId,
          sellerId,
        },
      },
      select: { id: true },
    });

    if (!thread) {
      thread = await db.thread.create({
        data: {
          listingType,
          listingId,
          buyerId,
          sellerId,
          lastMessageAt: new Date(),
        },
        select: { id: true },
      });
    }

    if (firstMessage) {
      await db.message.create({
        data: { threadId: thread.id, senderId: uid, body: firstMessage },
      });
      await db.thread.update({
        where: { id: thread.id },
        data: { lastMessageAt: new Date() },
      });
    }

    return noStore({ threadId: thread.id }, { status: 201 });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn("[messages POST] error", e);
    return noStore({ error: "Server error" }, { status: 500 });
  }
}
