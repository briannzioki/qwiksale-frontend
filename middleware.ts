// src/middleware.ts
import { NextResponse, type NextRequest } from "next/server";
import { getToken, type JWT } from "next-auth/jwt";

type AppJWT = JWT & {
  phone?: string | null;
  verified?: boolean;
  username?: string | null;
};

const protectedPrefixes = ["/sell"];

export async function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;

  // Only guard the paths we intend to protect
  const isProtected = protectedPrefixes.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`)
  );
  if (!isProtected) return NextResponse.next();

  // Only act on navigations; don’t block non-GET (form posts, etc.)
  if (req.method !== "GET") return NextResponse.next();

  // Read NextAuth JWT (works in Middleware with NEXTAUTH_SECRET)
  const token = (await getToken({
    req,
    secret: process.env.NEXTAUTH_SECRET,
  })) as AppJWT | null;

  // Not signed in → send to /signin and return to original page after login
  if (!token) {
    const loginUrl = new URL("/signin", req.url);
    loginUrl.searchParams.set("callbackUrl", pathname + (search || ""));
    return NextResponse.redirect(loginUrl);
  }

  // Sellers must have BOTH email and phone
  const hasEmail = typeof token.email === "string" && token.email.length > 0;
  const hasPhone = typeof token.phone === "string" && token.phone.length > 0;

  if (!hasEmail || !hasPhone) {
    const completeUrl = new URL("/account/complete-profile", req.url);
    completeUrl.searchParams.set("reason", "missing-contact");
    completeUrl.searchParams.set("return", pathname + (search || ""));
    return NextResponse.redirect(completeUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/sell", "/sell/:path*"],
};
