// src/types/next-auth.d.ts
import type { DefaultSession, DefaultUser } from "next-auth";

/** Single source of truth for these unions. */
export type SubscriptionTier = "BASIC" | "GOLD" | "PLATINUM";
export type Role = "USER" | "MODERATOR" | "ADMIN";

declare module "next-auth" {
  interface Session {
    /** next-auth always has this; re-state to satisfy strict TS in consumers */
    expires: string;

    user: DefaultSession["user"] & {
      /** Always prefer string id on sessions */
      id: string;
      username?: string | null;
      image?: string | null;
      subscription?: SubscriptionTier | null;
      role?: Role | string | null;
    };

    /** Optional profile/verification fields added by callbacks as needed */
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
    subscription?: SubscriptionTier | null;
    role?: Role | string | null;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    /** Mirror Session.user.id; keep the name `id` (not `uid`) */
    id?: string;

    username?: string | null;
    subscription?: SubscriptionTier | null;
    role?: Role | string | null;

    verified?: boolean;
    whatsapp?: string | null;
    address?: string | null;
    postalCode?: string | null;
    city?: string | null;
    country?: string | null;
    needsProfile?: boolean;
  }
}

/** Make this file a module so augmentation is applied reliably. */
export {};
