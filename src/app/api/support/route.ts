export const preferredRegion = 'fra1';
// src/app/api/support/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { auth } from "@/auth";
import crypto from "node:crypto";

/**
 * Support ticket intake (contact, bug, report listing/user).
 *
 * Improvements:
 * - Centralized validation & normalization (email/url/message)
 * - Optional dedupe via content hash within 10 minutes (in addition to exact match)
 * - Lightweight abuse guard: soft rate-limit per identity in rolling 15 minutes
 * - Honeypot + optional Turnstile token support (if you wire it up on the client)
 * - CORS-safe OPTIONS handler (useful if you post from /help)
 * - Strict no-store caching
 */

const MAX_LEN = 4000;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;
const TYPES = ["CONTACT", "BUG", "REPORT_LISTING", "REPORT_USER", "OTHER"] as const;
type TicketType = (typeof TYPES)[number];

const SOFT_RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const SOFT_RATE_LIMIT_MAX = 8; // per identity (reporter/email/ip) in the window

/* --------------------------------- utils --------------------------------- */

function noStore(json: unknown, init?: ResponseInit) {
  const res = NextResponse.json(json, init);
  res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
  res.headers.set("Pragma", "no-cache");
  res.headers.set("Expires", "0");
  // Allow same-origin AJAX and preflights
  res.headers.set("Vary", "Origin");
  return res;
}

function getClientIp(req: NextRequest): string {
  // Prefer standard proxy headers on Vercel
  const xf = req.headers.get("x-forwarded-for");
  if (xf) return xf.split(",")[0]?.trim() || "0.0.0.0";
  const xr = req.headers.get("x-real-ip");
  if (xr) return xr.trim();
  return "0.0.0.0";
}

function normalizeMessage(raw: unknown): string {
  let s = String(raw ?? "").trim();
  // Collapse excessive whitespace and strip control chars (except newline/tab)
  s = s.replace(/[^\S\r\n]+/g, " ").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "");
  return s.slice(0, MAX_LEN);
}

function normalizeEmail(raw: unknown): string | null {
  if (!raw) return null;
  const s = String(raw).trim().toLowerCase().slice(0, 200);
  return EMAIL_RE.test(s) ? s : null;
}

function normalizeName(raw: unknown): string | null {
  const s = String(raw ?? "").trim();
  return s ? s.slice(0, 200) : null;
}

function normalizeSubject(raw: unknown): string | null {
  const s = String(raw ?? "").trim();
  return s ? s.slice(0, 200) : null;
}

function normalizeProductId(raw: unknown): string | null {
  const s = String(raw ?? "").trim();
  return s || null;
}

function validUrl(u?: unknown): string | null {
  const s = String(u ?? "").trim();
  if (!s) return null;
  try {
    const uu = new URL(s);
    if (uu.protocol === "http:" || uu.protocol === "https:") {
      return uu.toString().slice(0, 500);
    }
  } catch {
    // ignore
  }
  return null;
}

function parseType(raw: unknown): TicketType {
  const s = String(raw ?? "CONTACT").toUpperCase();
  return (TYPES as readonly string[]).includes(s) ? (s as TicketType) : "CONTACT";
}

function contentHash(input: string): string {
  return crypto.createHash("sha256").update(input).digest("hex");
}

/* --------------------------------- CORS ---------------------------------- */

export function OPTIONS() {
  const res = new NextResponse(null, { status: 204 });
  res.headers.set("Access-Control-Allow-Origin", process.env["NEXT_PUBLIC_BASE_URL"] || "*");
  res.headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.headers.set("Access-Control-Max-Age", "86400");
  // Also ensure no caching
  res.headers.set("Cache-Control", "no-store");
  return res;
}

/* --------------------------------- POST ---------------------------------- */

export async function POST(req: NextRequest) {
  try {
    const s = await auth().catch(() => null);
    const reporterId = (s as any)?.user?.id as string | undefined;

    const body = await req.json().catch(() => null);
    if (!body) return noStore({ error: "Invalid JSON" }, { status: 400 });

    // Honeypot (bots will fill non-visible field)
    if (typeof body.hpt === "string" && body.hpt.trim() !== "") {
      // Respond like success without creating anything.
      return noStore({ ok: true });
    }

    // Optional: Cloudflare Turnstile / reCAPTCHA token (client can send token)
    // If you wire verification, place it here and return 400/403 on failure.
    // const token = typeof body.token === "string" ? body.token : null;

    const type = parseType(body.type);
    const message = normalizeMessage(body.message);
    if (!message) return noStore({ error: "Message is required" }, { status: 400 });

    const name = normalizeName(body.name);
    const email = normalizeEmail(body.email);
    const subject = normalizeSubject(body.subject);
    const url = validUrl(body.url);
    const productId = normalizeProductId(body.productId);

    // Fast path validation for listing report
    if (type === "REPORT_LISTING" && productId) {
      const exists = await prisma.product.findUnique({
        where: { id: productId },
        select: { id: true },
      });
      if (!exists) {
        return noStore({ error: "Invalid productId" }, { status: 400 });
      }
    }

    // Soft abuse guard: recent ticket count by reporter/email/ip
    const clientIp = getClientIp(req);
    const since = new Date(Date.now() - SOFT_RATE_LIMIT_WINDOW_MS);

    // Build filter identities
    const identities: Array<Record<string, unknown>> = [
      ...(reporterId ? [{ reporterId }] : []),
      ...(email ? [{ email }] : []),
      { clientIp }, // if you don't have this column yet, leave as is for future use
    ];

    // Count recent submissions. If you haven't added clientIp to the schema,
    // this still rate-limits by reporter/email.
    const recentCount = await prisma.supportTicket.count({
      where: {
        createdAt: { gte: since },
        OR: identities,
      },
    });

    if (recentCount >= SOFT_RATE_LIMIT_MAX) {
      return noStore(
        {
          error: "Too many requests. Please try again later.",
          retryAfterSeconds: Math.round(SOFT_RATE_LIMIT_WINDOW_MS / 1000),
        },
        { status: 429 }
      );
    }

    // Light idempotency: avoid duplicates in 10 minutes (same identity + same message hash)
    const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000);
    const msgKey = contentHash([message, email ?? "", reporterId ?? ""].join("|"));

    const dupe = await prisma.supportTicket.findFirst({
      where: {
        createdAt: { gte: tenMinAgo },
        message, // keep exact match (indexed length permitting)
        OR: [
          ...(reporterId ? [{ reporterId }] : []),
          ...(email ? [{ email }] : []),
        ],
        // If you add a contentHash column later, prefer that here for speed
      },
      select: { id: true, status: true, createdAt: true },
    });

    if (dupe) {
      return noStore({ ok: true, ticket: dupe, deduped: true });
    }

    const userAgent = req.headers.get("user-agent")?.slice(0, 300) || null;
    const referer = validUrl(req.headers.get("referer"));

    // Create ticket
    const ticket = await prisma.supportTicket.create({
      data: {
        type,
        name,
        email,
        subject,
        message,
        url,
        productId,
        reporterId: reporterId || null,
        // If you added telemetry columns in schema, uncomment these:
        // clientIp,
        // userAgent,
        // referer,
        // contentHash: msgKey, // (add this column to fully leverage hashing)
      },
      select: { id: true, type: true, status: true, createdAt: true },
    });

    return noStore({ ok: true, ticket, meta: { clientIp, userAgent, referer } });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn("[/api/support POST] error:", e);
    return noStore({ error: "Server error" }, { status: 500 });
  }
}


