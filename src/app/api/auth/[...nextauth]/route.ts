// src/app/api/auth/[...nextauth]/route.ts
import NextAuth from "next-auth";
import { authOptions } from "./authOptions";

/**
 * NextAuth API Route Handler
 * - Supports both GET and POST (required for Next.js App Router)
 * - Uses our hardened `authOptions` (see authOptions.ts)
 */
const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };
