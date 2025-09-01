// src/types/next-auth.d.ts
import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      subscription?: "BASIC" | "GOLD" | "PLATINUM" | "FREE" | null;
    } & DefaultSession["user"];
  }

  interface User {
    id: string;
    subscription?: "BASIC" | "GOLD" | "PLATINUM" | "FREE" | null;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string;
    subscription?: "BASIC" | "GOLD" | "PLATINUM" | "FREE" | null;
  }
}

// Make this file a module (required for module augmentation to be picked up)
export {};
