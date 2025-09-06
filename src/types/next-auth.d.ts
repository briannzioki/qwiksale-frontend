// src/types/next-auth.d.ts
import type { DefaultSession, DefaultUser } from "next-auth";

/** Keep these unions in one place so they never drift. */
type SubscriptionTier = "FREE" | "GOLD" | "PLATINUM" | "BASIC";

declare module "next-auth" {
  interface Session {
    user: {
      /** Always prefer `id` (string) on the session's user object */
      id: string;
      username?: string | null;
      image?: string | null;
      subscription?: SubscriptionTier | null;
    } & DefaultSession["user"];

    /** Optional profile/verification fields included in your callbacks */
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
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    /** Mirror `Session.user.id`; keep name stable (`id`) to avoid confusion */
    id?: string;

    username?: string | null;
    subscription?: SubscriptionTier | null;

    verified?: boolean;
    whatsapp?: string | null;
    address?: string | null;
    postalCode?: string | null;
    city?: string | null;
    country?: string | null;
    needsProfile?: boolean;
  }
}

/** Important: make this file a module so augmentation is applied */
export {};
