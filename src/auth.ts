// src/auth.ts
import NextAuth from "next-auth";
import { authOptions } from "@/auth.config";

export const { handlers, auth, signIn, signOut } = NextAuth(authOptions);
