// src/auth.ts
import NextAuth from "next-auth";
import authOptions from "@/auth.config";

/**
 * Single, canonical NextAuth entrypoint for the entire app.
 *
 * Rules:
 * - Do not instantiate NextAuth anywhere else.
 * - All route handlers, middleware, and server code must import { auth } / { handlers } from here.
 * - authOptions (cookies/secret/providers/callbacks) remain defined in src/auth.config.ts only.
 */
export const { handlers, auth, signIn, signOut } = NextAuth(authOptions);
