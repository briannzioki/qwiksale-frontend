// src/app/api/account/delete/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/prisma";
import type { Prisma } from "@prisma/client";

// (optional) light throttling if you already have this helper in your project.
// If not present, these calls are wrapped in try/catch and safely ignored.
let throttle:
  | ((
      key: string,
      max: number,
      windowSec: number
    ) => Promise<{ allowed: boolean }>)
  | null = null;

try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const mod = require("@/app/api/auth/otp/_store") as {
    throttle: (
      key: string,
      max: number,
      windowSec: number
    ) => Promise<{ allowed: boolean }>;
  };
  throttle = mod?.throttle ?? null;
} catch {
  throttle = null;
}

/* ----------------------------------------------------------------------------
 * tiny utils
 * -------------------------------------------------------------------------- */
function noStore(json: unknown, init?: ResponseInit) {
  const res = NextResponse.json(json, init);
  res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
  res.headers.set("Pragma", "no-cache");
  res.headers.set("Expires", "0");
  return res;
}

function isAdminEmail(email?: string | null) {
  const raw = process.env["ADMIN_EMAILS"] || "";
  const set = new Set(
    raw
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean)
  );
  return !!email && set.has(email.toLowerCase());
}

type Parsed = { confirm: boolean; email: string };

async function parseConfirm(req: NextRequest): Promise<Parsed> {
  // Prefer JSON body. Fall back to query for DELETE/GET testing.
  let body: any = null;
  try {
    body = await req.json();
  } catch {
    /* ignore non-JSON bodies */
  }

  const url = new URL(req.url);
  const q = (k: string) => url.searchParams.get(k) ?? undefined;

  const rawConfirm = body?.confirm ?? q("confirm") ?? q("c");
  const rawEmail =
    body?.email ?? body?.Email ?? q("email") ?? q("e") ?? q("mail");

  const confirm =
    rawConfirm === true || rawConfirm === "true" || rawConfirm === "1";
  const email =
    typeof rawEmail === "string" ? rawEmail.trim().toLowerCase() : "";

  return { confirm, email };
}

/* ----------------------------------------------------------------------------
 * core handler
 * -------------------------------------------------------------------------- */
