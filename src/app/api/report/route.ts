export const preferredRegion = 'fra1';
// src/app/api/report/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { auth } from "@/auth";

// If you have a shared limiter helper, wire it here. Otherwise this is a noop stub.
async function allow(ipKey: string) {
  try {
    // Example: checkRateLimit(req.headers, { name: "report", limit: 30, windowMs: 10*60_000 })
    return true;
  } catch {
    return true;
  }
}

type SupportType = "REPORT_LISTING" | "REPORT_USER" | "BUG";

const MAX_REASON = 4000;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;

function noStore(json: unknown, init?: ResponseInit) {
  const res = NextResponse.json(json, init);
  res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
  res.headers.set("Pragma", "no-cache");
  res.headers.set("Expires", "0");
  return res;
}

function getIp(req: Request): string {
  const xf =
    req.headers.get("x-forwarded-for") ||
    req.headers.get("x-vercel-forwarded-for") ||
    "";
  if (xf) return xf.split(",")[0]?.trim() || "0.0.0.0";
  const xr = req.headers.get("x-real-ip");
  if (xr) return xr.trim();
  return "0.0.0.0";
}

function cleanStr(s: unknown, max = 200): string | null {
  const v = String(s ?? "").trim();
  if (!v) return null;
  return v.slice(0, max);
}

function normalizeEmail(s: unknown): string | null {
  const v = cleanStr(s, 200)?.toLowerCase() || null;
  return v && EMAIL_RE.test(v) ? v : null;
}

function normalizeUrl(u?: unknown): string | null {
  const s = String(u ?? "").trim();
  if (!s) return null;
  try {
    const url = new URL(s);
    if (url.protocol === "http:" || url.protocol === "https:") {
      return url.toString().slice(0, 500);
    }
  } catch {
    /* ignore */
  }
  return null;
}

function normalizeReason(v: unknown): string | null {
  const t = String(v ?? "").replace(/\s+/g, " ").trim();
  if (!t) return null;
  return t.length > MAX_REASON ? t.slice(0, MAX_REASON) : t;
}

function normalizeType(v: unknown): SupportType {
  const t = String(v ?? "").toUpperCase();
  if (t === "REPORT_USER") return "REPORT_USER";
  if (t === "BUG") return "BUG";
  return "REPORT_LISTING";
}

export function OPTIONS() {
  const origin =
    process.env["NEXT_PUBLIC_SITE_URL"] ??
    process.env["NEXT_PUBLIC_APP_URL"] ??
    "*";
  const res = new NextResponse(null, { status: 204 });
  res.headers.set("Access-Control-Allow-Origin", origin);
  res.headers.set("Vary", "Origin");
  res.headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.headers.set("Access-Control-Max-Age", "86400");
  res.headers.set("Cache-Control", "no-store");
  return res;
}

type Body =
  | {
      // old/plain shape
      listingId?: string;
      reason?: string;
      url?: string;
      email?: string;
      name?: string;
      subject?: string;
      hpt?: string;
    }
  | {
      // new client form shape (what your /report page sends)
      type?: SupportType;
      productId?: string | null;
      url?: string | null;
      message?: string;
      email?: string;
      name?: string;
      subject?: string;
      meta?: Record<string, unknown>;
      hpt?: string;
    };

export async function POST(req: Request) {
  try {
    // Require JSON
    const ctype = (req.headers.get("content-type") || "").toLowerCase();
    if (!ctype.includes("application/json")) {
      return noStore({ error: "Content-Type must be application/json" }, { status: 415 });
    }

    // Simple IP-based limiter (best-effort)
    const ip = getIp(req);
    if (!(await allow(`report:${ip}`))) {
      return noStore({ error: "Too many requests" }, { status: 429 });
    }

    const body = (await req.json().catch(() => ({}))) as Body;

    // Honeypot: pretend success to bots
    if (typeof (body as any)?.hpt === "string" && (body as any).hpt.trim() !== "") {
      return noStore({ ok: true }, { status: 201 });
    }

    // Accept both shapes
    const type = normalizeType((body as any).type);
    const productIdRaw =
      (body as any).productId ?? (body as any).listingId ?? null;
    const productId =
      productIdRaw == null ? null : String(productIdRaw).trim() || null;

    // reason/message
    const reason = normalizeReason(
      (body as any).reason ?? (body as any).message
    );
    if (!reason) return noStore({ error: "reason/message is required" }, { status: 400 });

    const url = normalizeUrl((body as any).url);
    const email = normalizeEmail((body as any).email);
    const name = cleanStr((body as any).name, 120);
    const subject =
      cleanStr((body as any).subject, 160) ??
      (type === "BUG"
        ? "Bug report"
        : type === "REPORT_USER"
        ? "User reported"
        : "Listing reported");

    // For listing reports, a product/listing id is required
    if (type === "REPORT_LISTING" && !productId) {
      return noStore({ error: "listingId/productId is required" }, { status: 400 });
    }

    // Verify listing exists when relevant
    if (type === "REPORT_LISTING" && productId) {
      const exists = await prisma.product.findUnique({
        where: { id: productId },
        select: { id: true },
      });
      if (!exists) return noStore({ error: "Invalid listingId" }, { status: 400 });
    }

    // Attach reporter if signed in
    const session = await auth().catch(() => null);
    const reporterId = (session as any)?.user?.id as string | undefined;

    // Soft dedupe: last 10 minutes
    const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000);
    const dupe = await prisma.supportTicket.findFirst({
      where: {
        type,
        productId: productId ?? undefined,
        message: reason,
        createdAt: { gte: tenMinAgo },
        OR: [
          ...(reporterId ? [{ reporterId }] : []),
          ...(email ? [{ email }] : []),
        ],
      },
      select: { id: true, status: true, createdAt: true },
    });
    if (dupe) {
      return noStore({ ok: true, ticket: dupe, deduped: true }, { status: 200 });
    }

    // Optional request context (only saved if your schema has these columns)
    const referer = normalizeUrl(req.headers.get("referer"));
    const userAgent = cleanStr(req.headers.get("user-agent"), 300);

    // Create support ticket
    const ticket = await prisma.supportTicket.create({
      data: {
        type,
        status: "OPEN",
        productId: productId ?? null, // null for BUG/REPORT_USER if not tied to a listing
        message: reason,
        url,
        name,
        email,
        subject,
        reporterId: reporterId ?? null,
        // If you have these columns, uncomment:
        // clientIp: ip,
        // referer,
        // userAgent,
        // metaJson: (body as any)?.meta ?? null,
      },
      select: { id: true, type: true, status: true, createdAt: true },
    });

    // Optional: email notify (best-effort) via Resend — wire up if needed
    // (kept out to avoid failing the request path if not configured)

    return noStore({ ok: true, id: ticket.id }, { status: 201 });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn("[/api/report POST] error:", e);
    return noStore({ error: "Server error" }, { status: 500 });
  }
}
