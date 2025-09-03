export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { auth } from "@/auth";

function noStore(json: unknown, init?: ResponseInit) {
  const res = NextResponse.json(json, init);
  res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
  return res;
}

const MAX_LEN = 4000;

export async function POST(req: NextRequest) {
  try {
    const s = await auth();
    const reporterId = (s as any)?.user?.id as string | undefined;

    const body = await req.json().catch(() => null);
    if (!body) return noStore({ error: "Invalid JSON" }, { status: 400 });

    // honeypot (bots will fill non-visible field)
    if (typeof body.hpt === "string" && body.hpt.trim() !== "") {
      return noStore({ ok: true });
    }

    const type = String(body.type || "CONTACT").toUpperCase();
    const message = String(body.message || "").trim();
    if (!message) return noStore({ error: "Message is required" }, { status: 400 });

    const name = body.name ? String(body.name).slice(0, 200) : null;
    const email = body.email ? String(body.email).slice(0, 200) : null;
    const subject = body.subject ? String(body.subject).slice(0, 200) : null;

    const url = body.url ? String(body.url).slice(0, 500) : null;
    const productId = body.productId ? String(body.productId) : null;

    if (message.length > MAX_LEN) {
      return noStore({ error: `Message too long (max ${MAX_LEN} chars)` }, { status: 400 });
    }

    const ticket = await prisma.supportTicket.create({
      data: {
        type: ["CONTACT", "BUG", "REPORT_LISTING", "REPORT_USER", "OTHER"].includes(type)
          ? (type as any)
          : "CONTACT",
        name,
        email,
        subject,
        message,
        url,
        productId,
        reporterId: reporterId || null,
      },
      select: { id: true, type: true, status: true, createdAt: true },
    });

    return noStore({ ok: true, ticket });
  } catch (e) {
    console.warn("[/api/support POST] error:", e);
    return noStore({ error: "Server error" }, { status: 500 });
  }
}
