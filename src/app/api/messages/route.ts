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
const unsupportedMedia = () =>
  json({ ok: false, error: "Content-Type must be application/json", code: "UNSUPPORTED_MEDIA" }, { status: 415 });
const badRequest = (msg: string, code = "BAD_REQUEST", extra?: Record<string, unknown>) =>
  json({ ok: false, error: msg, code, ...(extra || {}) }, { status: 400 });
const unauthorized = () => json({ ok: false, error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 });
const notFound = (msg = "Not found") => json({ ok: false, error: msg, code: "NOT_FOUND" }, { status: 404 });

type ListingType = "product" | "service";
const now = () => new Date();

/** Accept UUID, CUID/CUID2, or any sane id-like token (len ≥ 10). */
const isIdish = (s: string) => /^[A-Za-z0-9_-]{10,}$/.test(s);

/* Prisma dupe guard without importing client runtime details */
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

/* --------------------------- POST body typing --------------------------- */
interface MessagePostBody {
  // recipient aliases
  toUserId?: unknown;
  recipientId?: unknown;
  userId?: unknown;
  to?: unknown;
  targetUserId?: unknown;

  // listing type / id aliases
  listingType?: unknown;
  type?: unknown;
  listingId?: unknown;
  id?: unknown;
  listing?: unknown;

  // first message aliases
  firstMessage?: unknown;
  text?: unknown;
  message?: unknown;
  body?: unknown;
}

const toStr = (v: unknown) => (v == null ? "" : String(v));

/* ---------------------------------- POST ---------------------------------- */
/**
 * POST /api/messages
 * Create (or find) a thread and optionally send the first message.
 * Accepts flexible aliases:
 * - toUserId | recipientId | userId | to | targetUserId
 * - listingType | type  -> "product" | "service"
 * - listingId   | id | listing
 * - firstMessage | text | message | body
 */
export async function POST(req: NextRequest) {
  try {
    const session = await auth().catch(() => null);
    const uid = (session?.user as any)?.id as string | undefined;
    if (!uid) return unauthorized();

    const ct = (req.headers.get("content-type") || "").toLowerCase();
    if (!ct.includes("application/json")) return unsupportedMedia();

    const b = (await req.json().catch(() => ({}))) as MessagePostBody;

    const toUserId = toStr(b.toUserId ?? b.recipientId ?? b.userId ?? b.to ?? b.targetUserId).trim();

    const listingTypeRaw = toStr(b.listingType ?? b.type).toLowerCase().trim();
    const listingType = (listingTypeRaw === "product" || listingTypeRaw === "service"
      ? listingTypeRaw
      : "") as ListingType;

    const listingId = toStr(b.listingId ?? b.id ?? b.listing).trim();

    const firstMessage = toStr(b.firstMessage ?? b.text ?? b.message ?? b.body)
      .replace(/\s+/g, " ")
      .trim();

    // Basic checks
    if (!toUserId) return badRequest("Recipient is required.", "MISSING_RECIPIENT");
    if (!isIdish(toUserId)) return badRequest("Invalid recipient id.", "INVALID_RECIPIENT");
    if (!listingId) return badRequest("Listing id is required.", "MISSING_LISTING");
    if (!listingType) {
      return badRequest("Invalid listing type (use 'product' or 'service').", "INVALID_LISTING_TYPE");
    }
    if (toUserId === uid) return badRequest("You can’t message yourself.", "SELF_MESSAGE");
    if (firstMessage.length > 5000) return badRequest("Message too long.", "MESSAGE_TOO_LONG");

    // Recipient must exist
    const recipient = await prisma.user.findUnique({
      where: { id: toUserId },
      select: { id: true },
    });
    if (!recipient) return notFound("Recipient not found.");

    // Listing must exist and belong to the recipient
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

    // Rate limit tuple (caller + target + listing)
    if (typeof checkRateLimit === "function") {
      const rl = await checkRateLimit(req.headers, {
        name: "messages_create_or_send",
        limit: 30,
        windowMs: 60_000,
        extraKey: `${uid}:${toUserId}:${listingType}:${listingId}`,
      });
      if (!rl.ok) {
        return json(
          { ok: false, error: "You’re sending messages too quickly. Please slow down.", code: "RATE_LIMITED" },
          { status: 429, headers: { "Retry-After": String(rl.retryAfterSec ?? 1) } }
        );
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
          data: { listingType, listingId, buyerId, sellerId, lastMessageAt: now() },
          select: { id: true },
        });
      } catch (err) {
        if (isUniqueViolation(err)) {
          thread = await prisma.thread.findUnique({ where: uniqueKey, select: { id: true } });
        } else {
          throw err;
        }
      }
    }

    if (!thread) {
      return json({ ok: false, error: "Could not initialize conversation.", code: "THREAD_INIT_FAILED" }, { status: 500 });
    }

    if (firstMessage) {
      if (firstMessage.trim().length === 0) {
        return badRequest("Message cannot be empty.", "EMPTY_MESSAGE");
      }
      await prisma.$transaction([
        prisma.message.create({ data: { threadId: thread.id, senderId: uid, body: firstMessage } }),
        prisma.thread.update({ where: { id: thread.id }, data: { lastMessageAt: now() } }),
      ]);
    }

    return json({ ok: true, threadId: thread.id }, { status: 201 });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn("[messages POST] error", e);
    return json({ ok: false, error: "Server error", code: "SERVER_ERROR" }, { status: 500 });
  }
}
