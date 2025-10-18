import { vi, describe, it, expect } from "vitest";

vi.mock("@/app/lib/prisma", () => ({ prisma: { user: { findUnique: vi.fn() } } }));
vi.mock("@/app/lib/auth", () => ({
  getServerSession: vi.fn(),
  getSessionUser: vi.fn(),
}));

import { getServerSession, getSessionUser } from "@/app/lib/auth";
import {
  isAdminUser,
  isSuperAdminUser,
  hasRoleAtLeast,
  requireAdmin,
  requireSuperAdmin,
} from "@/app/lib/authz";

const u = (over: Partial<any> = {}) => ({ id: "u1", email: "a@ex.com", role: "USER", ...over });

describe("authz role logic", () => {
  it("SUPERADMIN is admin + superadmin", async () => {
    (getSessionUser as any).mockResolvedValue(u({ role: "SUPERADMIN" }));
    await expect(isAdminUser()).resolves.toBe(true);
    await expect(isSuperAdminUser()).resolves.toBe(true);
    await expect(hasRoleAtLeast("ADMIN")).resolves.toBe(true);
  });

  it("ADMIN is admin only", async () => {
    (getSessionUser as any).mockResolvedValue(u({ role: "ADMIN" }));
    await expect(isAdminUser()).resolves.toBe(true);
    await expect(isSuperAdminUser()).resolves.toBe(false);
  });

  it("USER is neither", async () => {
    (getSessionUser as any).mockResolvedValue(u({ role: "USER" }));
    await expect(isAdminUser()).resolves.toBe(false);
    await expect(isSuperAdminUser()).resolves.toBe(false);
  });
});

describe("guards redirect", () => {
  vi.mock("next/navigation", async (orig) => {
    const mod: any = await orig();
    return {
      ...mod,
      redirect: (url: string) => {
        const err: any = new Error("REDIRECT");
        err.url = url;
        throw err;
      },
    };
  });

  (getServerSession as any).mockResolvedValue({ user: { id: "u1" } });

  it("requireAdmin allows ADMIN", async () => {
    (getSessionUser as any).mockResolvedValue(u({ role: "ADMIN" }));
    await expect(requireAdmin()).resolves.toBeUndefined();
  });

  it("requireAdmin redirects USER", async () => {
    (getSessionUser as any).mockResolvedValue(u({ role: "USER" }));
    await expect(requireAdmin()).rejects.toMatchObject({ message: "REDIRECT" });
  });

  it("requireSuperAdmin allows SUPERADMIN", async () => {
    (getSessionUser as any).mockResolvedValue(u({ role: "SUPERADMIN" }));
    await expect(requireSuperAdmin()).resolves.toBeUndefined();
  });

  it("requireSuperAdmin redirects ADMIN", async () => {
    (getSessionUser as any).mockResolvedValue(u({ role: "ADMIN" }));
    await expect(requireSuperAdmin()).rejects.toMatchObject({ message: "REDIRECT" });
  });
});
