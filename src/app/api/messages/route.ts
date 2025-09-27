// src/app/api/messages/route.ts
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

function unsupportedMedia() {
  return json({ ok: false, error: "Content-Type must be application/json", code: "UNSUPPORTED_MEDIA" }, { status: 415 });
}

function badRequest(msg: string, code = "BAD_REQUEST", extra?: Record<string, unknown>) {
  return json({ ok: false, error: msg, code, ...(extra || {}) }, { status: 400 });
}

function unauthorized() {
  return json({ ok: false, error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 });
}

function notFound(msg = "Not found") {
  return json({ ok: false, error: msg, code: "NOT_FOUND" }, { status: 404 });
}

function nowISO() {
  return new Date();
}

type ListingType = "product" | "service";
const isUUIDish = (s: string) => /^[a-f0-9-]{8,}$/i.test(s);

/* Prisma error guard without importing @prisma/client/runtime */
const isUniqueViolation = (err: unknown) =>
  !!(err && typeof err === "object" && "code" in err && (err as any).code === "P2002");

/* ----------------------------------- GET ---------------------------------- */
/** GET /api/messages -> my threads */
export async function GET(req: NextRequest) {
  try {
    const session = await auth().catch(() => null);
    const uid = (session?.user as any)?.id as string | undefined;
    if (!uid) return unauthorized();

    if (typeof checkRateLimit === "function") {
      const rl = await checkRateLimit(req.headers, {
        name: "messages_list",
        limit: 60,
        windowMs: 60_000,
        extraKey: uid,
      });
      if (!rl.ok) return tooMany("Please slow down.", rl.retryAfterSec);
    }

    const threads = await prisma.thread.findMany({
      where: { OR: [{ buyerId: uid }, { sellerId: uid }] },
      orderBy: { lastMessageAt: "desc" },
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

    return json({ ok: true, items: threads });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn("[messages GET] error", e);
    return json({ ok: false, error: "Server error", code: "SERVER_ERROR" }, { status: 500 });
  }
}

/* ---------------------------------- POST ---------------------------------- */
/**
 * POST /api/messages
 * Create (or find) a thread and optionally send the first message.
 * Body:
 * {
 *   toUserId: string,
 *   listingType: "product" | "service",
 *   listingId: string,
 *   firstMessage?: string   // alias: text
 * }
 */
export async function POST(req: NextRequest) {
  try {
    const session = await auth().catch(() => null);
    const uid = (session?.user as any)?.id as string | undefined;
    if (!uid) return unauthorized();

    const ct = (req.headers.get("content-type") || "").toLowerCase();
    if (!ct.includes("application/json")) return unsupportedMedia();

    const body = await req.json().catch(() => ({} as any));
    const toUserId = String(body?.toUserId ?? "").trim();
    const listingType = String(body?.listingType ?? "").toLowerCase() as ListingType;
    const listingId = String(body?.listingId ?? "").trim();
    // accept alias "text" from older clients
    const firstMessageRaw = (body?.firstMessage ?? body?.text ?? "") as string;
    const firstMessage = String(firstMessageRaw).replace(/\s+/g, " ").trim();

    // Basic checks
    if (!toUserId || !isUUIDish(toUserId)) {
      return badRequest("Recipient is required.", "MISSING_RECIPIENT");
    }
    if (!listingId) return badRequest("Listing id is required.", "MISSING_LISTING");
    if (listingType !== "product" && listingType !== "service") {
      return badRequest("Invalid listing type.", "INVALID_LISTING_TYPE", { allowed: ["product", "service"] });
    }
    if (toUserId === uid) return badRequest("You can’t message yourself.", "SELF_MESSAGE");
    if (firstMessage.length > 5000) return badRequest("Message too long.", "MESSAGE_TOO_LONG");

    // Rate limit (caller + target + listing tuple)
    if (typeof checkRateLimit === "function") {
      const rl = await checkRateLimit(req.headers, {
        name: "messages_create_or_send",
        limit: 30,
        windowMs: 60_000,
        extraKey: `${uid}:${toUserId}:${listingType}:${listingId}`,
      });
      if (!rl.ok) {
        return tooMany("You’re sending messages too quickly. Please slow down.", rl.retryAfterSec);
      }
    }

    // Ensure recipient exists
    const recipient = await prisma.user.findUnique({
      where: { id: toUserId },
      select: { id: true, username: true, name: true },
    });
    if (!recipient) return notFound("Recipient not found.");

    // Ensure listing exists and belongs to recipient (prevents miswired threads)
    if (listingType === "product") {
      const prod = await prisma.product.findFirst({
        where: { id: listingId, status: "ACTIVE" },
        select: { id: true, sellerId: true },
      });
      if (!prod) return notFound("Product not found.");
      if (prod.sellerId !== toUserId) {
        return badRequest("Recipient does not own this product.", "RECIPIENT_NOT_OWNER");
      }
    } else {
      const svc = await prisma.service.findFirst({
        where: { id: listingId, status: "ACTIVE" },
        select: { id: true, sellerId: true },
      });
      if (!svc) return notFound("Service not found.");
      if (svc.sellerId !== toUserId) {
        return badRequest("Recipient does not own this service.", "RECIPIENT_NOT_OWNER");
      }
    }

    const buyerId = uid;
    const sellerId = toUserId;

    // Find or create thread (dupe-safe)
    const uniqueKey = {
      listingType_listingId_buyerId_sellerId: { listingType, listingId, buyerId, sellerId },
    } as const;

    let thread = await prisma.thread.findUnique({ where: uniqueKey, select: { id: true } });

    if (!thread) {
      try {
        thread = await prisma.thread.create({
          data: { listingType, listingId, buyerId, sellerId, lastMessageAt: nowISO() },
          select: { id: true },
        });
      } catch (err) {
        if (isUniqueViolation(err)) {
          // raced: fetch the existing one
          thread = await prisma.thread.findUnique({ where: uniqueKey, select: { id: true } });
        } else {
          throw err;
        }
      }
    }

    if (!thread) {
      // extremely unlikely, but keep a guard
      return json({ ok: false, error: "Could not initialize conversation.", code: "THREAD_INIT_FAILED" }, { status: 500 });
    }

    if (firstMessage) {
      if (firstMessage.trim().length === 0) {
        return badRequest("Message cannot be empty.", "EMPTY_MESSAGE");
      }
      await prisma.$transaction([
        prisma.message.create({ data: { threadId: thread.id, senderId: uid, body: firstMessage } }),
        prisma.thread.update({ where: { id: thread.id }, data: { lastMessageAt: nowISO() } }),
      ]);
    }

    return json({ ok: true, threadId: thread.id }, { status: 201 });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn("[messages POST] error", e);
    return json({ ok: false, error: "Server error", code: "SERVER_ERROR" }, { status: 500 });
  }
}
