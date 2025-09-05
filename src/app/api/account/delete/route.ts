// src/app/api/account/delete/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/prisma";

function noStore(json: unknown, init?: ResponseInit) {
  const res = NextResponse.json(json, init);
  res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
  res.headers.set("Pragma", "no-cache");
  res.headers.set("Expires", "0");
  return res;
}

type Parsed = { confirm: boolean; email: string };

async function parseConfirm(req: NextRequest): Promise<Parsed> {
  // Prefer JSON body (POST). Fall back to query (DELETE or GET for testing).
  let body: any = null;
  try {
    body = await req.json();
  } catch {
    // ignore
  }

  const url = new URL(req.url);
  const q = (k: string) => url.searchParams.get(k) ?? undefined;

  const rawConfirm =
    body?.confirm ??
    q("confirm") ??
    q("c");

  const rawEmail =
    body?.email ??
    body?.Email ??
    q("email") ??
    q("e") ??
    q("mail");

  const confirm =
    rawConfirm === true ||
    rawConfirm === "true" ||
    rawConfirm === "1";

  const email = typeof rawEmail === "string" ? rawEmail.trim().toLowerCase() : "";

  return { confirm, email };
}

async function handle(req: NextRequest) {
  try {
    const session = await auth();
    const userId = (session as any)?.user?.id as string | undefined;
    const sessionEmail = (session as any)?.user?.email as string | undefined;

    if (!userId || !sessionEmail) {
      return noStore({ error: "Unauthorized" }, { status: 401 });
    }

    const { confirm, email } = await parseConfirm(req);
    if (!confirm) {
      return noStore({ error: "Missing confirm:true" }, { status: 400 });
    }
    if (!email || email.toLowerCase() !== sessionEmail.toLowerCase()) {
      return noStore({ error: "Email mismatch" }, { status: 400 });
    }

    // Collect product ids owned by this user (tolerant if Product not present)
    let productIds: string[] = [];
    try {
      const myProducts: Array<{ id: string }> = await prisma.product.findMany({
    where: { sellerId: userId },
    select: { id: true },
      });
      productIds = myProducts.map((p) => p.id);
    } catch {
      // if Product model doesn't exist, skip
      productIds = [];
    }

    const ops = [];

    // Favorites saved by this user
    try {
      // @ts-ignore optional
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
      /* noop */
    }

    // Their products
    try {
      ops.push(prisma.product.deleteMany({ where: { sellerId: userId } }));
    } catch {
      /* noop */
    }

    // Finally the user
    ops.push(prisma.user.delete({ where: { id: userId } }));

    await prisma.$transaction(ops as any[]);

    // Client should signOut() after this; we just return ok.
    return noStore({ ok: true });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn("[/api/account/delete] error:", e);
    return noStore({ error: "Server error" }, { status: 500 });
  }
}

// Prefer POST with JSON body (confirm + email)
export async function POST(req: NextRequest) {
  return handle(req);
}

// Allow DELETE with query fallback: ?confirm=true&email=you@example.com
export async function DELETE(req: NextRequest) {
  return handle(req);
}
