// src/app/api/me/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

import { NextResponse } from "next/server";
import { auth } from "@/auth";
import type { AnyUser } from "@/app/lib/authz";
import { isAdminUser, isSuperAdminUserLocal } from "@/app/lib/authz";

/** Bump when behavior changes for observability */
const VERSION = "me.v10-fast-anon-probe";
const TIMEOUT_MS = 2500;

/**
 * E2E/test flag – we only use this for metadata/headers now.
 * Status codes stay the same in prod and E2E.
 */
const IS_E2E =
  process.env["NEXT_PUBLIC_E2E"] === "1" ||
  process.env["E2E"] === "1" ||
  process.env["PLAYWRIGHT"] === "1" ||
  process.env["VITEST"] === "1";

function baseHeaders(h: Headers = new Headers()) {
  h.set("Cache-Control", "no-store, no-cache, must-revalidate");
  h.set("Pragma", "no-cache");
  h.set("Expires", "0");
  h.set("Vary", "Authorization, Cookie, Accept-Encoding, Origin");
  h.set("X-Me-Version", VERSION);
  h.set("X-Content-Type-Options", "nosniff");
  h.set("Referrer-Policy", "no-referrer");
  h.set("Allow", "GET,HEAD,OPTIONS");
  if (IS_E2E) h.set("X-Me-Env", "e2e");
  return h;
}

function noStore(json: unknown, init?: ResponseInit) {
  const res = NextResponse.json(json, init);
  baseHeaders(res.headers);
  return res;
}

type MinimalUser = {
  id: string | null;
  email: string | null;
  username: string | null;
  image: string | null;
  role: string | null;
  isAdmin: boolean;
  isSuperAdmin: boolean;
};

function makeEmptyUser(): MinimalUser {
  return {
    id: null,
    email: null,
    username: null,
    image: null,
    role: null,
    isAdmin: false,
    isSuperAdmin: false,
  };
}

/**
 * Derive a non-null identifier for an authenticated user.
 * This ensures json.id is always truthy for real sessions.
 */
function deriveUserId(anyUser: AnyUser): string {
  if ((anyUser as any)?.id != null) return String((anyUser as any).id);
  if (anyUser.email) return `email:${anyUser.email}`;
  return "session";
}

/**
 * Cheap “does this request even look authenticated?” probe.
 * If false, we return 401 immediately without calling auth().
 */
const SESSION_COOKIE_MARKERS = [
  // Auth.js (v5) common names
  "authjs.session-token=",
  "__Secure-authjs.session-token=",
  "__Host-authjs.session-token=",

  // NextAuth legacy names (some setups still emit these)
  "next-auth.session-token=",
  "__Secure-next-auth.session-token=",
  "__Host-next-auth.session-token=",
] as const;

function looksAuthenticated(req: Request): boolean {
  const authz = req.headers.get("authorization");
  if (authz && authz.trim()) return true;

  const cookie = req.headers.get("cookie") || "";
  if (!cookie) return false;

  return SESSION_COOKIE_MARKERS.some((m) => cookie.includes(m));
}

/**
 * Run auth() with an upper bound so this endpoint never stalls forever.
 */
async function authWithTimeout(
  ms: number,
): Promise<"timeout" | AnyUser | null> {
  try {
    const winner = await Promise.race([
      auth()
        .then((s: unknown) => {
          const rawUser = (s as any)?.user ?? null;
          if (!rawUser) return null;

          const u: AnyUser = {
            email: rawUser.email ?? null,
            role: rawUser.role ?? null,
            roles: (rawUser as any)?.roles ?? null,
            isAdmin: (rawUser as any)?.isAdmin ?? null,
          };

          if (rawUser.id !== undefined && rawUser.id !== null) {
            (u as any).id = String(rawUser.id);
          }

          // If you ever add username/image to session.user, this will flow through.
          (u as any).username = (rawUser as any)?.username ?? null;
          (u as any).image = (rawUser as any)?.image ?? null;

          return u;
        })
        .catch(() => null),
      new Promise<"timeout">((resolve) =>
        setTimeout(() => resolve("timeout"), ms),
      ),
    ]);

    return winner as "timeout" | AnyUser | null;
  } catch {
    return null;
  }
}

/** Fast probe used by tests and client boot; never blocks longer than TIMEOUT_MS. */
export async function GET(req: Request) {
  // 🔥 Fast-path for anonymous users: no session cookie and no auth header → instant 401.
  if (!looksAuthenticated(req)) {
    const res = noStore(
      {
        user: null,
        meta: { env: IS_E2E ? "e2e" : "prod", probe: "cookie_absent" },
      },
      { status: 401 },
    );
    res.headers.set("X-Me-Probe", "cookie_absent");
    return res;
  }

  const u = await authWithTimeout(TIMEOUT_MS);

  // If auth() effectively hung, surface that as a 503, not "logged in".
  if (u === "timeout") {
    const empty = makeEmptyUser();
    const res = noStore(
      {
        ...empty,
        user: null,
        meta: { env: IS_E2E ? "e2e" : "prod", fallback: "auth_timeout" },
      },
      { status: 503 },
    );
    res.headers.set("X-Me-Fallback", "auth_timeout");
    return res;
  }

  // No session → 401, both in prod and E2E.
  if (!u) {
    return noStore(
      {
        user: null,
        meta: { env: IS_E2E ? "e2e" : "prod", probe: "auth_null" },
      },
      { status: 401 },
    );
  }

  // Authenticated user → 200 with root-level id + nested user.
  const anyUser: AnyUser = u;
  const isSuperAdmin = isSuperAdminUserLocal(anyUser);
  const isAdmin = isAdminUser(anyUser);

  const minimal: MinimalUser = {
    id: deriveUserId(anyUser),
    email: anyUser.email ?? null,
    username: (anyUser as any)?.username ?? null,
    image: (anyUser as any)?.image ?? null,
    role: anyUser.role ?? null,
    isAdmin,
    isSuperAdmin,
  };

  return noStore(
    {
      ...minimal,
      user: minimal,
      meta: { env: IS_E2E ? "e2e" : "prod" },
    },
    { status: 200 },
  );
}

export async function HEAD() {
  return new Response(null, { status: 200, headers: baseHeaders() });
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: baseHeaders() });
}
