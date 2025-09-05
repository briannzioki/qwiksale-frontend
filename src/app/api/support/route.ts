// src/app/api/support/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { auth } from "@/auth";

function noStore(json: unknown, init?: ResponseInit) {
  const res = NextResponse.json(json, init);
  res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
  res.headers.set("Pragma", "no-cache");
  res.headers.set("Expires", "0");
  return res;
}

const MAX_LEN = 4000;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function getClientIp(req: NextRequest): string {
  // Prefer standard proxy headers on Vercel
  const xf = req.headers.get("x-forwarded-for");
  if (xf) return xf.split(",")[0]?.trim() || "0.0.0.0";
  const xr = req.headers.get("x-real-ip");
  if (xr) return xr.trim();
  return "0.0.0.0";
}

function validUrl(u?: string | null): string | null {
  const s = (u || "").trim();
  if (!s) return null;
  try {
    const uu = new URL(s);
    if (uu.protocol === "http:" || uu.protocol === "https:") {
      return uu.toString().slice(0, 500);
    }
  } catch {}
  return null;
}

export async function POST(req: NextRequest) {
  try {
    const s = await auth().catch(() => null);
    const reporterId = (s as any)?.user?.id as string | undefined;

    const body = await req.json().catch(() => null);
    if (!body) return noStore({ error: "Invalid JSON" }, { status: 400 });

    // honeypot (bots will fill non-visible field)
    if (typeof body.hpt === "string" && body.hpt.trim() !== "") {
      return noStore({ ok: true });
    }

    const typeRaw = String(body.type || "CONTACT").toUpperCase();
    const type: "CONTACT" | "BUG" | "REPORT_LISTING" | "REPORT_USER" | "OTHER" =
      ["CONTACT", "BUG", "REPORT_LISTING", "REPORT_USER", "OTHER"].includes(typeRaw)
        ? (typeRaw as any)
        : "CONTACT";

    const message = String(body.message || "").trim();
    if (!message) return noStore({ error: "Message is required" }, { status: 400 });
    if (message.length > MAX_LEN) {
      return noStore({ error: `Message too long (max ${MAX_LEN} chars)` }, { status: 400 });
    }

    const name = body.name ? String(body.name).slice(0, 200) : null;
    const emailRaw = body.email ? String(body.email).slice(0, 200).toLowerCase() : null;
    const email = emailRaw && EMAIL_RE.test(emailRaw) ? emailRaw : null;
    const subject = body.subject ? String(body.subject).slice(0, 200) : null;
    const url = validUrl(body.url);
    const productId = body.productId ? String(body.productId) : null;

    if (type === "REPORT_LISTING" && productId) {
      const exists = await prisma.product.findUnique({
        where: { id: productId },
        select: { id: true },
      });
      if (!exists) {
        return noStore({ error: "Invalid productId" }, { status: 400 });
      }
    }

    // Light idempotency: avoid duplicate tickets (same reporter/email + message) within 10 minutes
    const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000);
    const dupe = await prisma.supportTicket.findFirst({
      where: {
        message,
        createdAt: { gte: tenMinAgo },
        OR: [
          ...(reporterId ? [{ reporterId }] : []),
          ...(email ? [{ email }] : []),
        ],
      },
      select: { id: true, status: true, createdAt: true },
    });
    if (dupe) {
      return noStore({ ok: true, ticket: dupe, deduped: true });
    }

    // Request context
    const clientIp = getClientIp(req);
    const userAgent = req.headers.get("user-agent")?.slice(0, 300) || null;
    const referer = validUrl(req.headers.get("referer"));

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
        // If you added telemetry columns in schema, uncomment:
        // clientIp,
        // userAgent,
        // referer,
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
