export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/prisma";

function noStore(json: unknown, init?: ResponseInit) {
  const res = NextResponse.json(json, init);
  res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
  return res;
}

function looksLikeValidUsername(u: string) {
  return /^[a-zA-Z0-9._]{3,24}$/.test(u);
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

    const updates: Record<string, any> = {};

    // Optional name update
    if (typeof body.name === "string") {
      updates.name = body.name.trim();
    }

    // Optional username update with validation + uniqueness check
    if (typeof body.username === "string") {
      const username = body.username.trim();
      if (!looksLikeValidUsername(username)) {
        return noStore(
          { error: "Username must be 3–24 chars (letters, numbers, dot, underscore)." },
          { status: 400 }
        );
      }

      // Enforce unique username (case-insensitive) for other users
      const clash = await prisma.user.findFirst({
        where: { username: { equals: username, mode: "insensitive" }, NOT: { id: userId } },
        select: { id: true },
      });
      if (clash) {
        return noStore({ error: "Username is already taken." }, { status: 409 });
      }
      updates.username = username;
    }

    if (Object.keys(updates).length === 0) {
      return noStore({ error: "Nothing to update." }, { status: 400 });
    }

    await prisma.user.update({
      where: { id: userId },
      data: updates,
      select: { id: true },
    });

    return noStore({ ok: true });
  } catch (e) {
    console.warn("[/api/me/profile PATCH] error:", e);
    return noStore({ error: "Server error" }, { status: 500 });
  }
}
