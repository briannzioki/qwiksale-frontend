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

function isValidEmail(email: string): boolean {
  // basic RFC5322-lite check
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// Keep username rules consistent across the app
function looksLikeValidUsername(u: string) {
  // 3–24 chars: letters, numbers, dot, underscore; no spaces
  return /^[a-zA-Z0-9._]{3,24}$/.test(u);
}

export async function POST(req: Request) {
  // Require an authenticated user (we key updates by user.id)
  const session = await auth();
  const userId = (session as any)?.user?.id as string | undefined;
  if (!userId) {
    return noStore({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return noStore({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (typeof body !== "object" || body === null) {
    return noStore({ error: "Body must be a JSON object." }, { status: 400 });
  }

  const { username, email } = body as {
    username?: unknown;
    email?: unknown;
  };

  // Build the update payload based on what was provided
  const data: Record<string, any> = {};

  if (typeof username === "string" && username.trim()) {
    const u = username.trim();
    if (!looksLikeValidUsername(u)) {
      return noStore(
        { error: "Username must be 3–24 characters using letters, numbers, dot, or underscore." },
        { status: 400 }
      );
    }
    data.username = u;
  } else if (username !== undefined && username !== null && username !== "") {
    return noStore({ error: "username must be a non-empty string." }, { status: 400 });
  }

  if (typeof email === "string" && email.trim()) {
    const e = email.trim().toLowerCase();
    if (!isValidEmail(e)) {
      return noStore({ error: "Invalid email address." }, { status: 400 });
    }
    data.email = e;
  } else if (email !== undefined && email !== null && email !== "") {
    return noStore({ error: "email must be a non-empty string." }, { status: 400 });
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
        // If you later add fields like emailVerified/phone, include/select/update them here.
      },
    });

    return noStore({ ok: true, user });
  } catch (e: any) {
    // Unique constraint conflict (e.g., username or email already taken)
    if (e?.code === "P2002") {
      const target = Array.isArray(e.meta?.target)
        ? e.meta.target.join(", ")
        : String(e.meta?.target || "field");
      return noStore({ error: `Already in use: ${target}` }, { status: 409 });
    }

    // eslint-disable-next-line no-console
    console.error("[complete-profile] POST error:", e);
    return noStore({ error: "Server error" }, { status: 500 });
  }
}
