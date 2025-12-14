// src/app/api/support/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/app/lib/prisma";
import { auth } from "@/auth";
import crypto from "node:crypto";

/**
 * Support ticket intake (contact, bug, report listing/user).
 *
 * Adds:
 * - Optional email via Resend OR Postmark (env-driven)
 * - Optional Slack webhook (env-driven)
 * - Optional CAPTCHA (Turnstile or reCAPTCHA) when secrets are present
 * - Optional telemetry persistence when columns exist (clientIp, userAgent, referer, contentHash)
 * - GET health endpoint
 */

const MAX_LEN = 4000;
const MIN_MESSAGE = 10;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;
const TYPES = ["CONTACT", "BUG", "REPORT_LISTING", "REPORT_USER", "OTHER"] as const;
type TicketType = (typeof TYPES)[number];

const SOFT_RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const SOFT_RATE_LIMIT_MAX = 8;

const ALLOW_ORIGIN =
  process.env["NEXT_PUBLIC_BASE_URL"] || process.env["NEXT_PUBLIC_APP_URL"] || "*";

/* --------------------------------- utils --------------------------------- */

function noStore(json: unknown, init?: ResponseInit) {
  const res = NextResponse.json(json, init);
  res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
  res.headers.set("Pragma", "no-cache");
  res.headers.set("Expires", "0");
  res.headers.set("Vary", "Origin");
  res.headers.set("Access-Control-Allow-Origin", ALLOW_ORIGIN);
  return res;
}

function getClientIp(req: NextRequest): string {
  const xf = req.headers.get("x-forwarded-for");
  if (xf) return xf.split(",")[0]?.trim() || "0.0.0.0";
  const xr = req.headers.get("x-real-ip");
  if (xr) return xr.trim();
  return "0.0.0.0";
}

function normalizeMessage(raw: unknown): string {
  let s = String(raw ?? "").trim();
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

function normalizeId(raw: unknown): string | null {
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
  } catch {}
  return null;
}

function parseType(raw: unknown): TicketType {
  const s = String(raw ?? "CONTACT").toUpperCase();
  return (TYPES as readonly string[]).includes(s) ? (s as TicketType) : "CONTACT";
}

function contentHash(input: string): string {
  return crypto.createHash("sha256").update(input).digest("hex");
}

function escHtml(s: string) {
  return s.replace(/[&<>"]/g, (c) =>
    c === "&" ? "&amp;" : c === "<" ? "&lt;" : c === ">" ? "&gt;" : "&quot;"
  );
}

/* ------------------------------- CAPTCHA -------------------------------- */

const TURNSTILE_SECRET = process.env["TURNSTILE_SECRET_KEY"] || process.env["CF_TURNSTILE_SECRET_KEY"] || "";
const RECAPTCHA_SECRET = process.env["RECAPTCHA_SECRET_KEY"] || process.env["GCAPTCHA_SECRET_KEY"] || "";
// When ANY secret is present, the API will require a token and verify it.
const CAPTCHA_ENABLED = Boolean(TURNSTILE_SECRET || RECAPTCHA_SECRET);

async function verifyCaptcha(params: {
  token?: string | null;
  ip?: string | null;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const token = params.token?.trim();
  if (!CAPTCHA_ENABLED) return { ok: true };
  if (!token) return { ok: false, error: "CAPTCHA token missing" };

  // Prefer Turnstile if configured
  if (TURNSTILE_SECRET) {
    try {
      const r = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          secret: TURNSTILE_SECRET,
          response: token,
          ...(params.ip ? { remoteip: params.ip } : {}),
        }),
      });
      const j = (await r.json().catch(() => ({}))) as any;
      if (j?.success) return { ok: true };
      return { ok: false, error: "Turnstile verification failed" };
    } catch {
      return { ok: false, error: "Turnstile verification error" };
    }
  }

  // Fallback: Google reCAPTCHA v2/v3
  if (RECAPTCHA_SECRET) {
    try {
      const r = await fetch("https://www.google.com/recaptcha/api/siteverify", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          secret: RECAPTCHA_SECRET,
          response: token,
          ...(params.ip ? { remoteip: params.ip } : {}),
        }),
      });
      const j = (await r.json().catch(() => ({}))) as any;
      if (j?.success) return { ok: true };
      return { ok: false, error: "reCAPTCHA verification failed" };
    } catch {
      return { ok: false, error: "reCAPTCHA verification error" };
    }
  }

  // No known provider configured (shouldn’t happen because CAPTCHA_ENABLED checked)
  return { ok: true };
}

/* --------------------------------- CORS ---------------------------------- */

export function OPTIONS() {
  const res = new NextResponse(null, { status: 204 });
  res.headers.set("Access-Control-Allow-Origin", ALLOW_ORIGIN);
  res.headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.headers.set("Access-Control-Max-Age", "86400");
  res.headers.set("Cache-Control", "no-store");
  res.headers.set("Vary", "Origin");
  return res;
}

