// src/app/api/report/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { rateLimit } from "@/app/api/_lib/ratelimits";
import { auth } from "@/auth";
import { Resend } from "resend";

/**
 * Report a listing.
 * Body:
 *  - listingId (required)
 *  - reason    (required, string, <= 4000)
 *  - url       (optional, http/https)
 *  - email     (optional)
 *  - name      (optional)
 *  - subject   (optional, default "Listing reported")
 *
 * Extras:
 *  - Soft dedupe (same reporter/email + same listingId + same reason within 10 min)
 *  - Rate-limit by IP via `rateLimit` helper
 *  - Strict no-store caching on responses
 *  - Optional outbound email via Resend
 *  - OPTIONS handler for CORS/preflight
 */

const resend: Resend | null = (process.env["RESEND_API_KEY"] || "")
  ? new Resend(process.env["RESEND_API_KEY"] as string)
  : null;

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
  const xf = req.headers.get("x-forwarded-for");
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

export function OPTIONS() {
  // If you need cross-origin posting, adjust the origin header accordingly:
  const res = new NextResponse(null, { status: 204 });
  res.headers.set("Access-Control-Allow-Origin", process.env["NEXT_PUBLIC_BASE_URL"] || "*");
  res.headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.headers.set("Access-Control-Max-Age", "86400");
  res.headers.set("Cache-Control", "no-store");
  return res;
}

type Body = {
  listingId?: string;
  reason?: string;
  url?: string;
  email?: string;
  name?: string;
  subject?: string;
  hpt?: string; // optional honeypot
};

export async function POST(req: Request) {
  try {
    // Rate limit by IP (best effort)
    const ip = getIp(req);
    const rl = await rateLimit.limit(`report:${ip}`);
    if (!rl.success) return new NextResponse("Too Many", { status: 429 });

    // Parse + basic bot honeypot
    const body = (await req.json().catch(() => ({}))) as Body;
    if (typeof body.hpt === "string" && body.hpt.trim() !== "") {
      // Pretend success for bots
      return noStore({ ok: true });
    }

    // Normalize inputs
    const productId = (body.listingId ?? "").toString().trim();
    const reasonRaw = (body.reason ?? "").toString();
    const reason = reasonRaw.trim().replace(/\s+/g, " ").slice(0, MAX_REASON);
    const url = normalizeUrl(body.url);
    const name = cleanStr(body.name, 120);
    const email = normalizeEmail(body.email);
    const subject = cleanStr(body.subject, 160) ?? "Listing reported";

    if (!productId) return noStore({ error: "listingId is required" }, { status: 400 });
    if (!reason) return noStore({ error: "reason is required" }, { status: 400 });
    if (reason.length > MAX_REASON) {
      return noStore({ error: `reason too long (max ${MAX_REASON})` }, { status: 400 });
    }

    // Verify listing exists
    const exists = await prisma.product.findUnique({
      where: { id: productId },
      select: { id: true },
    });
    if (!exists) return noStore({ error: "Invalid listingId" }, { status: 400 });

    // Attach reporter if signed in
    const session = await auth().catch(() => null);
    const reporterId = (session as any)?.user?.id as string | undefined;

    // Lightweight dedupe: same listing + reason + (reporter/email) in last 10 minutes
    const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000);
    const dupe = await prisma.supportTicket.findFirst({
      where: {
        type: "REPORT_LISTING",
        productId,
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
      return noStore({ ok: true, ticket: dupe, deduped: true });
    }

    // Request context (telemetry columns are optional; uncomment when present)
    const userAgent = req.headers.get("user-agent")?.slice(0, 300) || null;
    const referer = normalizeUrl(req.headers.get("referer"));

    // Create ticket
    const ticket = await prisma.supportTicket.create({
      data: {
        type: "REPORT_LISTING",
        status: "OPEN",
        productId,
        message: reason,
        url,
        name,
        email,
        subject,
        reporterId: reporterId ?? null,
        // clientIp: ip,
        // userAgent,
        // referer,
      },
      select: { id: true, type: true, status: true, createdAt: true },
    });

    // Notify ops (best effort)
    if (resend) {
      const to = process.env["SUPPORT_INBOX"] || "ops@qwiksale.sale";
      const from = process.env["EMAIL_FROM"] || "QwikSale <noreply@qwiksale.sale>";
      const safe = (v: string | null) => (v ? v.replace(/[<>]/g, "") : "");

      const html = `
        <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Ubuntu,Helvetica,Arial,sans-serif">
          <h2>Listing reported</h2>
          <p><b>Listing ID:</b> ${safe(productId)}</p>
          <p><b>Reason:</b> ${safe(reason)}</p>
          ${url ? `<p><b>URL:</b> <a href="${safe(url)}">${safe(url)}</a></p>` : ""}
          ${email ? `<p><b>Reporter email:</b> ${safe(email)}</p>` : ""}
          ${name ? `<p><b>Reporter name:</b> ${safe(name)}</p>` : ""}
          ${reporterId ? `<p><b>Reporter ID:</b> ${safe(reporterId)}</p>` : ""}
          ${referer ? `<p><b>Referer:</b> ${safe(referer)}</p>` : ""}
          ${userAgent ? `<p><b>UA:</b> ${safe(userAgent)}</p>` : ""}
        </div>
      `;
      const text =
        `Listing reported\n` +
        `Listing ID: ${productId}\n` +
        `Reason: ${reason}\n` +
        (url ? `URL: ${url}\n` : "") +
        (email ? `Reporter email: ${email}\n` : "") +
        (name ? `Reporter name: ${name}\n` : "") +
        (reporterId ? `Reporter ID: ${reporterId}\n` : "") +
        (referer ? `Referer: ${referer}\n` : "") +
        (userAgent ? `UA: ${userAgent}\n` : "");

      await resend.emails
        .send({
          from,
          to,
          subject: "Listing reported",
          html,
          text,
        })
        .catch(() => void 0);
    }

    return noStore({ ok: true, id: ticket.id });
  } catch (e: any) {
    // eslint-disable-next-line no-console
    console.warn("[/api/report POST] error:", e);
    return noStore({ error: "Server error" }, { status: 500 });
  }
}
