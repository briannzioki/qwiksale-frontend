// src/app/api/admin/_lib/guard.ts
import { NextResponse } from "next/server";
import { isAdminUser } from "@/app/lib/authz";

/**
 * API guard that returns 403 JSON if the current session is not admin (based on
 * env allowlist + DB role via authz.ts).
 */
export async function assertAdmin() {
  const ok = await isAdminUser();
  if (!ok) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return null;
}
