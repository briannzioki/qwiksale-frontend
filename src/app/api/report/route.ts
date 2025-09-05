// src/app/api/report/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";          // ✅ use the shared prisma
import { rateLimit } from "@/app/api/_lib/ratelimits"; // ✅ make sure filename is ratelimits.ts
import { auth } from "@/auth";
import { Resend } from "resend";

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

function noStore(json: unknown, init?: ResponseInit) {
  const res = NextResponse.json(json, init);
  res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
  return res;
}

type Body = {
  listingId?: string; // incoming name from client
  reason?: string;
  url?: string;
  email?: string;
  name?: string;
  subject?: string;
};

export async function POST(req: Request) {
  try {
    // Rate limit by IP
    const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0]?.trim() || "0.0.0.0";
    const { success } = await rateLimit.limit(`report:${ip}`);
    if (!success) return new Response("Too Many", { status: 429 });

    // Parse body
    const body = (await req.json().catch(() => ({}))) as Body;

    const productId = String(body.listingId ?? "").trim();
    const reason = (body.reason ?? "").toString().trim();
    const url = (body.url ?? "").toString().trim() || null;
    const name = (body.name ?? "").toString().trim() || null;
    const email = (body.email ?? "").toString().trim().toLowerCase() || null;
    const subject = (body.subject ?? "Listing reported").toString().trim() || null;

    if (!productId) {
      return noStore({ error: "listingId is required" }, { status: 400 });
    }
    if (!reason) {
      return noStore({ error: "reason is required" }, { status: 400 });
    }

    // Optionally verify the product exists (helps avoid junk)
    const exists = await prisma.product.findUnique({
      where: { id: productId },
      select: { id: true },
    });
    if (!exists) {
      return noStore({ error: "Invalid listingId" }, { status: 400 });
    }

    // Attach reporter if signed in
    const session = await auth().catch(() => null);
    const reporterId = (session as any)?.user?.id as string | undefined;

    // Create support ticket — NOTE: message is required in schema
    const ticket = await prisma.supportTicket.create({
      data: {
        type: "REPORT_LISTING",  // ✅ enum in schema
        status: "OPEN",
        productId,               // ✅ correct field name
        message: reason,         // ✅ required field
        url,
        name,
        email,
        subject,
        reporterId: reporterId ?? null,
      },
      select: { id: true, type: true, status: true, createdAt: true },
    });

    // Notify ops via email (best-effort)
    if (resend) {
      const to = process.env.SUPPORT_INBOX || "ops@qwiksale.sale";
      const html = `<p><b>Listing reported</b></p>
<p><b>Listing ID:</b> ${productId}</p>
<p><b>Reason:</b> ${reason}</p>
${url ? `<p><b>URL:</b> ${url}</p>` : ""}
${email ? `<p><b>Reporter email:</b> ${email}</p>` : ""}
${name ? `<p><b>Reporter name:</b> ${name}</p>` : ""}
`;
      // Using the html/text shape (no React template required)
      await resend.emails.send({
        from: process.env.EMAIL_FROM || "QwikSale <noreply@qwiksale.sale>",
        to,
        subject: "Listing reported",
        html,
        text: `Listing ${productId} reported.\nReason: ${reason}\n${url ? `URL: ${url}\n` : ""}`,
      }).catch(() => void 0);
    }

    return noStore({ ok: true, id: ticket.id });
  } catch (e: any) {
    // eslint-disable-next-line no-console
    console.warn("[/api/report POST] error:", e);
    return noStore({ error: "Server error" }, { status: 500 });
  }
}