/* ---------------------------------- GET ---------------------------------- */

export async function GET() {
  // Health check
  return noStore({ ok: true, captcha: CAPTCHA_ENABLED ? "required" : "optional" });
}

/* ---------------------------------- POST --------------------------------- */

export async function POST(req: NextRequest) {
  try {
    const s = await auth().catch(() => null);
    const reporterId = (s as any)?.user?.id as string | undefined;

    const body = await req.json().catch(() => null);
    if (!body) return noStore({ error: "Invalid JSON" }, { status: 400 });

    // Honeypot
    if (typeof body.hpt === "string" && body.hpt.trim() !== "") {
      return noStore({ ok: true });
    }

    // CAPTCHA (optional: only enforced when secret is configured)
    const captchaToken: string | null =
      body.captchaToken ??
      body.turnstileToken ??
      body.recaptchaToken ??
      body.token ??
      body.captcha ??
      null;

    const clientIp = getClientIp(req);
    const captcha = await verifyCaptcha({ token: captchaToken, ip: clientIp });
    if (!captcha.ok) {
      return noStore({ error: captcha.error }, { status: 400 });
    }

    const type = parseType(body.type);
    const message = normalizeMessage(body.message);
    if (!message) return noStore({ error: "Message is required" }, { status: 400 });
    if (message.trim().length < MIN_MESSAGE) {
      return noStore({ error: `Message must be at least ${MIN_MESSAGE} characters.` }, { status: 400 });
    }

    const name = normalizeName(body.name);
    const email = normalizeEmail(body.email);
    const subject = normalizeSubject(body.subject);
    const url = validUrl(body.url);
    const productId = normalizeId(body.productId);
    const serviceId = normalizeId(body.serviceId);
    const listingType: "product" | "service" | null =
      productId ? "product" : serviceId ? "service" : null;

    if (!email) return noStore({ error: "Email is required" }, { status: 400 });

    // If reporting a listing, verify the id exists
    if (type === "REPORT_LISTING" && listingType && (productId || serviceId)) {
      if (listingType === "product") {
        const exists = await prisma.product.findUnique({ where: { id: productId! }, select: { id: true } });
        if (!exists) return noStore({ error: "Invalid productId" }, { status: 400 });
      } else {
        // tolerate absence of Service model in some schemas
        const any = prisma as any;
        const Svc = any.service ?? any.Service ?? null;
        if (Svc?.findUnique) {
          const exists = await Svc.findUnique({ where: { id: serviceId! }, select: { id: true } });
          if (!exists) return noStore({ error: "Invalid serviceId" }, { status: 400 });
        }
      }
    }

    // Soft abuse guard
    const since = new Date(Date.now() - SOFT_RATE_LIMIT_WINDOW_MS);
    const orIdentities: Prisma.SupportTicketWhereInput[] = [];
    if (reporterId) orIdentities.push({ reporterId });
    if (email) orIdentities.push({ email });
    // NOTE: don't include { clientIp } unless the column exists; we avoid it here.

    const recentCount = await prisma.supportTicket.count({
      where: {
        createdAt: { gte: since },
        ...(orIdentities.length ? { OR: orIdentities } : {}),
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

    // Light dedupe (10 minutes)
    const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000);
    const msgKey = contentHash([message, email ?? "", reporterId ?? ""].join("|"));
    const dupe = await prisma.supportTicket.findFirst({
      where: {
        createdAt: { gte: tenMinAgo },
        message,
        OR: [...(reporterId ? [{ reporterId }] : []), ...(email ? [{ email }] : [])],
      },
      select: { id: true, status: true, createdAt: true },
    });
    if (dupe) return noStore({ ok: true, ticket: dupe, deduped: true });

    const userAgent = req.headers.get("user-agent")?.slice(0, 300) || null;
    const referer = validUrl(req.headers.get("referer"));

    // Create ticket with base fields (always exist)
    const ticket = await prisma.supportTicket.create({
      data: {
        type,
        name,
        email,
        subject,
        message,
        url,
        productId,
        serviceId,
        reporterId: reporterId || null,
      },
      select: { id: true, type: true, status: true, createdAt: true },
    });

    // Optionally persist telemetry if columns exist (safe no-op if they don't)
    void tryUpdateOptionalTelemetry(ticket.id, {
      clientIp,
      userAgent,
      referer,
      contentHash: msgKey,
    });

    // Side-effects are best-effort & non-blocking
    void notifyChannels({
      type,
      name,
      email,
      subject,
      message,
      url,
      productId,
      serviceId,
      clientIp,
      userAgent,
      referer,
      ticketId: ticket.id,
    });

    return noStore({ ok: true, ticket, meta: { clientIp, userAgent, referer } });
  } catch (e) {
    console.warn("[/api/support POST] error:", e);
    return noStore({ error: "Server error" }, { status: 500 });
  }
}

/* ----------------------- Optional telemetry update ----------------------- */

async function tryUpdateOptionalTelemetry(
  id: string,
  fields: {
    clientIp: string | null;
    userAgent: string | null;
    referer: string | null;
    contentHash: string | null;
  }
) {
  try {
    // If these fields do not exist in your Prisma model, this update will throw.
    // We intentionally swallow the error so the endpoint stays compatible.
    await prisma.supportTicket.update({
      where: { id },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      data: fields as any,
      select: { id: true },
    });
  } catch {
    // ignore — optional columns not present
  }
}

/* ---------------------------- Notifications ---------------------------- */

async function notifyChannels(payload: {
  type: TicketType;
  name: string | null;
  email: string;
  subject: string | null;
  message: string;
  url: string | null;
  productId: string | null;
  serviceId: string | null;
  clientIp: string | null;
  userAgent: string | null;
  referer: string | null;
  ticketId: string;
}) {
  await Promise.allSettled([maybeEmail(payload), maybeSlack(payload)]);
}

async function maybeEmail(p: {
  type: TicketType;
  name: string | null;
  email: string;
  subject: string | null;
  message: string;
  url: string | null;
  productId: string | null;
  serviceId: string | null;
  clientIp: string | null;
  userAgent: string | null;
  referer: string | null;
  ticketId: string;
}) {
  const SUPPORT_TO = process.env["SUPPORT_TO"];
  if (!SUPPORT_TO) return;

  const SUPPORT_FROM = process.env["SUPPORT_FROM"] || "support@qwiksale.sale";
  const subj = `[Support] ${p.type}${p.subject ? ` — ${p.subject}` : ""}`;

  const lines = [
    `Ticket: ${p.ticketId}`,
    `Type: ${p.type}`,
    `From: ${p.name ? `${p.name} <${p.email}>` : p.email}`,
    p.url ? `URL: ${p.url}` : null,
    p.productId ? `Product ID: ${p.productId}` : null,
    p.serviceId ? `Service ID: ${p.serviceId}` : null,
    p.referer ? `Referer: ${p.referer}` : null,
    p.clientIp ? `IP: ${p.clientIp}` : null,
    p.userAgent ? `UA: ${p.userAgent}` : null,
    "",
    p.message,
  ].filter(Boolean) as string[];

  const text = lines.join("\n");
  const html =
    `<pre style="white-space:pre-wrap;font-family:ui-monospace,Menlo,Consolas,monospace">` +
    escHtml(text) +
    "</pre>";

  // Try Resend
  const RESEND_API_KEY = process.env["RESEND_API_KEY"];
  if (RESEND_API_KEY) {
    try {
      const r = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${RESEND_API_KEY}`,
        },
        body: JSON.stringify({
          to: SUPPORT_TO,
          from: SUPPORT_FROM,
          subject: subj,
          html,
          text,
        }),
      });
      if (r.ok) return;
    } catch {}
  }

  // Fallback: Postmark
  const POSTMARK_TOKEN = process.env["POSTMARK_TOKEN"] || process.env["POSTMARK_SERVER_TOKEN"];
  if (POSTMARK_TOKEN) {
    try {
      await fetch("https://api.postmarkapp.com/email", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Postmark-Server-Token": POSTMARK_TOKEN,
        },
        body: JSON.stringify({
          From: SUPPORT_FROM,
          To: SUPPORT_TO,
          Subject: subj,
          HtmlBody: html,
          TextBody: text,
          MessageStream: "outbound",
        }),
      });
    } catch {}
  }
}

async function maybeSlack(p: {
  type: TicketType;
  name: string | null;
  email: string;
  subject: string | null;
  message: string;
  url: string | null;
  productId: string | null;
  serviceId: string | null;
  clientIp: string | null;
  userAgent: string | null;
  referer: string | null;
  ticketId: string;
}) {
  const hook = process.env["SUPPORT_SLACK_WEBHOOK_URL"];
  if (!hook) return;

  const title = `*${p.type}* — ${p.subject ?? "_(no subject)_"}`;
  const from = p.name ? `${p.name} <${p.email}>` : p.email;
  const lines = [
    p.url ? `URL: ${p.url}` : null,
    p.productId ? `Product ID: ${p.productId}` : null,
    p.serviceId ? `Service ID: ${p.serviceId}` : null,
    p.referer ? `Referer: ${p.referer}` : null,
    p.clientIp ? `IP: ${p.clientIp}` : null,
  ].filter(Boolean) as string[];

  try {
    await fetch(hook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: `📬 New ${p.type} ticket from ${from}`,
        blocks: [
          { type: "section", text: { type: "mrkdwn", text: title } },
          { type: "section", fields: [{ type: "mrkdwn", text: `*From:*\n${from}` }] },
          ...(lines.length
            ? [{ type: "section", fields: lines.map((t) => ({ type: "mrkdwn", text: t })) }]
            : []),
          { type: "section", text: { type: "mrkdwn", text: "```" + p.message + "```" } },
        ],
      }),
    });
  } catch {}
}
