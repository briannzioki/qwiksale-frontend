// src/app/api/referrals/claim/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { auth } from "@/auth";
import * as referrals from "@/app/lib/referrals";

function noStore(json: unknown, init?: ResponseInit) {
  const res = NextResponse.json(json, init);
  res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
  res.headers.set("Pragma", "no-cache");
  res.headers.set("Expires", "0");
  return res;
}

type Body = { code?: unknown };

export async function POST(req: Request) {
  try {
    const session = await auth();
    const meId = (session as any)?.user?.id as string | undefined;
    if (!meId) return noStore({ error: "Unauthorized" }, { status: 401 });

    const body = (await req.json().catch(() => ({}))) as Body;
    const codeRaw = String((body as any)?.code ?? "").trim();
    if (!codeRaw) return noStore({ error: "Missing code" }, { status: 400 });

    if (!/^[A-Za-z0-9._-]{3,64}$/.test(codeRaw)) {
      return noStore({ error: "Invalid code" }, { status: 400 });
    }

    const claim = (referrals as any).claimReferral as
      | ((args: { meId: string; code: string }) => Promise<unknown>)
      | undefined;

    if (typeof claim !== "function") {
      return noStore({ error: "Server misconfigured" }, { status: 500 });
    }

    const out = await claim({ meId, code: codeRaw });
    return noStore(
      out && typeof out === "object"
        ? { ok: true, ...(out as any) }
        : { ok: true },
    );
  } catch (e: any) {
    if (e?.code === "P2002") {
      return noStore({ error: "Referral already claimed" }, { status: 409 });
    }
    if (e?.code === "ALREADY_LINKED") {
      return noStore({ error: "Already linked to a referrer" }, { status: 400 });
    }
    if (e?.code === "ALREADY_CLAIMED") {
      return noStore({ error: "Referral already claimed" }, { status: 409 });
    }
    if (typeof e?.statusCode === "number" && e.statusCode >= 400) {
      return noStore(
        { error: e?.message || "Request failed" },
        { status: e.statusCode },
      );
    }

    // eslint-disable-next-line no-console
    console.warn("[/api/referrals/claim POST] error:", e);
    return noStore({ error: "Server error" }, { status: 500 });
  }
}
