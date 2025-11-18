// src/app/api/admin/_lib/guard.ts
import { NextResponse } from "next/server";
import { getSessionUser, isAdminUser } from "@/app/lib/authz";

/**
 * Central admin guard for admin-only API routes.
 *
 * - Uses getSessionUser() + isAdminUser(...) from authz.ts
 * - No inline env parsing or role drift.
 *
 * Returns:
 *   - `null` when authorized (caller continues)
 *   - NextResponse JSON 401/403 when blocked
 */
export async function assertAdmin() {
  const user = await getSessionUser();

  if (!user?.id) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 }
    );
  }

  if (!isAdminUser(user)) {
    return NextResponse.json(
      { error: "Forbidden" },
      { status: 403 }
    );
  }

  return null;
}
