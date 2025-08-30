import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

const protectedPaths = ["/sell"];

export async function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;

  const shouldProtect = protectedPaths.some(
    (p) => pathname === p || pathname.startsWith(p + "/")
  );
  if (!shouldProtect) return NextResponse.next();

  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });

  // Not signed in -> go to /signin
  if (!token) {
    const url = new URL("/signin", req.url);
    url.searchParams.set("callbackUrl", pathname + search);
    return NextResponse.redirect(url);
  }

  // Signed in but missing profile -> go to onboarding
  const needsProfile = !!(token as any).needsProfile;
  if (needsProfile) {
    const url = new URL("/onboarding", req.url);
    url.searchParams.set("return", pathname + search);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/sell", "/sell/:path*"],
};
