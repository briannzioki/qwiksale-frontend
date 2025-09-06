// src/types/next-auth.d.ts
import type { DefaultSession, DefaultUser } from "next-auth";

/**
 * Central place to define what we attach to the NextAuth session/JWT.
 * Make sure this file is included by TypeScript (tsconfig `include` should
 * contain "src/types" or a glob that matches this file).
 */

declare module "next-auth" {
  /** Align with what your app actually uses on `session.user` */
  interface Session {
    user: {
      id: string;
      /** Marketing/UX sometimes calls this "FREE"; app logic treats it like BASIC */
      subscription?: "BASIC" | "GOLD" | "PLATINUM" | "FREE" | null;
      /** Optional profile fields you may be exposing in the session */
      username?: string | null;
      image?: string | null;
    } & DefaultSession["user"];
  }

  /** What your `User` model returns from the adapter/DB */
  interface User extends DefaultUser {
    id: string;
    subscription?: "BASIC" | "GOLD" | "PLATINUM" | "FREE" | null;
    username?: string | null;
  }
}

declare module "next-auth/jwt" {
  /** Values that are persisted in the encrypted JWT token/callbacks */
  interface JWT {
    id?: string;
    subscription?: "BASIC" | "GOLD" | "PLATINUM" | "FREE" | null;
    username?: string | null;
  }
}

/** Required so this file is treated as a module and augmentation is applied */
export {};
