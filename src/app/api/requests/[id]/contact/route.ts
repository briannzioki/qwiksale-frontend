// src/app/api/requests/[id]/contact/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/prisma";

type RouteCtx = { params: Promise<{ id: string }> };

function noStore(json: unknown, init?: ResponseInit) {
  const res = NextResponse.json(json, init);
  res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
  res.headers.set("Pragma", "no-cache");
  res.headers.set("Expires", "0");
  return res;
}

async function readParamId(ctx: RouteCtx): Promise<string> {
  const p: any = (ctx as any)?.params;
  const params = p && typeof p?.then === "function" ? await p : p;
  return String(params?.id ?? "").trim();
}

/**
 * GET /api/requests/[id]/contact
 * Auth required; only returns contact if poster enabled it.
 */
export async function GET(_req: NextRequest, ctx: RouteCtx) {
  try {
    const session = await auth();
    const meId = (session as any)?.user?.id as string | undefined;
    if (!meId) return noStore({ error: "Unauthorized" }, { status: 401 });

    const id = await readParamId(ctx);
    if (!id) return noStore({ error: "Missing id" }, { status: 400 });

    const requestModel = (prisma as any).request;

    const r = await requestModel?.findUnique?.({
      where: { id },
      select: {
        id: true,
        ownerId: true,
        contactEnabled: true,
        contactMode: true,
        owner: {
          select: {
            id: true,
            phone: true,
            whatsapp: true,
            name: true,
            username: true,
            verified: true,
          },
        },
      },
    });

    if (!r) return noStore({ error: "Not found" }, { status: 404 });

    const enabled = Boolean(r?.contactEnabled);
    const mode = String(r?.contactMode || "chat").toLowerCase();

    if (!enabled || mode === "message_only") {
      return noStore({ error: "Contact is disabled for this request" }, { status: 403 });
    }

    const owner = r?.owner || null;

    if (mode === "phone") {
      return noStore({
        ok: true,
        mode: "phone",
        contact: {
          phone: owner?.phone ? String(owner.phone) : null,
          whatsapp: null,
        },
        owner: owner
          ? {
              id: String(owner.id),
              name: owner.name ?? null,
              username: owner.username ?? null,
              verified: Boolean(owner.verified),
            }
          : null,
      });
    }

    if (mode === "whatsapp") {
      return noStore({
        ok: true,
        mode: "whatsapp",
        contact: {
          phone: null,
          whatsapp: owner?.whatsapp ? String(owner.whatsapp) : null,
        },
        owner: owner
          ? {
              id: String(owner.id),
              name: owner.name ?? null,
              username: owner.username ?? null,
              verified: Boolean(owner.verified),
            }
          : null,
      });
    }

    // chat mode: no numbers here; client should call /message
    return noStore({
      ok: true,
      mode: "chat",
      contact: { phone: null, whatsapp: null },
      note: "Use messaging to contact the poster.",
      owner: owner
        ? {
            id: String(owner.id),
            name: owner.name ?? null,
            username: owner.username ?? null,
            verified: Boolean(owner.verified),
          }
        : null,
    });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn("[/api/requests/[id]/contact GET] error:", e);
    return noStore({ error: "Server error" }, { status: 500 });
  }
}
