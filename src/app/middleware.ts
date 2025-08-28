// src/middleware.ts
// Uses NextAuth's built-in middleware to require auth on matched routes.
// If no session token, users are redirected to the NextAuth sign-in page
// (or the custom page you set in authOptions.pages.signIn).

export { default } from "next-auth/middleware";

export const config = {
  matcher: [
    // your original protected areas
    "/dashboard/:path*",
    "/sell/:path*",

    // sensible additions you can keep or remove
    "/settings/:path*",        // account/settings
    // "/api/billing/:path*",   // uncomment if you want API billing endpoints protected by session
  ],
};
