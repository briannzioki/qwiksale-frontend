import type { DefaultSession, DefaultUser } from "next-auth";

/** Single source of truth for these unions. */
export type SubscriptionTier = "BASIC" | "GOLD" | "PLATINUM";
export type AppRole = "USER" | "MODERATOR" | "ADMIN" | "SUPERADMIN";

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
      role?: AppRole | string | null;

      /** Convenience flags injected by callbacks */
      isAdmin?: boolean;
      isSuperAdmin?: boolean;
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
    role?: AppRole | string | null;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    /** We store the id internally as `uid`; expose both for DX. */
    uid?: string;
    id?: string;

    email?: string | null;
    username?: string | null;
    subscription?: SubscriptionTier | null;
    role?: AppRole | string | null;

    /** Mirrors the booleans we attach to Session.user */
    isAdmin?: boolean;
    isSuperAdmin?: boolean;

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
