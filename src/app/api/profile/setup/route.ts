// src/app/api/profile/setup/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/prisma";

/* ---------------- analytics (console-only for now) ---------------- */
type AnalyticsEvent =
  | "profile_setup_attempt"
  | "profile_setup_unauthorized"
  | "profile_setup_invalid_username"
  | "profile_setup_username_taken"
  | "profile_setup_success"
  | "profile_setup_error";

function track(event: AnalyticsEvent, props?: Record<string, unknown>) {
  try {
    // eslint-disable-next-line no-console
    console.log(`[track] ${event}`, { ts: new Date().toISOString(), ...props });
  } catch {
    /* no-op */
  }
}

/* ------------------------ helpers & validation ------------------------ */

function noStore(json: unknown, init?: ResponseInit) {
  const res = NextResponse.json(json, init);
  res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
  res.headers.set("Pragma", "no-cache");
  res.headers.set("Expires", "0");
  return res;
}

function normalizeKenyanPhone(raw?: string | null): string | null {
  const s0 = (raw || "").trim();
  if (!s0) return null;
  // strip non-digits
  let s = s0.replace(/\D+/g, "");
  // +2547/ +2541… -> 254…
  if (/^\+?254(7|1)\d{8}$/.test(s0)) s = s.replace(/^\+/, "");
  // 07XXXXXXXX / 01XXXXXXXX -> 2547XXXXXXXX / 2541XXXXXXXX
  if (/^07\d{8}$/.test(s)) s = "254" + s.slice(1);
  if (/^01\d{8}$/.test(s)) s = "254" + s.slice(1);
  // 7XXXXXXXX / 1XXXXXXXX -> 2547XXXXXXXX / 2541XXXXXXXX
  if (/^(7|1)\d{8}$/.test(s)) s = "254" + s;
  // final validation
  if (/^254(7|1)\d{8}$/.test(s)) return s;
  return null;
}

const RESERVED_USERNAMES = new Set([
  "admin",
  "administrator",
  "root",
  "support",
  "help",
  "contact",
  "api",
  "auth",
  "login",
  "logout",
  "signup",
  "register",
  "me",
  "profile",
  "settings",
  "qwiksale",
  "qwik",
  "user",
]);

function looksLikeValidUsername(u: string) {
  // 3–24, letters/numbers/dot/underscore, must contain at least one letter/number
  return /^[a-zA-Z0-9](?:[a-zA-Z0-9._]{1,22})[a-zA-Z0-9]$/.test(u);
}

function normStr(input: unknown, max = 120): string | null {
  if (typeof input !== "string") return null;
  const s = input.trim().replace(/\s+/g, " ");
  if (!s) return null;
  return s.slice(0, max);
}

function safeLower(s?: string | null) {
  return (s || "").toLowerCase();
}

/* ------------------------------ CORS (opt) ------------------------------ */

export function OPTIONS() {
  const res = new NextResponse(null, { status: 204 });
  res.headers.set("Access-Control-Allow-Origin", process.env["NEXT_PUBLIC_APP_URL"] || "*");
  res.headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.headers.set("Access-Control-Max-Age", "86400");
  res.headers.set("Cache-Control", "no-store");
  return res;
}

/* --------------------------------- POST --------------------------------- */

export async function POST(req: Request) {
  const reqId =
    (globalThis as any).crypto?.randomUUID?.() ??
    Math.random().toString(36).slice(2);

  try {
    // Auth
    const session = await auth();
    const uid = (session as any)?.user?.id as string | undefined;
    if (!uid) {
      track("profile_setup_unauthorized", { reqId });
      return noStore({ error: "Unauthorized" }, { status: 401 });
    }

    // Body
    const body = (await req.json().catch(() => ({}))) as {
      username?: unknown;
      whatsapp?: unknown;
      city?: unknown;
      country?: unknown;
      postalCode?: unknown;
      address?: unknown;
      name?: unknown; // allow setting name here too (optional)
    };

    const usernameRaw =
      typeof body.username === "string" ? body.username.trim() : "";

    track("profile_setup_attempt", {
      reqId,
      userId: uid,
      hasWhatsapp: typeof body.whatsapp === "string" && !!body.whatsapp.trim(),
      hasCity: typeof body.city === "string" && !!body.city.trim(),
      hasCountry: typeof body.country === "string" && !!body.country.trim(),
      hasPostal: typeof body.postalCode === "string" && !!body.postalCode.trim(),
      hasAddress: typeof body.address === "string" && !!body.address.trim(),
      hasName: typeof body.name === "string" && !!body.name.trim(),
    });

    // Validate username
    if (!looksLikeValidUsername(usernameRaw)) {
      track("profile_setup_invalid_username", { reqId, userId: uid, usernameRaw });
      return noStore(
        { error: "Username must be 3–24 chars, letters/numbers with dot or underscore (no trailing/leading symbols)." },
        { status: 400 }
      );
    }
    if (RESERVED_USERNAMES.has(safeLower(usernameRaw))) {
      track("profile_setup_invalid_username", { reqId, userId: uid, reason: "reserved" });
      return noStore({ error: "This username is reserved" }, { status: 400 });
    }

    const whatsapp = normalizeKenyanPhone(
      typeof body.whatsapp === "string" ? body.whatsapp : null
    );
    const city = normStr(body.city, 60);
    const country = normStr(body.country, 60);
    const postalCode = normStr(body.postalCode, 20);
    const address = normStr(body.address, 160);
    const name = normStr(body.name, 80);

    // Case-insensitive uniqueness check (exclude self)
    const clash = await prisma.user.findFirst({
      where: {
        username: { equals: usernameRaw, mode: "insensitive" },
        NOT: { id: uid },
      },
      select: { id: true },
    });
    if (clash) {
      track("profile_setup_username_taken", { reqId, userId: uid });
      return noStore({ error: "Username already taken" }, { status: 409 });
    }

    // Update
    const updated = await prisma.user.update({
      where: { id: uid },
      data: {
        username: usernameRaw,
        whatsapp: whatsapp || null,
        city,
        country,
        postalCode,
        address,
        ...(name !== null ? { name } : {}),
      },
      select: {
        id: true,
        email: true,
        username: true,
        name: true,
        whatsapp: true,
        city: true,
        country: true,
        postalCode: true,
        address: true,
        image: true,
      },
    });

    track("profile_setup_success", { reqId, userId: uid });

    return noStore({ ok: true, user: updated });
  } catch (e: any) {
    // Prisma unique fallback (e.g., DB col unique)
    if (e?.code === "P2002") {
      track("profile_setup_username_taken", { reqId });
      return noStore({ error: "Username already taken" }, { status: 409 });
    }
    // eslint-disable-next-line no-console
    console.error("[profile/setup POST] error", e);
    track("profile_setup_error", { reqId, message: e?.message ?? String(e) });
    return noStore({ error: "Failed to save profile" }, { status: 500 });
  }
}
