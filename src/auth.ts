// src/auth.ts
import NextAuth from "next-auth";
import { authOptions as baseAuthOptions } from "@/auth.config";

/**
 * Debug safety:
 * - OFF by default (including tests).
 * - Only ON when explicitly requested in development.
 * - NEVER ON for E2E/Playwright runs unless you explicitly change this gate.
 */
const IS_E2E =
  process.env["NEXT_PUBLIC_E2E"] === "1" ||
  process.env["E2E"] === "1" ||
  process.env["PLAYWRIGHT"] === "1" ||
  process.env["VITEST"] === "1";

const allowDebug =
  process.env.NODE_ENV === "development" &&
  !IS_E2E &&
  (process.env["NEXTAUTH_DEBUG"] === "1" ||
    process.env["AUTH_DEBUG"] === "1" ||
    process.env["NEXT_PUBLIC_AUTH_DEBUG"] === "1");

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...baseAuthOptions,
  debug: allowDebug,
});
