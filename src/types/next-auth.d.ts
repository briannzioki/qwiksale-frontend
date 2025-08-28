// src/types/next-auth.d.ts
import type { SubscriptionTier } from "@prisma/client";
import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  // What your client code sees via `useSession()` / `getServerSession()`
  interface Session {
    user: {
      id: string;
      subscription: SubscriptionTier; // "FREE" | "GOLD" | "PLATINUM" (from Prisma)
    } & DefaultSession["user"]; // name, email, image
  }

  // What NextAuth stores for the user (adapter-backed)
  interface User {
    id: string;
    subscription: SubscriptionTier;
    name?: string | null;
    email?: string | null;
    image?: string | null;
  }
}

// Optional: JWT typing (useful even if session strategy = "database")
declare module "next-auth/jwt" {
  interface JWT {
    id?: string;
    subscription?: SubscriptionTier;
  }
}

