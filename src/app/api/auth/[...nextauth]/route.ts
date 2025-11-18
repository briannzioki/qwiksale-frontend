// src/app/api/auth/[...nextauth]/route.ts
import "server-only";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { handlers } from "@/auth";

export const { GET, POST } = handlers;
