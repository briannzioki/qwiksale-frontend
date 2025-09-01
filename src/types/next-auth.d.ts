// src/types/next-auth.d.ts
import { DefaultSession, DefaultUser } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      username?: string | null;
      image?: string | null;
      subscription?: "FREE" | "GOLD" | "PLATINUM" | "BASIC" | null;
    } & DefaultSession["user"];
    verified?: boolean;
    whatsapp?: string | null;
    address?: string | null;
    postalCode?: string | null;
    city?: string | null;
    country?: string | null;
    needsProfile?: boolean;
  }

  interface User extends DefaultUser {
    username?: string | null;
    subscription?: "FREE" | "GOLD" | "PLATINUM" | "BASIC" | null;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    uid?: string;
    username?: string | null;
    subscription?: "FREE" | "GOLD" | "PLATINUM" | "BASIC" | null;
    verified?: boolean;
    whatsapp?: string | null;
    address?: string | null;
    postalCode?: string | null;
    city?: string | null;
    country?: string | null;
    needsProfile?: boolean;
  }
}
