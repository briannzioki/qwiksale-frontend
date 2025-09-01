import { withAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";

export default withAuth(
  function middleware(req) {
    // If you didn't use next.config redirects, uncomment this:
    // const host = req.headers.get("host");
    // if (host?.startsWith("www.")) {
    //   const url = req.nextUrl.clone();
    //   url.host = host.replace(/^www\./, "");
    //   return NextResponse.redirect(url, 308);
    // }

    return NextResponse.next();
  },
  {
    callbacks: {
      /**
       * Only require auth on protected routes.
       * DO NOT redirect to /account/complete-profile here (that caused the loop).
       */
      authorized: ({ token, req }) => {
        const p = req.nextUrl.pathname;

        // Public paths:
        const isPublic =
          p === "/" ||
          p.startsWith("/signin") ||
          p.startsWith("/auth") ||
          p.startsWith("/api/auth") ||
          p.startsWith("/_next") ||
          p.startsWith("/favicon") ||
          p.startsWith("/robots.txt") ||
          p.startsWith("/sitemap.xml");

        if (isPublic) return true;

        // Protected paths:
        if (p.startsWith("/sell") || p.startsWith("/account")) {
          return !!token; // must be logged in
        }

        return true;
      },
    },
  }
);

// Match everything except _next/static etc. (be conservative)
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|api/auth).*)"],
};
