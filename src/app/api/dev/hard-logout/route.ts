export const preferredRegion = ['fra1'];
// src/app/api/dev/hard-logout/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextResponse } from "next/server";

/* ----------------------------- helpers ----------------------------- */
function noStore(json: unknown, init?: ResponseInit) {
  const res = NextResponse.json(json, init);
  res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
  res.headers.set("Pragma", "no-cache");
  res.headers.set("Expires", "0");
  return res;
}

function clearCookie(
  name: string,
  {
    domain,
    secure,
    path = "/",
    sameSite = "Lax",
  }: { domain?: string; secure?: boolean; path?: string; sameSite?: "Lax" | "Strict" | "None" }
) {
  const expires = "Thu, 01 Jan 1970 00:00:00 GMT";
  const base = [
    `${name}=`,
    `Expires=${expires}`,
    "Max-Age=0",
    `Path=${path}`,
    `SameSite=${sameSite}`,
    secure ? "Secure" : null,
    domain ? `Domain=${domain}` : null,
    // HttpOnly is set on session cookies by NextAuth; include it here to overwrite
    "HttpOnly",
  ]
    .filter(Boolean)
    .join("; ");
  return base;
}

/* --------------------------------- POST --------------------------------- */
export async function POST(req: Request) {
  // Block unless explicitly allowed
  const allow =
    process.env.NODE_ENV !== "production" ||
    process.env["DANGER_ALLOW_HARD_LOGOUT"] === "1";
  if (!allow) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  // Require explicit confirmation to avoid accidental calls (even in dev)
  let body: any = null;
  try {
    body = await req.json();
  } catch {
    // ignore malformed JSON
  }
  const confirmed =
    body?.confirm === true ||
    body?.confirm === "true" ||
    body?.confirm === 1 ||
    body?.confirm === "1";
  if (!confirmed) {
    return noStore({ error: "Missing confirm:true" }, { status: 400 });
  }

  const headers = new Headers();

  // Determine cookie attributes for current environment
  const isProd = process.env.NODE_ENV === "production";
  const secure = isProd; // Secure only in prod
  // If you scope auth cookies to your apex domain in prod, set it here:
  const apexDomain = isProd ? ".qwiksale.sale" : undefined;

  // Canonical NextAuth cookie names (cover both legacy & secure prefixes)
  const sessionCookies = [
    "next-auth.session-token",
    "__Secure-next-auth.session-token",
  ];

  // Ancillary cookies NextAuth may set
  const auxCookies = [
    "next-auth.pkce.code_verifier",
    "next-auth.callback-url",
    "next-auth.csrf-token",
    // Some providers / versions may use these:
    "next-auth.state",
    "__Host-next-auth.csrf-token",
  ];

  // Clear for current host (Path=/)
  for (const n of [...sessionCookies, ...auxCookies]) {
    headers.append(
      "Set-Cookie",
      clearCookie(n, { secure, path: "/", sameSite: "Lax" })
    );
  }

  // Also clear for common auth paths (defensive; harmless if absent)
  for (const n of [...sessionCookies, ...auxCookies]) {
    headers.append(
      "Set-Cookie",
      clearCookie(n, { secure, path: "/api/auth", sameSite: "Lax" })
    );
  }

  // Clear for apex domain (if configured)
  if (apexDomain) {
    for (const n of [...sessionCookies, ...auxCookies]) {
      headers.append(
        "Set-Cookie",
        clearCookie(n, {
          secure,
          path: "/",
          sameSite: "Lax",
          domain: apexDomain,
        })
      );
      headers.append(
        "Set-Cookie",
        clearCookie(n, {
          secure,
          path: "/api/auth",
          sameSite: "Lax",
          domain: apexDomain,
        })
      );
    }
  }

  // No body needed; 204 tells clients “done”
  return new NextResponse(null, { status: 204, headers });
}

/* ---------------------------------- GET --------------------------------- */
export async function GET() {
  return noStore({ error: "Method not allowed" }, { status: 405 });
}
