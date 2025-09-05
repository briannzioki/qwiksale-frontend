// middleware.ts
import { withAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";

/**
 * Protect only /sell and /account paths.
 * Public pages (/, /signin, /api/search, etc.) bypass middleware entirely.
 */
export default withAuth(
  function middleware(_req) {
    return NextResponse.next();
  },
  {
    callbacks: {
      authorized: ({ token }) => !!token, // must be logged in on matched routes
    },
  }
);

// Run middleware only on these routes:
export const config = {
  matcher: ["/sell/:path*", "/account/:path*"],
};

/**
 * NOTE:
 * - Do NOT redirect to /account/complete-profile here (causes loops).
 * - If you still want www→apex, do it in Vercel → Settings → Redirects, e.g.:
 *   Source: https://www.qwiksale.sale/(.*)
 *   Dest:   https://qwiksale.sale/$1
 *   Code:   308
 */
