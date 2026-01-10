import "server-only";

import type { NextRequest } from "next/server";
import { handlers } from "@/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

function mergeVary(current: string | null, add: string): string {
  const set = new Set<string>();
  for (const part of String(current || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)) {
    set.add(part);
  }
  for (const part of String(add || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)) {
    set.add(part);
  }
  return Array.from(set).join(", ");
}

function withNoStore(res: Response): Response {
  try {
    res.headers.set("Cache-Control", "no-store");
    res.headers.set("Pragma", "no-cache");
    res.headers.set("Expires", "0");
    res.headers.set("Vary", mergeVary(res.headers.get("Vary"), "Cookie"));
    return res;
  } catch {
    return res;
  }
}

export async function GET(req: NextRequest) {
  return withNoStore(await handlers.GET(req));
}

export async function POST(req: NextRequest) {
  return withNoStore(await handlers.POST(req));
}
