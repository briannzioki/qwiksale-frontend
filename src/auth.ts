// src/auth.ts
import NextAuth from "next-auth";
import { getServerSession } from "next-auth";
import authOptions from "@/app/api/auth/[...nextauth]/authOptions";

/** Server-side session helper (v4-compatible) */
export async function auth() {
  return getServerSession(authOptions);
}

/** Route handlers for [...nextauth]/route.ts */
const handler = NextAuth(authOptions);
export { handler as GET, handler as POST };

/** (Optional) client helpers for sign-in/out in Client Components */
export { signIn, signOut } from "next-auth/react";
