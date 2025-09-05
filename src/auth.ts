// src/auth.ts
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/authOptions";

/** Server-side session helper */
export async function auth() {
  return getServerSession(authOptions);
}
export type Session = Awaited<ReturnType<typeof auth>>;

/** Client helpers (used by src/app/lib/auth.ts) */
export { signIn, signOut } from "next-auth/react";
