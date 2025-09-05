// src/app/api/dev/hard-logout/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextResponse } from "next/server";

function noStore(json: unknown, init?: ResponseInit) {
  const res = NextResponse.json(json, init);
  res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
  res.headers.set("Pragma", "no-cache");
  res.headers.set("Expires", "0");
  return res;
}

export async function POST(req: Request) {
  // Block unless explicitly allowed
  const allow =
    process.env.NODE_ENV !== "production" ||
    process.env.DANGER_ALLOW_HARD_LOGOUT === "1";
  if (!allow) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  // Require explicit confirmation to avoid accidental calls (even in dev)
  let body: any = null;
  try {
    body = await req.json();
  } catch {
    // ignore
  }
  const confirmed = body?.confirm === true || body?.confirm === "true";
  if (!confirmed) {
    return noStore({ error: "Missing confirm:true" }, { status: 400 });
  }

  const headers = new Headers();
  const expires = "Thu, 01 Jan 1970 00:00:00 GMT";
  const baseAttrs = "Path=/; HttpOnly; SameSite=Lax";
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";

  const names = [
    "next-auth.session-token",
    "__Secure-next-auth.session-token",
  ];

  // clear for current host
  for (const n of names) {
    headers.append(
      "Set-Cookie",
      `${n}=; Expires=${expires}; Max-Age=0; ${baseAttrs}${secure}`
    );
  }

  // clear for apex domain (your prod cookie scope)
  const domain =
    process.env.NODE_ENV === "production" ? ".qwiksale.sale" : "";
  if (domain) {
    for (const n of names) {
      headers.append(
        "Set-Cookie",
        `${n}=; Expires=${expires}; Max-Age=0; ${baseAttrs}${secure}; Domain=${domain}`
      );
    }
  }

  // also clear the NextAuth PKCE/check cookies (harmless if absent)
  const auxNames = [
    "next-auth.pkce.code_verifier",
    "next-auth.callback-url",
    "next-auth.csrf-token",
  ];
  for (const n of auxNames) {
    headers.append(
      "Set-Cookie",
      `${n}=; Expires=${expires}; Max-Age=0; Path=/; SameSite=Lax${secure}`
    );
    if (domain) {
      headers.append(
        "Set-Cookie",
        `${n}=; Expires=${expires}; Max-Age=0; Path=/; SameSite=Lax${secure}; Domain=${domain}`
      );
    }
  }

  return new NextResponse(null, { status: 204, headers });
}

export async function GET() {
  return noStore({ error: "Method not allowed" }, { status: 405 });
}
