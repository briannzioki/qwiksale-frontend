// src/types/next-auth.d.ts
import type { DefaultSession, DefaultUser } from "next-auth";

export type SubscriptionTier = "BASIC" | "GOLD" | "PLATINUM";
export type AppRole = "USER" | "MODERATOR" | "ADMIN" | "SUPERADMIN";

declare module "next-auth" {
  interface Session {
    expires: string;
    user: DefaultSession["user"] & {
      id: string;
      username?: string | null;
      image?: string | null;
      subscription?: SubscriptionTier | null;
      role?: AppRole | string | null;
      isAdmin?: boolean;
      isSuperAdmin?: boolean;
      referralCode?: string | null;
    };
  }

  interface User extends DefaultUser {
    username?: string | null;
    subscription?: SubscriptionTier | null;
    role?: AppRole | string | null;
    referralCode?: string | null;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    uid?: string;
    id?: string;
    email?: string | null;
    username?: string | null;
    subscription?: SubscriptionTier | null;
    role?: AppRole | string | null;
    isAdmin?: boolean;
    isSuperAdmin?: boolean;
    referralCode?: string | null;
  }
}

export {};
