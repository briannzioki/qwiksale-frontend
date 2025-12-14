// src/app/api/account/verify-email/confirm/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { getViewer } from "@/app/lib/auth";
import { json, err, noStore } from "@/app/api/_lib/http";
import { validateEmailOtp } from "@/app/lib/email-verify";
import { prisma } from "@/app/lib/prisma";

export async function POST(req: Request) {
  const viewer = await getViewer();
  if (!viewer?.email || !viewer?.id) {
    return err(401, "not authenticated");
  }

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    return err(400, "invalid json");
  }

  const code = String(body.code || "").trim();
  if (!code) return err(400, "missing code");

  const ok = await validateEmailOtp(viewer.email, code);
  if (!ok) return err(400, "invalid or expired code");

  await prisma.user.update({
    where: { id: viewer.id },
    data: {
      verified: true,
      emailVerified: new Date(),
    },
  });

  return noStore({ ok: true, verified: true });
}
