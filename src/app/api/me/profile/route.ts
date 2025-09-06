// src/app/api/me/profile/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/prisma";

function noStore(json: unknown, init?: ResponseInit) {
  const res = NextResponse.json(json, init);
  res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
  res.headers.set("Pragma", "no-cache");
  res.headers.set("Expires", "0");
  return res;
}

function looksLikeValidUsername(u: string) {
  return /^[a-zA-Z0-9._]{3,24}$/.test(u);
}

function normalizeName(input: unknown): string | undefined {
  if (typeof input !== "string") return undefined;
  const s = input.trim().replace(/\s+/g, " ");
  if (!s) return ""; // allow clearing; change to `undefined` if you want to ignore empties
  if (s.length > 80) return s.slice(0, 80);
  return s;
}

export async function PATCH(req: Request) {
  try {
    const session = await auth();
    const userId = (session as any)?.user?.id as string | undefined;
    if (!userId) return noStore({ error: "Unauthorized" }, { status: 401 });

    const body = (await req.json().catch(() => ({}))) as {
      name?: string;
      username?: string;
      // image is updated via /api/account/profile/photo
    };

    // Use indexable shape to build patch object safely with bracket notation
    const data: Record<string, unknown> = {};

    // Optional name
    const normName = normalizeName(body?.name);
    if (normName !== undefined) data["name"] = normName;

    // Optional username with validation + uniqueness (case-insensitive)
    if (typeof body?.username === "string") {
      const username = body.username.trim();
      if (!looksLikeValidUsername(username)) {
        return noStore(
          { error: "Username must be 3–24 chars (letters, numbers, dot, underscore)." },
          { status: 400 }
        );
      }

      const clash = await prisma.user.findFirst({
        where: {
          username: { equals: username, mode: "insensitive" },
          NOT: { id: userId },
        },
        select: { id: true },
      });
      if (clash) {
        return noStore({ error: "Username is already taken." }, { status: 409 });
      }

      data["username"] = username;
    }

    if (Object.keys(data).length === 0) {
      return noStore({ error: "Nothing to update." }, { status: 400 });
    }

    const user = await prisma.user.update({
      where: { id: userId },
      data,
      select: {
        id: true,
        email: true,
        username: true,
        name: true,
        image: true,
      },
    });

    return noStore({ ok: true, user });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn("[/api/me/profile PATCH] error:", e);
    return noStore({ error: "Server error" }, { status: 500 });
  }
}
