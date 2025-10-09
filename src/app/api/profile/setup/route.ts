// src/app/api/profile/setup/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/prisma";
import { checkRateLimit } from "@/app/lib/ratelimit";
import { tooMany } from "@/app/lib/ratelimit-response";
import { revalidateTag, revalidatePath } from "next/cache";

/* ---------------- analytics (console-only for now) ---------------- */
type AnalyticsEvent =
  | "profile_setup_attempt"
  | "profile_setup_unauthorized"
  | "profile_setup_invalid_username"
  | "profile_setup_username_taken"
  | "profile_setup_nop"
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
  res.headers.set("Vary", "Authorization, Cookie, Accept-Encoding");
  return res;
}
function withReqId(res: NextResponse, id: string) {
  res.headers.set("x-request-id", id);
  return res;
}

function normalizeKenyanPhone(raw?: string | null): string | null {
  const s0 = (raw || "").trim();
  if (!s0) return null;
  let s = s0.replace(/\D+/g, "");
  if (/^\+?254(7|1)\d{8}$/.test(s0)) s = s.replace(/^\+/, "");
  if (/^07\d{8}$/.test(s)) s = "254" + s.slice(1);
  if (/^01\d{8}$/.test(s)) s = "254" + s.slice(1);
  if (/^(7|1)\d{8}$/.test(s)) s = "254" + s;
  return /^254(7|1)\d{8}$/.test(s) ? s : null;
}

// Built-ins + extend via env (comma-separated)
const RESERVED_USERNAMES = new Set(
  [
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
  ].concat(
    (process.env["RESERVED_USERNAMES"] || "")
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean)
  )
);

function looksLikeValidUsername(u: string) {
  // 3–24 chars, letters/numbers/dot/underscore; must start/end alnum; no double dots/underscores
  return /^(?![._])(?!.*[._]$)(?!.*[._]{2})[a-zA-Z0-9._]{3,24}$/.test(u);
}

