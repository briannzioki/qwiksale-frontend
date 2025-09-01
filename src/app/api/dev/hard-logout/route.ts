// src/app/api/dev/hard-logout/route.ts
export const runtime = "nodejs";
import { NextResponse } from "next/server";

export async function POST() {
  // Block unless explicitly allowed
  const allow =
    process.env.NODE_ENV !== "production" ||
    process.env.DANGER_ALLOW_HARD_LOGOUT === "1";
  if (!allow) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  const headers = new Headers();

  // Expire both cookie names & both domain variants
  const expires = "Thu, 01 Jan 1970 00:00:00 GMT";
  const baseAttrs = "Path=/; HttpOnly; SameSite=Lax";
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";

  const names = [
    "next-auth.session-token",
    "__Secure-next-auth.session-token",
  ];

  // no domain
  for (const n of names) {
    headers.append(
      "Set-Cookie",
      `${n}=; Expires=${expires}; Max-Age=0; ${baseAttrs}${secure}`
    );
  }

  // prod domain (if you set one)
  const domain = process.env.NODE_ENV === "production" ? ".qwiksale.sale" : "";
  if (domain) {
    for (const n of names) {
      headers.append(
        "Set-Cookie",
        `${n}=; Expires=${expires}; Max-Age=0; ${baseAttrs}${secure}; Domain=${domain}`
      );
    }
  }

  return new NextResponse(null, { status: 204, headers });
}
