// src/app/api/messages/[id]/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { auth } from "@/auth";
import { checkRateLimit } from "@/app/lib/ratelimit";
import { tooMany } from "@/app/lib/ratelimit-response";

/* ------------------------------ helpers ------------------------------ */
function noStore(json: unknown, init?: ResponseInit) {
  const res = NextResponse.json(json, init);
  res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
  res.headers.set("Pragma", "no-cache");
  res.headers.set("Expires", "0");
  return res;
}

/** GET /api/messages/[id] — read thread & messages (marks other side as read) */
export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> } // 👈 Next 15 expects a Promise here
) {
  try {
    const { id } = await context.params; // 👈 await it
    const threadId = String(id || "").trim();
    if (!threadId) return noStore({ error: "Missing id" }, { status: 400 });

    const session = await auth().catch(() => null);
    const uid = (session?.user as any)?.id as string | undefined;
    if (!uid) return noStore({ error: "Unauthorized" }, { status: 401 });

    if (typeof checkRateLimit === "function") {
      const rl = checkRateLimit(req.headers, {
        name: "messages_thread_read",
        limit: 120,
        windowMs: 60_000,
        extraKey: `${uid}:${threadId}`,
      });
      if (!rl.ok) return tooMany("Please slow down.", rl.retryAfterSec);
    }

    const thread = await prisma.thread.findUnique({
      where: { id: threadId },
      select: {
        id: true,
        buyerId: true,
        sellerId: true,
        listingId: true,
        listingType: true,
        buyerLastReadAt: true,
        sellerLastReadAt: true,
      },
    });
    if (!thread || (thread.buyerId !== uid && thread.sellerId !== uid)) {
      return noStore({ error: "Not found" }, { status: 404 });
    }

    const messages = await prisma.message.findMany({
      where: { threadId, deletedAt: null },
      orderBy: { createdAt: "asc" },
      select: { id: true, senderId: true, body: true, createdAt: true, readAt: true },
    });

    const otherId = thread.buyerId === uid ? thread.sellerId : thread.buyerId;

    await prisma.$transaction([
      prisma.message.updateMany({
        where: { threadId, senderId: otherId, readAt: null },
        data: { readAt: new Date() },
      }),
      prisma.thread.update({
        where: { id: threadId },
        data:
          thread.buyerId === uid
            ? { buyerLastReadAt: new Date() }
            : { sellerLastReadAt: new Date() },
      }),
    ]);

    return noStore({ thread, messages });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn("[messages/:id GET] error", e);
    return noStore({ error: "Server error" }, { status: 500 });
  }
}

/** POST /api/messages/[id] — send a message to an existing thread */
export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> } // 👈 Promise again
) {
  try {
    const { id } = await context.params; // 👈 await it
    const threadId = String(id || "").trim();
    if (!threadId) return noStore({ error: "Missing id" }, { status: 400 });

    const session = await auth().catch(() => null);
    const uid = (session?.user as any)?.id as string | undefined;
    if (!uid) return noStore({ error: "Unauthorized" }, { status: 401 });

    if (typeof checkRateLimit === "function") {
      const rl = checkRateLimit(req.headers, {
        name: "messages_thread_send",
        limit: 30,
        windowMs: 60_000,
        extraKey: `${uid}:${threadId}`,
      });
      if (!rl.ok) {
        return noStore(
          { error: "You’re sending messages too quickly. Please slow down." },
          { status: 429, headers: { "Retry-After": String(rl.retryAfterSec ?? 1) } }
        );
      }
    }

    const thread = await prisma.thread.findUnique({
      where: { id: threadId },
      select: { id: true, buyerId: true, sellerId: true },
    });
    if (!thread || (thread.buyerId !== uid && thread.sellerId !== uid)) {
      return noStore({ error: "Not found" }, { status: 404 });
    }

    const b = await req.json().catch(() => ({}));
    const body = (b?.body ? String(b.body) : "").trim();
    if (!body) return noStore({ error: "Message cannot be empty" }, { status: 400 });
    if (body.length > 5000) return noStore({ error: "Too long" }, { status: 400 });

    await prisma.$transaction([
      prisma.message.create({ data: { threadId, senderId: uid, body } }),
      prisma.thread.update({ where: { id: threadId }, data: { lastMessageAt: new Date() } }),
    ]);

    return noStore({ ok: true });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn("[messages/:id POST] error", e);
    return noStore({ error: "Server error" }, { status: 500 });
  }
}