function normStr(input: unknown, max = 120): string | null {
  if (typeof input !== "string") return null;
  const s = input.trim().replace(/\s+/g, " ");
  if (!s) return null;
  return s.length > max ? s.slice(0, max) : s;
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
export async function POST(req: NextRequest) {
  const reqId =
    (globalThis as any).crypto?.randomUUID?.() ??
    Math.random().toString(36).slice(2);

  try {
    // --- Auth ---
    const session = await auth().catch(() => null);
    const uid = (session as any)?.user?.id as string | undefined;
    if (!uid) {
      track("profile_setup_unauthorized", { reqId });
      return withReqId(noStore({ error: "Unauthorized" }, { status: 401 }), reqId);
    }

    // --- Rate limit (per IP + user) ---
    const rl = await checkRateLimit(req.headers, {
      name: "profile_setup",
      limit: 12,
      windowMs: 10 * 60_000,
      extraKey: uid,
    });
    if (!rl.ok) {
      const r = tooMany("Too many attempts. Please slow down.", rl.retryAfterSec);
      r.headers.set("x-request-id", reqId);
      return r;
    }

    // --- Content-Type & tiny body-size guard ---
    const ctype = (req.headers.get("content-type") || "").toLowerCase();
    if (!ctype.includes("application/json")) {
      return withReqId(noStore({ error: "Content-Type must be application/json" }, { status: 415 }), reqId);
    }
    const clen = Number(req.headers.get("content-length") || "0");
    if (Number.isFinite(clen) && clen > 32_000) {
      return withReqId(noStore({ error: "Payload too large" }, { status: 413 }), reqId);
    }

    // --- Parse body ---
    const body = (await req.json().catch(() => ({}))) as {
      username?: unknown;
      whatsapp?: unknown;
      city?: unknown;
      country?: unknown;
      postalCode?: unknown;
      address?: unknown;
      name?: unknown;
    };

    const usernameRaw = typeof body.username === "string" ? body.username.trim() : "";

    // Get current profile FIRST so username can be optional
    const current = await prisma.user.findUnique({
      where: { id: uid },
      select: {
        id: true,
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
    if (!current) {
      return withReqId(noStore({ error: "User not found" }, { status: 404 }), reqId);
    }

    track("profile_setup_attempt", {
      reqId,
      userId: uid,
      hasUsername: !!usernameRaw,
      hasWhatsapp: typeof body.whatsapp === "string" && !!body.whatsapp.trim(),
      hasCity: typeof body.city === "string" && !!body.city.trim(),
      hasCountry: typeof body.country === "string" && !!body.country.trim(),
      hasPostal: typeof body.postalCode === "string" && !!body.postalCode.trim(),
      hasAddress: typeof body.address === "string" && !!body.address.trim(),
      hasName: typeof body.name === "string" && !!body.name.trim(),
    });

    // --- Normalize other fields ---
    const whatsapp = normalizeKenyanPhone(typeof body.whatsapp === "string" ? body.whatsapp : null);
    const city = normStr(body.city, 60);
    const country = normStr(body.country, 60);
    const postalCode = normStr(body.postalCode, 20);
    const address = normStr(body.address, 160);
    const name = normStr(body.name, 80);

    // Decide whether we're changing username (optional)
    const wantsUsernameChange = !!usernameRaw && usernameRaw.toLowerCase() !== (current.username || "").toLowerCase();

    // Validate username ONLY if provided and changing
    if (wantsUsernameChange) {
      if (!looksLikeValidUsername(usernameRaw)) {
        track("profile_setup_invalid_username", { reqId, userId: uid, usernameRaw });
        return withReqId(
          noStore(
            { error: "Username must be 3–24 chars (letters, numbers, dot, underscore), no leading/trailing symbol, no repeats." },
            { status: 400 }
          ),
          reqId
        );
      }
      if (RESERVED_USERNAMES.has(usernameRaw.toLowerCase())) {
        track("profile_setup_invalid_username", { reqId, userId: uid, reason: "reserved" });
        return withReqId(noStore({ error: "This username is reserved" }, { status: 400 }), reqId);
      }
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
        return withReqId(noStore({ error: "Username already taken" }, { status: 409 }), reqId);
      }
    }

    // Determine if any actual change
    const noChanges =
      !wantsUsernameChange &&
      (current.name || null) === (name ?? current.name ?? null) &&
      (current.whatsapp || null) === (whatsapp || null) &&
      (current.city || null) === (city || null) &&
      (current.country || null) === (country || null) &&
      (current.postalCode || null) === (postalCode || null) &&
      (current.address || null) === (address || null);

    if (noChanges) {
      track("profile_setup_nop", { reqId, userId: uid });
      return withReqId(
        noStore({
          ok: true,
          user: { ...current },
          profileComplete: true,
        }),
        reqId
      );
    }

    const oldUsername = current.username || null;

    // --- Update ---
    const updated = await prisma.user.update({
      where: { id: uid },
      data: {
        ...(wantsUsernameChange ? { username: usernameRaw } : {}),
        ...(name !== null ? { name } : {}),
        whatsapp: whatsapp || null,
        city,
        country,
        postalCode,
        address,
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

    // Best-effort revalidate any user-profile tagged data + store pages
    try {
      revalidateTag(`user:${uid}:profile`);
      if (oldUsername && oldUsername !== updated.username) {
        revalidatePath(`/store/${oldUsername}`);
      }
      if (updated.username) {
        revalidatePath(`/store/${updated.username}`);
      }
    } catch {
      /* ignore */
    }

    track("profile_setup_success", { reqId, userId: uid });

    const res = noStore({ ok: true, user: updated, profileComplete: true });
    if (updated.username) {
      res.headers.set("Location", `/store/${updated.username}`);
    }
    return withReqId(res, reqId);
  } catch (e: any) {
    if (e?.code === "P2002") {
      track("profile_setup_username_taken", { reqId });
      return withReqId(noStore({ error: "Username already taken" }, { status: 409 }), reqId);
    }
    // eslint-disable-next-line no-console
    console.error("[profile/setup POST] error", e);
    track("profile_setup_error", { reqId, message: e?.message ?? String(e) });
    return withReqId(noStore({ error: "Failed to save profile" }, { status: 500 }), reqId);
  }
}
