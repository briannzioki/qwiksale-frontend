import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/app/lib/authz", () => ({ requireSuperAdmin: vi.fn() }));
vi.mock("@/app/lib/auth", () => ({ getSessionUser: vi.fn() }));
vi.mock("@/app/lib/prisma", () => ({
  prisma: {
    user: { findUnique: vi.fn(), update: vi.fn(), count: vi.fn() },
    auditLog: { create: vi.fn() },
  },
}));

import { requireSuperAdmin } from "@/app/lib/authz";
import { getSessionUser } from "@/app/lib/auth";
import { prisma } from "@/app/lib/prisma";
import { POST } from "@/app/api/admin/users/[id]/role/route";

const makeReq = (body: any) =>
  new Request("http://x/api/admin/users/USER_ID/role", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

// helper to build the route context the handler expects
const ctx = (id: string) =>
  ({ params: Promise.resolve({ id }) } as { params: Promise<{ id: string }> });

beforeEach(() => {
  vi.clearAllMocks();
  (requireSuperAdmin as any).mockResolvedValue(undefined);
  (getSessionUser as any).mockResolvedValue({ id: "actor_1" });
});

describe("POST /api/admin/users/:id/role", () => {
  it("rejects invalid role", async () => {
    const res = await POST(makeReq({ role: "nope" }), ctx("USER_ID"));
    expect(res.status).toBe(400);
  });

  it("blocks demoting last SUPERADMIN", async () => {
    (prisma.user.findUnique as any).mockResolvedValue({ id: "USER_ID", role: "SUPERADMIN" });
    (prisma.user.count as any).mockResolvedValue(1);

    const res = await POST(makeReq({ role: "ADMIN" }), ctx("USER_ID"));
    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.error).toMatch(/last SUPERADMIN/i);
  });

  it("updates role and writes audit", async () => {
    (prisma.user.findUnique as any).mockResolvedValue({ id: "USER_ID", role: "ADMIN" });
    (prisma.user.count as any).mockResolvedValue(2);
    (prisma.user.update as any).mockResolvedValue({ id: "USER_ID", role: "SUPERADMIN" });

    const res = await POST(makeReq({ role: "SUPERADMIN" }), ctx("USER_ID"));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);

    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: {
        action: "user.role.update",
        actorUserId: "actor_1",
        targetUserId: "USER_ID",
        meta: { from: "ADMIN", to: "SUPERADMIN" },
      },
    });
  });
});
