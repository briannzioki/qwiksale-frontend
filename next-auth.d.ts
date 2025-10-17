import { DefaultSession } from "next-auth";

declare module "next-auth" {
  type SubscriptionTier = "BASIC" | "GOLD" | "PLATINUM";
  type Role = "USER" | "MODERATOR" | "ADMIN";

  interface Session {
    user: DefaultSession["user"] & {
      id: string;
      username?: string | null;
      role?: Role | null;
      subscription?: SubscriptionTier | null;
      isAdmin?: boolean;
    };
  }

  interface User {
    id: string;
    username?: string | null;
    role?: Role | null;
    subscription?: SubscriptionTier | null;
  }
}

declare module "next-auth/jwt" {
  type SubscriptionTier = "BASIC" | "GOLD" | "PLATINUM";
  type Role = "USER" | "MODERATOR" | "ADMIN";

  interface JWT {
    id?: string;
    username?: string | null;
    role?: Role | null;
    subscription?: SubscriptionTier | null;
  }
}
