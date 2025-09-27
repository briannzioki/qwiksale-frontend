// src/app/api/messages/[id]/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { auth } from "@/auth";
import { checkRateLimit } from "@/app/lib/ratelimit";
import { tooMany } from "@/app/lib/ratelimit-response";

/* ------------------------------ utils ------------------------------ */
function json(data: unknown, init?: ResponseInit) {
  const res = NextResponse.json(data, init);
  res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
  res.headers.set("Pragma", "no-cache");
  res.headers.set("Expires", "0");
  res.headers.set("Vary", "Authorization, Cookie");
  return res;
}
const unsupportedMedia = () =>
  json({ ok: false, error: "Content-Type must be application/json", code: "UNSUPPORTED_MEDIA" }, { status: 415 });
const badRequest = (m: string, code = "BAD_REQUEST") => json({ ok: false, error: m, code }, { status: 400 });
const unauthorized = () => json({ ok: false, error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 });
const notFound = (m = "Not found") => json({ ok: false, error: m, code: "NOT_FOUND" }, { status: 404 });

const iso = (d: unknown): string | null => {
  if (!d) return null;
  try {
    const dt = d instanceof Date ? d : new Date(String(d));
    return Number.isNaN(+dt) ? null : dt.toISOString();
  } catch {
    return null;
  }
};

/* ------------------------------ types ------------------------------ */
type MessageRow = {
  id: string;
  senderId: string;
  body: string;
  createdAt: Date;
  readAt: Date | null;
};

type ParamsCtx = { params: Promise<{ id: string }> };

/* -------------------------------- GET -------------------------------- */
export async function GET(req: NextRequest, ctx: ParamsCtx) {
  try {
    const { id } = await ctx.params;
    const threadId = String(id || "").trim();
    if (!threadId) return badRequest("Missing id", "MISSING_ID");

    const session = await auth().catch(() => null);
    const uid = (session?.user as any)?.id as string | undefined;
    if (!uid) return unauthorized();

    if (typeof checkRateLimit === "function") {
      const rl = await checkRateLimit(req.headers, {
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
      return notFound();
    }

    const messages = (await prisma.message.findMany({
      where: { threadId, deletedAt: null },
      orderBy: { createdAt: "asc" },
      select: { id: true, senderId: true, body: true, createdAt: true, readAt: true },
    })) as MessageRow[];

    const otherId = thread.buyerId === uid ? thread.sellerId : thread.buyerId;

    await prisma.$transaction([
      prisma.message.updateMany({ where: { threadId, senderId: otherId, readAt: null }, data: { readAt: new Date() } }),
      prisma.thread.update({
        where: { id: threadId },
        data: thread.buyerId === uid ? { buyerLastReadAt: new Date() } : { sellerLastReadAt: new Date() },
      }),
    ]);

    const res = json({
      ok: true,
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
    });
    res.headers.set("X-Thread-Id", threadId);
    return res;
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn("[messages/:id GET] error", e);
    return json({ ok: false, error: "Server error", code: "SERVER_ERROR" }, { status: 500 });
  }
}

/* -------------------------------- POST ------------------------------- */
/** POST /api/messages/:id — send a message. Body: { body: string } (alias: { text }) */
export async function POST(req: NextRequest, ctx: ParamsCtx) {
  try {
    const ct = (req.headers.get("content-type") || "").toLowerCase();
    if (!ct.includes("application/json")) return unsupportedMedia();

    const { id } = await ctx.params;
    const threadId = String(id || "").trim();
    if (!threadId) return badRequest("Missing id", "MISSING_ID");

    const session = await auth().catch(() => null);
    const uid = (session?.user as any)?.id as string | undefined;
    if (!uid) return unauthorized();

    if (typeof checkRateLimit === "function") {
      const rl = await checkRateLimit(req.headers, {
        name: "messages_thread_send",
        limit: 30,
        windowMs: 60_000,
        extraKey: `${uid}:${threadId}`,
      });
      if (!rl.ok) {
        return json(
          { ok: false, error: "You’re sending messages too quickly. Please slow down.", code: "RATE_LIMITED" },
          { status: 429, headers: { "Retry-After": String(rl.retryAfterSec ?? 1) } }
        );
      }
    }

    const thread = await prisma.thread.findUnique({
      where: { id: threadId },
      select: { id: true, buyerId: true, sellerId: true },
    });
    if (!thread || (thread.buyerId !== uid && thread.sellerId !== uid)) {
      return notFound();
    }

    const b = (await req.json().catch(() => ({}))) as { body?: unknown; text?: unknown };
    const bodyRaw = (b?.body ?? b?.text ?? "") as string;
    const body = String(bodyRaw).replace(/\s+/g, " ").trim();

    if (!body) return badRequest("Message cannot be empty", "EMPTY_MESSAGE");
    if (body.length > 5000) return badRequest("Message too long", "MESSAGE_TOO_LONG");

    await prisma.$transaction([
      prisma.message.create({ data: { threadId, senderId: uid, body } }),
      prisma.thread.update({ where: { id: threadId }, data: { lastMessageAt: new Date() } }),
    ]);

    const res = json({ ok: true }, { status: 201 });
    res.headers.set("X-Thread-Id", threadId);
    return res;
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn("[messages/:id POST] error", e);
    return json({ ok: false, error: "Server error", code: "SERVER_ERROR" }, { status: 500 });
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
