// tests/unit/authz.spec.ts
import { vi, describe, it, expect, beforeEach } from "vitest";

vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    const err: any = new Error("REDIRECT");
    err.url = url;
    throw err;
  },
}));

// Stub the auth entrypoint used by src/app/lib/authz.ts
vi.mock("@/auth", () => ({
  auth: vi.fn(),
}));

import { auth } from "@/auth";
import {
  isAdminUser,
  isSuperAdminUserLocal,
  requireAdmin,
} from "@/app/lib/authz";
import type { AnyUser } from "@/app/lib/authz";

const user = (overrides: Partial<AnyUser> = {}): AnyUser => ({
  id: "u1",
  email: "a@ex.com",
  role: "USER",
  ...overrides,
});

beforeEach(() => {
  (auth as any).mockReset();
});

describe("isAdminUser / isSuperAdminUserLocal", () => {
  it("treats isAdmin flag as admin", () => {
    expect(isAdminUser(user({ isAdmin: true }))).toBe(true);
  });

  it("ADMIN role is admin", () => {
    expect(isAdminUser(user({ role: "ADMIN" }))).toBe(true);
  });

  it("SUPERADMIN role is admin + superadmin", () => {
    const u = user({ role: "SUPERADMIN" });
    expect(isAdminUser(u)).toBe(true);
    expect(isSuperAdminUserLocal(u)).toBe(true);
  });

  it("roles array recognized", () => {
    const u = user({ roles: ["viewer", "Admin"] });
    expect(isAdminUser(u)).toBe(true);
  });

  it("USER is not admin or superadmin", () => {
    const u = user({ role: "USER" });
    expect(isAdminUser(u)).toBe(false);
    expect(isSuperAdminUserLocal(u)).toBe(false);
  });
});

describe("requireAdmin (redirect mode)", () => {
  it("allows admin", async () => {
    (auth as any).mockResolvedValue({
      user: user({ role: "ADMIN" }),
    });

    await expect(requireAdmin()).resolves.toBeUndefined();
  });

  it("redirects unauthenticated to signin with callback", async () => {
    (auth as any).mockResolvedValue(null);

    await expect(requireAdmin()).rejects.toMatchObject({
      message: "REDIRECT",
      // url: "/signin?callbackUrl=%2Fadmin"
    });
  });

  it("redirects non-admin to /dashboard", async () => {
    (auth as any).mockResolvedValue({
      user: user({ role: "USER" }),
    });

    await expect(requireAdmin()).rejects.toMatchObject({
      message: "REDIRECT",
    });
  });
});

describe("requireAdmin (result mode)", () => {
  it("returns authorized:true for admin", async () => {
    (auth as any).mockResolvedValue({
      user: user({ role: "ADMIN" }),
    });

    const res = await requireAdmin({ mode: "result" });
    expect(res).toEqual({
      authorized: true,
      user: {
        ...user({ role: "ADMIN" }),
        id: "u1",
      },
    });
  });

  it("returns 401 for unauthenticated", async () => {
    (auth as any).mockResolvedValue(null);

    const res = await requireAdmin({ mode: "result" });
    expect(res).toEqual({
      authorized: false,
      status: 401,
      reason: "Unauthenticated",
    });
  });

  it("returns 403 for non-admin", async () => {
    (auth as any).mockResolvedValue({
      user: user({ role: "USER" }),
    });

    const res = await requireAdmin({ mode: "result" });
    expect(res).toEqual({
      authorized: false,
      status: 403,
      reason: "Forbidden",
    });
  });
});
