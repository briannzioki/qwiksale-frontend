export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/prisma";

function noStore(json: unknown, init?: ResponseInit) {
  const res = NextResponse.json(json, init);
  res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
  return res;
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// keep username rules consistent with your other endpoint if you want
function looksLikeValidUsername(u: string) {
  return /^[a-zA-Z0-9._]{3,24}$/.test(u);
}

export async function POST(req: Request) {
  // Require an authenticated user (we key updates by user.id)
  const session = await auth();
  const userId = (session as any)?.user?.id as string | undefined;
  if (!userId) {
    return noStore({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({} as any));
  const { username, email } = body as {
    username?: string;
    email?: string;
  };

  // Build the update payload based on what was provided
  const data: Record<string, any> = {};

  if (typeof username === "string" && username.trim()) {
    const u = username.trim();
    if (!looksLikeValidUsername(u)) {
      return noStore(
        { error: "Username must be 3–24 chars (letters, numbers, dot, underscore)." },
        { status: 400 }
      );
    }
    data.username = u;
  }

  if (typeof email === "string" && email.trim()) {
    const e = email.trim().toLowerCase();
    if (!isValidEmail(e)) {
      return noStore({ error: "Invalid email address." }, { status: 400 });
    }
    data.email = e;
  }

  if (Object.keys(data).length === 0) {
    return noStore(
      { error: "Nothing to update. Provide at least one of username or email." },
      { status: 400 }
    );
  }

  try {
    const user = await prisma.user.update({
      where: { id: userId },
      data,
      select: {
        id: true,
        email: true,
        username: true,
        name: true,
        // NOTE: No `emailVerified`, `verified`, or `phone` here since they
        // are not present in your current User schema.
      },
    });

    return noStore(
      { ok: true, user },
      { headers: { "Cache-Control": "no-store, no-cache, must-revalidate" } }
    );
  } catch (e: any) {
    // Unique constraint conflict (e.g., username or email already taken)
    if (e?.code === "P2002") {
      const target =
        Array.isArray(e.meta?.target) ? e.meta.target.join(", ") : String(e.meta?.target || "");
      return noStore({ error: `Already in use: ${target}` }, { status: 409 });
    }
    // eslint-disable-next-line no-console
    console.error("[complete-profile] POST error:", e);
    return noStore({ error: "Server error" }, { status: 500 });
  }
}