async function handle(req: NextRequest) {
  try {
    // Throttle by IP a bit to avoid abuse (best-effort)
    try {
      if (throttle) {
        const hdrs = req.headers; // always present on NextRequest

        // SAFE: guard the first-hop access and trim with optional chaining
        const forwarded = hdrs.get("x-forwarded-for") || "";
        const firstHop = forwarded.split(",")[0]?.trim();
        const ip =
          firstHop ||
          hdrs.get("x-real-ip") ||
          hdrs.get("cf-connecting-ip") ||
          "ip:unknown";

        const th = await throttle(`acctdel:ip:${ip}`, 6, 60); // 6/min/IP
        if (!th.allowed)
          return noStore(
            { error: "Too many requests, try again later." },
            { status: 429 }
          );
      }
    } catch {
      /* ignore throttle errors */
    }

    const session = await auth();
    const userId = (session as any)?.user?.id as string | undefined;
    const sessionEmail = (session as any)?.user?.email as string | undefined;

    if (!userId || !sessionEmail) {
      return noStore({ error: "Unauthorized" }, { status: 401 });
    }

    // Prevent accidental deletion of admin accounts
    if (isAdminEmail(sessionEmail)) {
      return noStore(
        { error: "Admins cannot self-delete via this endpoint." },
        { status: 403 }
      );
    }

    const { confirm, email } = await parseConfirm(req);
    if (!confirm) return noStore({ error: "Missing confirm:true" }, { status: 400 });
    if (!email) return noStore({ error: "Email is required" }, { status: 400 });
    if (email.toLowerCase() !== sessionEmail.toLowerCase()) {
      return noStore({ error: "Email mismatch" }, { status: 400 });
    }

    // Gather owned product IDs for related cleanup
    let productIds: string[] = [];
    try {
      const myProducts: Array<{ id: string }> = await prisma.product.findMany({
        where: { sellerId: userId },
        select: { id: true },
      });
      productIds = myProducts.map((p) => p.id);
    } catch {
      productIds = [];
    }

    // We'll collect Prisma operations into a single transaction.
    // Use a precise type so TS knows this is the *array* overload.
    const ops: Prisma.PrismaPromise<unknown>[] = [];

    // 1) Favorites: by user and on their products
    try {
      if ((prisma as any).favorite?.deleteMany) {
        ops.push(
          ((prisma as any).favorite.deleteMany({
            where: { userId },
          }) as unknown) as Prisma.PrismaPromise<unknown>
        );
        if (productIds.length > 0) {
          ops.push(
            ((prisma as any).favorite.deleteMany({
              where: { productId: { in: productIds } },
            }) as unknown) as Prisma.PrismaPromise<unknown>
          );
        }
      }
    } catch {
      /* ignore */
    }

    // 2) Referrals
    try {
      if ((prisma as any).referral?.deleteMany) {
        ops.push(
          ((prisma as any).referral.deleteMany({
            where: { inviterId: userId },
          }) as unknown) as Prisma.PrismaPromise<unknown>
        );
        ops.push(
          ((prisma as any).referral.deleteMany({
            where: { inviteeId: userId },
          }) as unknown) as Prisma.PrismaPromise<unknown>
        );
      }
    } catch {
      /* ignore */
    }

    // 3) Support tickets (detach reporter)
    try {
      if ((prisma as any).supportTicket?.updateMany) {
        ops.push(
          ((prisma as any).supportTicket.updateMany({
            where: { reporterId: userId },
            data: { reporterId: null },
          }) as unknown) as Prisma.PrismaPromise<unknown>
        );
      }
    } catch {
      /* ignore */
    }

    // 4) Contact reveal logs for my products / my views
    try {
      if ((prisma as any).contactReveal?.deleteMany) {
        if (productIds.length > 0) {
          ops.push(
            ((prisma as any).contactReveal.deleteMany({
              where: { productId: { in: productIds } },
            }) as unknown) as Prisma.PrismaPromise<unknown>
          );
        }
        ops.push(
          ((prisma as any).contactReveal.deleteMany({
            where: { viewerUserId: userId },
          }) as unknown) as Prisma.PrismaPromise<unknown>
        );
      }
    } catch {
      /* ignore */
    }

    // 5) OAuth Accounts (NextAuth) — detach first to avoid FK surprises
    try {
      if ((prisma as any).account?.deleteMany) {
        ops.push(
          ((prisma as any).account.deleteMany({
            where: { userId },
          }) as unknown) as Prisma.PrismaPromise<unknown>
        );
      }
    } catch {
      /* ignore */
    }

    // 6) Verification tokens (cleanup)
    try {
      if ((prisma as any).verificationToken?.deleteMany) {
        ops.push(
          ((prisma as any).verificationToken.deleteMany({
            where: { identifier: { contains: email } },
          }) as unknown) as Prisma.PrismaPromise<unknown>
        );
      }
    } catch {
      /* ignore */
    }

    // 7) Payments / orders (if present): best-effort
    try {
      if ((prisma as any).payment?.deleteMany) {
        ops.push(
          ((prisma as any).payment.deleteMany({
            where: { userId },
          }) as unknown) as Prisma.PrismaPromise<unknown>
        );
      }
      if ((prisma as any).order?.deleteMany) {
        ops.push(
          ((prisma as any).order.deleteMany({
            where: { buyerId: userId },
          }) as unknown) as Prisma.PrismaPromise<unknown>
        );
      }
    } catch {
      /* ignore */
    }

    // 8) My products last (FKs above cleared)
    try {
      ops.push(prisma.product.deleteMany({ where: { sellerId: userId } }));
    } catch {
      /* ignore */
    }

    // 9) Finally: the user
    ops.push(prisma.user.delete({ where: { id: userId } }));

    await prisma.$transaction(ops);

    // Let the client perform signOut() + redirect; we just confirm deletion.
    return noStore({ ok: true });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn("[/api/account/delete] error:", e);
    return noStore({ error: "Server error" }, { status: 500 });
  }
}

/* ----------------------------------------------------------------------------
 * handlers
 * -------------------------------------------------------------------------- */
// Prefer POST with JSON body (confirm + email)
export async function POST(req: NextRequest) {
  return handle(req);
}

// Allow DELETE with query fallback: ?confirm=true&email=you@example.com
export async function DELETE(req: NextRequest) {
  return handle(req);
}

// Optional: quick “is alive”
export async function GET() {
  return noStore({ ok: true, method: "GET" }, { status: 200 });
}

// CORS-preflight convenience
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: { "Cache-Control": "no-store, no-cache, must-revalidate" },
  });
}
