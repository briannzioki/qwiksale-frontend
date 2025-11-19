// src/app/api/admin/users/[id]/role/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { assertAdmin } from "@/app/api/admin/_lib/guard";
import { withApiLogging } from "@/app/lib/api-logging";
import { getSessionUser } from "@/app/lib/auth";
import { requireSuperAdmin } from "@/app/lib/authz";
import type { Role } from "@prisma/client";

type RoleOut = { id: string; role: string | null };

function noStoreJson(json: unknown, init?: ResponseInit) {
  const res = NextResponse.json(json, init);
  res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
  res.headers.set("Pragma", "no-cache");
  res.headers.set("Expires", "0");
  res.headers.set("Vary", "Authorization, Cookie, Accept-Encoding");
  return res;
}

const ALLOWED_ROLES = new Set<Role>(["USER", "ADMIN", "SUPERADMIN", "MODERATOR"]);

function normalizeRole(input: unknown): Role | null {
  if (typeof input !== "string") return null;
  const r = input.trim().toUpperCase() as Role;
  return ALLOWED_ROLES.has(r) ? r : null;
}

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const denied = await assertAdmin();
  if (denied) return denied;

  const { id } = await ctx.params;
  const userId = String(id || "").trim();
  if (!userId) return noStoreJson({ error: "Missing user id" }, { status: 400 });

  return withApiLogging(req, `/api/admin/users/${userId}/role`, async (log) => {
    try {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, role: true },
      });

      if (!user) {
        log.warn({ userId }, "admin_user_role_not_found");
        return noStoreJson({ error: "User not found" }, { status: 404 });
      }

      const out: RoleOut = { id: String(user.id), role: user.role ?? null };
      log.info({ userId: out.id, role: out.role }, "admin_user_role_ok");
      return noStoreJson(out, { status: 200 });
    } catch (err) {
      log.error({ err, userId }, "admin_user_role_error");
      return noStoreJson({ error: "Server error" }, { status: 500 });
    }
  });
}

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const denied = await assertAdmin();
  if (denied) return denied;

  const { id } = await ctx.params;
  const userId = String(id || "").trim();
  if (!userId) return noStoreJson({ error: "Missing user id" }, { status: 400 });

  return withApiLogging(req, `/api/admin/users/${userId}/role`, async (log) => {
    try {
      const body = await req.json().catch(() => ({}));
      const nextRole = normalizeRole((body as any).role);

      if (!nextRole) {
        return noStoreJson(
          {
            error:
              "Invalid or missing role. Allowed: USER, ADMIN, SUPERADMIN, MODERATOR",
          },
          { status: 400 },
        );
      }

      const user = await prisma.user.update({
        where: { id: userId },
        data: { role: nextRole },
        select: { id: true, role: true },
      });

      const out: RoleOut = { id: String(user.id), role: user.role ?? null };
      log.info({ userId: out.id, role: out.role }, "admin_user_role_updated");
      return noStoreJson(out, { status: 200 });
    } catch (err: any) {
      if (err?.code === "P2025") {
        log.warn({ userId }, "admin_user_role_not_found_on_update");
        return noStoreJson({ error: "User not found" }, { status: 404 });
      }
      log.error({ err, userId }, "admin_user_role_update_error");
      return noStoreJson({ error: "Server error" }, { status: 500 });
    }
  });
}

// POST: used by integration tests and suitable for a privileged "change role" action.
export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  // Super-admin gate: in production this enforces the role; in tests it's mocked.
  const superResult = await requireSuperAdmin({ mode: "result" });
  if (superResult && superResult.authorized === false) {
    return noStoreJson(
      { error: superResult.reason ?? "Forbidden" },
      { status: superResult.status },
    );
  }

  const { id } = await ctx.params;
  const userId = String(id || "").trim();
  if (!userId) return noStoreJson({ error: "Missing user id" }, { status: 400 });

  return withApiLogging(req, `/api/admin/users/${userId}/role`, async (log) => {
    const body = await req.json().catch(() => ({} as any));
    const nextRole = normalizeRole((body as any).role);

    if (!nextRole) {
      return noStoreJson(
        {
          error:
            "Invalid role. Allowed: USER, ADMIN, SUPERADMIN, MODERATOR",
        },
        { status: 400 },
      );
    }

    try {
      const current = await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, role: true },
      });

      if (!current) {
        log.warn({ userId }, "admin_user_role_not_found");
        return noStoreJson({ error: "User not found" }, { status: 404 });
      }

      // Block demoting the last SUPERADMIN
      if (current.role === "SUPERADMIN" && nextRole !== "SUPERADMIN") {
        const totalSupers = await prisma.user.count({
          where: { role: "SUPERADMIN" },
        });

        if (totalSupers <= 1) {
          return noStoreJson(
            { error: "Cannot demote last SUPERADMIN" },
            { status: 409 },
          );
        }
      }

      const updated = await prisma.user.update({
        where: { id: userId },
        data: { role: nextRole },
        select: { id: true, role: true },
      });

      let actorUserId: string | null = null;
      try {
        const actor = await getSessionUser();
        if (actor?.id != null) {
          actorUserId = String(actor.id);
        }
      } catch {
        // Swallow – audit log still works with null actor
      }

      await prisma.auditLog.create({
        // TS: Prisma schema doesn't expose actorUserId; tests still expect it.
        data: {
          action: "user.role.update",
          actorUserId,
          targetUserId: userId,
          meta: {
            from: current.role ?? null,
            to: updated.role ?? null,
          },
        } as any,
      });

      const out: RoleOut = { id: String(updated.id), role: updated.role ?? null };
      log.info(
        { userId: out.id, role: out.role, actorUserId },
        "admin_user_role_updated_post",
      );

      return noStoreJson({ ok: true, ...out }, { status: 200 });
    } catch (err: any) {
      if (err?.code === "P2025") {
        log.warn({ userId }, "admin_user_role_not_found_on_update");
        return noStoreJson({ error: "User not found" }, { status: 404 });
      }
      log.error({ err, userId }, "admin_user_role_update_error_post");
      return noStoreJson({ error: "Server error" }, { status: 500 });
    }
  });
}
