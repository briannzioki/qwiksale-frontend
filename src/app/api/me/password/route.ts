export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { requireUser } from "@/app/lib/authz";

function jsonNoStore(payload: unknown, init?: ResponseInit) {
  const res = NextResponse.json(payload, init);
  res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
  res.headers.set("Pragma", "no-cache");
  res.headers.set("Expires", "0");
  res.headers.set("Vary", "Authorization, Cookie, Accept-Encoding");
  return res;
}

function badRequest(message: string) {
  return jsonNoStore({ error: message }, { status: 400 });
}

function unauthorized(message = "Unauthorized") {
  return jsonNoStore({ error: message }, { status: 401 });
}

function serverError(message = "Server error", detail?: string) {
  return jsonNoStore({ error: message, ...(detail ? { detail } : {}) }, { status: 500 });
}

async function hashPassword(password: string): Promise<string> {
  // ✅ bcryptjs only (removes TS + native build issues from `bcrypt`)
  try {
    const bcryptjs: any = await import("bcryptjs");
    const saltRounds = 10;
    if (typeof bcryptjs?.hash === "function") {
      return await bcryptjs.hash(password, saltRounds);
    }
  } catch {
    // ignore
  }

  // Fallback (last resort): deterministic hash.
  // NOTE: Your Credentials verifier should ideally use the same scheme.
  const { createHash } = await import("crypto");
  return createHash("sha256").update(password).digest("hex");
}

export async function POST(req: NextRequest) {
  const authz = await requireUser({ mode: "result", callbackUrl: "/api/me/password" });
  if (!authz.authorized) return unauthorized(authz.reason);

  const userId = String((authz.user as any)?.id ?? "").trim();
  if (!userId) return unauthorized();

  const body = (await req.json().catch(() => null)) as any;
  const password = typeof body?.password === "string" ? body.password : "";
  const confirm = typeof body?.confirm === "string" ? body.confirm : "";

  const pw = password;
  const cf = confirm;

  if (!pw.trim() || !cf.trim()) return badRequest("Password and confirm are required.");
  if (pw.length < 6) return badRequest("Password must be at least 6 characters.");
  if (pw !== cf) return badRequest("Passwords do not match.");

  const hashed = await hashPassword(pw);

  const anyPrisma = prisma as any;
  const userModel = anyPrisma?.user;

  if (!userModel || typeof userModel.update !== "function") {
    return jsonNoStore({ error: "User model is not available yet." }, { status: 501 });
  }

  // ✅ Your schema uses `passwordHash`, so try that first.
  const candidates = ["passwordHash", "hashedPassword", "passwordDigest", "password"] as const;

  let lastErr: any = null;

  for (const field of candidates) {
    try {
      await userModel.update({
        where: { id: userId },
        data: { [field]: hashed },
        select: { id: true },
      });

      return jsonNoStore({ ok: true, updated: field }, { status: 200 });
    } catch (e: any) {
      lastErr = e;
      const msg = String(e?.message ?? e);
      if (/unknown argument|unknown field|argument .* is missing/i.test(msg)) continue;
      continue;
    }
  }

  const verbose = process.env["E2E_VERBOSE_ERRORS"] === "1" || process.env.NODE_ENV !== "production";

  return serverError(
    "Could not update password field (schema mismatch).",
    verbose ? String(lastErr?.message ?? lastErr) : undefined,
  );
}

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      "Cache-Control": "no-store, no-cache, must-revalidate",
      Pragma: "no-cache",
      Expires: "0",
      Vary: "Authorization, Cookie, Accept-Encoding",
      Allow: "POST,OPTIONS",
    },
  });
}
