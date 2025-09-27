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

/* ------------------------------ types ------------------------------ */
type MessageRow = {
  id: string;
  senderId: string;
  body: string;
  createdAt: Date;
  readAt: Date | null;
};

type ThreadRow = {
  id: string;
  buyerId: string;
  sellerId: string;
  listingId: string | null;
  listingType: string | null;
  buyerLastReadAt: Date | null;
  sellerLastReadAt: Date | null;
};

type ParamCtx = { params: Promise<{ id: string }> };

/* ------------------------------ helpers ------------------------------ */
function noStore(json: unknown, init?: ResponseInit) {
  const res = NextResponse.json(json, init);
  res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
  res.headers.set("Pragma", "no-cache");
  res.headers.set("Expires", "0");
  res.headers.set("Vary", "Authorization, Cookie");
  return res;
}

function requireJson(req: NextRequest): NextResponse | null {
  if (req.method !== "POST") return null;
  const ct = (req.headers.get("content-type") || "").toLowerCase();
  if (!ct.includes("application/json")) {
    return noStore({ error: "Content-Type must be application/json" }, { status: 400 });
  }
  return null;
}

function iso(d: unknown): string | null {
  if (!d) return null;
  try {
    const dt = d instanceof Date ? d : new Date(String(d));
    return Number.isNaN(+dt) ? null : dt.toISOString();
  } catch {
    return null;
  }
}

/* -------------------------------- GET -------------------------------- */
export async function GET(req: NextRequest, context: ParamCtx) {
  try {
    const { id } = await context.params;
    const threadId = String(id || "").trim();
    if (!threadId) return noStore({ error: "Missing id" }, { status: 400 });

    const session = await auth().catch(() => null);
    const uid = (session?.user as any)?.id as string | undefined;
    if (!uid) return noStore({ error: "Unauthorized" }, { status: 401 });

    if (typeof checkRateLimit === "function") {
      const rl = await checkRateLimit(req.headers, {
        name: "messages_thread_read",
        limit: 120,
        windowMs: 60_000,
        extraKey: `${uid}:${threadId}`,
      });
      if (!rl.ok) return tooMany("Please slow down.", rl.retryAfterSec);
    }

    const thread = (await prisma.thread.findUnique({
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
    })) as ThreadRow | null;

    if (!thread || (thread.buyerId !== uid && thread.sellerId !== uid)) {
      return noStore({ error: "Not found" }, { status: 404 });
    }

    const messages = (await prisma.message.findMany({
      where: { threadId, deletedAt: null },
      orderBy: { createdAt: "asc" },
      select: { id: true, senderId: true, body: true, createdAt: true, readAt: true },
    })) as MessageRow[];

    const otherId = thread.buyerId === uid ? thread.sellerId : thread.buyerId;

    // Mark other party's unread messages as read + bump lastRead on my side
    await prisma.$transaction([
      prisma.message.updateMany({
        where: { threadId, senderId: otherId, readAt: null },
        data: { readAt: new Date() },
      }),
      prisma.thread.update({
        where: { id: threadId },
        data: thread.buyerId === uid
          ? { buyerLastReadAt: new Date() }
          : { sellerLastReadAt: new Date() },
      }),
    ]);

    const out = {
      thread: {
        ...thread,
        buyerLastReadAt: iso(thread.buyerLastReadAt),
        sellerLastReadAt: iso(thread.sellerLastReadAt),
      },
      messages: messages.map((m) => ({
        id: m.id,
        senderId: m.senderId,
        body: m.body,
        createdAt: iso(m.createdAt),
        readAt: iso(m.readAt),
      })),
    };

    const res = noStore(out);
    res.headers.set("X-Thread-Id", threadId);
    return res;
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn("[messages/:id GET] error", e);
    return noStore({ error: "Server error" }, { status: 500 });
  }
}

/* -------------------------------- POST ------------------------------- */
/** POST /api/messages/:id — send a message. Body: { body: string } */
export async function POST(req: NextRequest, context: ParamCtx) {
  try {
    const guard = requireJson(req);
    if (guard) return guard;

    const { id } = await context.params;
    const threadId = String(id || "").trim();
    if (!threadId) return noStore({ error: "Missing id" }, { status: 400 });

    const session = await auth().catch(() => null);
    const uid = (session?.user as any)?.id as string | undefined;
    if (!uid) return noStore({ error: "Unauthorized" }, { status: 401 });

    if (typeof checkRateLimit === "function") {
      const rl = await checkRateLimit(req.headers, {
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

    const b = (await req.json().catch(() => ({}))) as { body?: unknown };
    const body = (b?.body ? String(b.body) : "").trim();
    if (!body) return noStore({ error: "Message cannot be empty" }, { status: 400 });
    if (body.length > 5000) return noStore({ error: "Too long" }, { status: 400 });

    await prisma.$transaction([
      prisma.message.create({ data: { threadId, senderId: uid, body } }),
      prisma.thread.update({ where: { id: threadId }, data: { lastMessageAt: new Date() } }),
    ]);

    const res = noStore({ ok: true }, { status: 201 });
    res.headers.set("X-Thread-Id", threadId);
    return res;
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn("[messages/:id POST] error", e);
    return noStore({ error: "Server error" }, { status: 500 });
  }
}

/* -------------------------------- misc -------------------------------- */
export async function HEAD() {
  return new NextResponse(null, {
    status: 204,
    headers: { "Cache-Control": "no-store", Vary: "Authorization, Cookie" },
  });
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: { "Cache-Control": "no-store", Vary: "Authorization, Cookie" },
  });
}
