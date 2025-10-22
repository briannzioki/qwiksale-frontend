export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { requireSuperAdmin } from "@/app/lib/authz";
import { getSessionUser } from "@/app/lib/auth";
import * as Sentry from "@sentry/nextjs";

type RouteParams = { id: string };

const NO_STORE = { "Cache-Control": "no-store" };

/**
 * POST /api/admin/users/:id/role
 * Body: { role: "USER" | "MODERATOR" | "ADMIN" | "SUPERADMIN" }
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<RouteParams> },
) {
  await requireSuperAdmin("/admin/users");

  Sentry.setTag("area", "admin");

  try {
    let body: any;
    try {
      body = await req.json();
    } catch {
      Sentry.addBreadcrumb({ category: "admin.action", level: "error", message: "role.change.bad_json" });
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400, headers: NO_STORE });
    }

    const desired = String(body?.role ?? "").trim().toUpperCase();
    const ALLOWED = new Set(["USER", "MODERATOR", "ADMIN", "SUPERADMIN"]);
    if (!ALLOWED.has(desired)) {
      Sentry.addBreadcrumb({ category: "admin.action", level: "error", message: "role.change.invalid_role", data: { desired } });
      return NextResponse.json({ error: "Invalid role value" }, { status: 400, headers: NO_STORE });
    }

    const actor = await getSessionUser();
    if (!actor?.id) {
      Sentry.addBreadcrumb({ category: "admin.action", level: "error", message: "role.change.no_actor_session" });
      return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: NO_STORE });
    }

    const { id: targetId } = await params;

    const target = await prisma.user.findUnique({
      where: { id: targetId },
      select: { id: true, role: true, email: true, name: true },
    });
    if (!target) {
      Sentry.addBreadcrumb({ category: "admin.action", level: "error", message: "role.change.user_not_found", data: { targetId } });
      return NextResponse.json({ error: "User not found" }, { status: 404, headers: NO_STORE });
    }

    if (actor.id === target.id && desired !== "SUPERADMIN") {
      Sentry.addBreadcrumb({
        category: "admin.action",
        level: "error",
        message: "role.change.self_demote_blocked",
        data: { actorId: actor.id, targetId: target.id, desired },
      });
      return NextResponse.json(
        { error: "Refusing to demote self from SUPERADMIN" },
        { status: 409, headers: NO_STORE },
      );
    }

    if (target.role === "SUPERADMIN" && desired !== "SUPERADMIN") {
      const superCount = await prisma.user.count({ where: { role: "SUPERADMIN" } });
      if (superCount <= 1) {
        Sentry.addBreadcrumb({
          category: "admin.action",
          level: "error",
          message: "role.change.last_superadmin_blocked",
          data: { targetId: target.id, superCount },
        });
        return NextResponse.json(
          { error: "Cannot demote the last SUPERADMIN" },
          { status: 409, headers: NO_STORE },
        );
      }
    }

    Sentry.addBreadcrumb({
      category: "admin.action",
      level: "info",
      message: "role.change.request",
      data: { actorId: actor.id, targetId: target.id, from: target.role, to: desired },
    });

    const updated = await prisma.user.update({
      where: { id: target.id },
      data: { role: desired as any },
      select: { id: true, role: true, email: true, name: true },
    });

    try {
      await prisma.auditLog.create({
        data: {
          action: "user.role.update",
          actorUserId: actor.id,
          targetUserId: target.id,
          meta: { from: target.role, to: updated.role },
        },
      });
    } catch {
      Sentry.addBreadcrumb({
        category: "admin.action",
        level: "error",
        message: "audit_log.write_failed",
        data: { targetId: target.id },
      });
    }

    Sentry.addBreadcrumb({
      category: "admin.action",
      level: "info",
      message: "role.change.success",
      data: { actorId: actor.id, targetId: target.id, to: updated.role },
    });

    return NextResponse.json({ ok: true, user: updated }, { headers: NO_STORE });
  } catch (err) {
    Sentry.captureException(err, (scope) => {
      scope.setTag("area", "admin");
      scope.setContext("role.change", { route: "/api/admin/users/[id]/role" });
      return scope;
    });
    return NextResponse.json({ error: "Internal error" }, { status: 500, headers: NO_STORE });
  }
}
