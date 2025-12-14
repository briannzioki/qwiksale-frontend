// src/app/api/auth/[...nextauth]/route.ts
import "server-only";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { handlers } from "@/auth";

/**
 * This route handler:
 * - Normalizes action casing (signIn -> signin) and provider casing (Google -> google)
 *   for signin/callback routes.
 * - Adds OPTIONAL dev-only logging when explicitly enabled.
 * - Implements HEAD so curl -I doesn't produce confusing 400s.
 * - Forces no-store headers (auth endpoints must never be cached).
 *
 * Debug safety:
 * - OFF by default.
 * - Only enabled when NODE_ENV=development AND AUTH_ROUTE_DEBUG=1 (or NEXTAUTH_DEBUG=1).
 */

const PREFIX = "/api/auth/";
const ACTIONS_WITH_PROVIDER = new Set(["signin", "callback"]);

const AUTH_ROUTE_DEBUG =
  process.env.NODE_ENV === "development" &&
  (process.env["AUTH_ROUTE_DEBUG"] === "1" || process.env["NEXTAUTH_DEBUG"] === "1");

const SENSITIVE_QS_KEYS = new Set(
  [
    "code",
    "state",
    "token",
    "access_token",
    "refresh_token",
    "id_token",
    "client_secret",
    "secret",
    "csrftoken",
    "csrf",
  ].map((s) => s.toLowerCase()),
);

function setNoStore(res: Response) {
  try {
    res.headers.set("Cache-Control", "no-store");
    res.headers.set("Pragma", "no-cache");
    res.headers.set("Expires", "0");
  } catch {
    // ignore
  }
  return res;
}

function scrubQuery(search: string) {
  if (!search) return "";
  try {
    const sp = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
    for (const k of Array.from(sp.keys())) {
      if (SENSITIVE_QS_KEYS.has(k.toLowerCase())) sp.set(k, "***");
    }
    const s = sp.toString();
    return s ? `?${s}` : "";
  } catch {
    return "";
  }
}

function scrubUrlLike(input: string) {
  if (!input) return "";
  try {
    // If it's a full URL, scrub its query; else treat it as a path+query.
    if (/^https?:\/\//i.test(input)) {
      const u = new URL(input);
      u.search = scrubQuery(u.search);
      return u.toString();
    }
    const [path, q = ""] = input.split("?");
    return `${path}${scrubQuery(q ? `?${q}` : "")}`;
  } catch {
    return input;
  }
}

function normalizeAuthPathname(pathname: string): { pathname: string; changed: boolean } {
  if (!pathname.startsWith(PREFIX)) return { pathname, changed: false };

  const rest = pathname.slice(PREFIX.length); // e.g. "signIn/google"
  if (!rest) return { pathname, changed: false };

  const parts = rest.split("/");
  const action = parts[0] || "";
  if (!action) return { pathname, changed: false };

  let changed = false;

  const normalizedAction = action.toLowerCase();
  if (normalizedAction !== action) {
    parts[0] = normalizedAction;
    changed = true;
  }

  if (ACTIONS_WITH_PROVIDER.has(normalizedAction)) {
    const provider = parts[1] || "";
    if (provider) {
      const normalizedProvider = provider.toLowerCase();
      if (normalizedProvider !== provider) {
        parts[1] = normalizedProvider;
        changed = true;
      }
    }
  }

  if (!changed) return { pathname, changed: false };
  return { pathname: PREFIX + parts.join("/"), changed: true };
}

function dbgWarn(...args: any[]) {
  if (!AUTH_ROUTE_DEBUG) return;
  // eslint-disable-next-line no-console
  console.warn(...args);
}

function dbgError(...args: any[]) {
  if (!AUTH_ROUTE_DEBUG) return;
  // eslint-disable-next-line no-console
  console.error(...args);
}

function describeReq(req: NextRequest) {
  const url = scrubUrlLike(`${req.nextUrl.pathname}${req.nextUrl.search}`);
  const referer = scrubUrlLike(req.headers.get("referer") ?? "");
  const ua = (req.headers.get("user-agent") ?? "").slice(0, 200);
  return { url, referer, ua };
}

function maybeRedirectToNormalized(req: NextRequest): Response | null {
  try {
    const { pathname, changed } = normalizeAuthPathname(req.nextUrl.pathname);
    if (!changed) return null;

    if (AUTH_ROUTE_DEBUG) {
      const from = scrubUrlLike(`${req.nextUrl.pathname}${req.nextUrl.search}`);
      const to = scrubUrlLike(`${pathname}${req.nextUrl.search}`);
      dbgWarn(`[auth] normalized: ${req.method} ${from} -> ${to}`);
    }

    const url = req.nextUrl.clone();
    url.pathname = pathname;
    return setNoStore(NextResponse.redirect(url, 307));
  } catch {
    return null;
  }
}

async function runAuth(req: NextRequest, method: "GET" | "POST") {
  const redirect = maybeRedirectToNormalized(req);
  if (redirect) return redirect;

  try {
    const res = method === "GET" ? await handlers.GET(req) : await handlers.POST(req);
    return setNoStore(res);
  } catch (err) {
    if (AUTH_ROUTE_DEBUG) {
      const { url, referer, ua } = describeReq(req);

      const e = err as any;
      dbgError(
        `[auth] handler threw (${method}) url=${url}` +
          (referer ? ` referer=${referer}` : "") +
          (ua ? ` ua=${ua}` : ""),
      );
      dbgError(`[auth] err.name=${String(e?.name ?? "")}`);
      dbgError(`[auth] err.message=${String(e?.message ?? "")}`);
      if (typeof e?.stack === "string") dbgError(e.stack);
      if (e?.cause) dbgError("[auth] err.cause:", e.cause);

      // Last-resort recovery: if normalization *would* change path, redirect there.
      try {
        const { pathname, changed } = normalizeAuthPathname(req.nextUrl.pathname);
        if (changed) {
          dbgWarn(
            `[auth] recovery redirect -> ${scrubUrlLike(`${pathname}${req.nextUrl.search}`)}`,
          );
          const u = req.nextUrl.clone();
          u.pathname = pathname;
          return setNoStore(NextResponse.redirect(u, 307));
        }
      } catch {
        // ignore
      }
    }

    throw err;
  }
}

export async function GET(req: NextRequest) {
  return runAuth(req, "GET");
}

export async function POST(req: NextRequest) {
  return runAuth(req, "POST");
}

/**
 * Make curl -I usable (HEAD). We mirror GET status+headers but no body.
 */
export async function HEAD(req: NextRequest) {
  const res = await runAuth(req, "GET");
  setNoStore(res);
  return new Response(null, {
    status: res.status,
    headers: new Headers(res.headers),
  });
}
