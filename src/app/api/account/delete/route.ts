export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/prisma";
import type { Prisma } from "@prisma/client";

/* ----------------------------------------------------------------------------
 * tiny utils
 * -------------------------------------------------------------------------- */
function noStore(jsonOrRes: unknown, init?: ResponseInit) {
  const res =
    jsonOrRes instanceof NextResponse
      ? jsonOrRes
      : NextResponse.json(jsonOrRes as any, init);

  res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
  res.headers.set("Pragma", "no-cache");
  res.headers.set("Expires", "0");
  // Per-user responses should vary by cookie to avoid accidental caching
  res.headers.set("Vary", "Cookie");
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
 * optional throttling (lazy, ESM-friendly)
 * -------------------------------------------------------------------------- */
type ThrottleFn = (
  key: string,
  max: number,
  windowSec: number
) => Promise<{ allowed: boolean }>;

let _throttleOnce: Promise<ThrottleFn | null> | null = null;
async function getThrottle(): Promise<ThrottleFn | null> {
  if (_throttleOnce) return _throttleOnce;
  _throttleOnce = import("@/app/api/auth/otp/_store")
    .then((m: any) => (typeof m?.throttle === "function" ? (m.throttle as ThrottleFn) : null))
    .catch(() => null);
  return _throttleOnce;
}

/* ----------------------------------------------------------------------------
 * core handler
 * -------------------------------------------------------------------------- */
async function handle(req: NextRequest) {
  try {
    // Best-effort IP throttle
    try {
      const throttle = await getThrottle();
      if (throttle) {
        const hdrs = req.headers;
        const forwarded = hdrs.get("x-forwarded-for") || "";
        const firstHop = forwarded.split(",")[0]?.trim();
        const ip =
          firstHop ||
          hdrs.get("x-real-ip") ||
          hdrs.get("cf-connecting-ip") ||
          "ip:unknown";

        const th = await throttle(`acctdel:ip:${ip}`, 6, 60); // 6/min/IP
        if (!th.allowed) {
          return noStore({ error: "Too many requests, try again later." }, { status: 429 });
        }
      }
    } catch {
      /* ignore throttle errors */
    }

    const session = await auth().catch(() => null);
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

    // Collect operations for a single transaction
    const ops: Prisma.PrismaPromise<any>[] = [];

    // 1) Favorites: by user and on their products
    try {
      if ((prisma as any).favorite?.deleteMany) {
        ops.push((prisma as any).favorite.deleteMany({ where: { userId } }));
        if (productIds.length > 0) {
          ops.push(
            (prisma as any).favorite.deleteMany({
              where: { productId: { in: productIds } },
            })
          );
        }
      }
    } catch {
      /* ignore */
    }

    // 2) Referrals
    try {
      if ((prisma as any).referral?.deleteMany) {
        ops.push((prisma as any).referral.deleteMany({ where: { inviterId: userId } }));
        ops.push((prisma as any).referral.deleteMany({ where: { inviteeId: userId } }));
      }
    } catch {
      /* ignore */
    }

    // 3) Support tickets (detach reporter)
    try {
      if ((prisma as any).supportTicket?.updateMany) {
        ops.push(
          (prisma as any).supportTicket.updateMany({
            where: { reporterId: userId },
            data: { reporterId: null },
          })
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
            (prisma as any).contactReveal.deleteMany({
              where: { productId: { in: productIds } },
            })
          );
        }
        ops.push(
          (prisma as any).contactReveal.deleteMany({
            where: { viewerUserId: userId },
          })
        );
      }
    } catch {
      /* ignore */
    }

    // 5) OAuth Accounts (NextAuth)
    try {
      if ((prisma as any).account?.deleteMany) {
        ops.push((prisma as any).account.deleteMany({ where: { userId } }));
      }
    } catch {
      /* ignore */
    }

    // 6) Verification tokens
    try {
      if ((prisma as any).verificationToken?.deleteMany) {
        ops.push(
          (prisma as any).verificationToken.deleteMany({
            where: { identifier: { contains: email } },
          })
        );
      }
    } catch {
      /* ignore */
    }

    // 7) Payments / orders (if present): best-effort
    try {
      if ((prisma as any).payment?.deleteMany) {
        ops.push((prisma as any).payment.deleteMany({ where: { userId } }));
      }
      if ((prisma as any).order?.deleteMany) {
        ops.push((prisma as any).order.deleteMany({ where: { buyerId: userId } }));
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

    // Let the client signOut() + redirect; we just confirm deletion.
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

// HEAD for health
export async function HEAD() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Cache-Control": "no-store, no-cache, must-revalidate",
      "Vary": "Cookie",
      "Allow": "GET, POST, DELETE, HEAD, OPTIONS",
    },
  });
}

// CORS-preflight convenience
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Cache-Control": "no-store, no-cache, must-revalidate",
      "Vary": "Cookie",
      "Access-Control-Allow-Methods": "GET, POST, DELETE, HEAD, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  });
}
