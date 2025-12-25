// src/app/api/account/verify-email/confirm/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { getViewer } from "@/app/lib/auth";
import { err, noStore } from "@/app/api/_lib/http";
import { validateEmailOtp } from "@/app/lib/email-verify";
import { prisma } from "@/app/lib/prisma";
import {
  buildSellerBadgeFields,
  resolveSellerBadgeFieldsFromUserLike,
} from "@/app/lib/sellerVerification";

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

  // IMPORTANT:
  // - We verify the email (emailVerified timestamp)
  // - And mirror to account "verified" (User.verified boolean) ONLY as a derived field (never the truth).
  const updated = await prisma.user.update({
    where: { id: viewer.id },
    data: {
      emailVerified: new Date(),
      verified: true,
    },
    select: {
      emailVerified: true,
    },
  });

  // Compute canonical seller flags from the User row JSON (tier-safe).
  let badges: any = buildSellerBadgeFields(true, "basic");
  try {
    const rows = await prisma.$queryRaw<{ u: any }[]>`
      SELECT row_to_json(u) as u
      FROM "User" u
      WHERE u.id = ${viewer.id}
      LIMIT 1
    `;
    const u = rows?.[0]?.u ?? null;
    if (u) badges = resolveSellerBadgeFieldsFromUserLike(u) as any;
  } catch {
    // keep defaults
  }

  // Response: keep it explicit and avoid breaking callers.
  // Provide a back-compat alias for any client that previously checked snake_case.
  return noStore({
    ok: true,
    emailVerified: true,
    email_verified: updated.emailVerified,
    sellerVerified: badges.sellerVerified,
    sellerBadges: badges.sellerBadges,
    verified: badges.verified,
    isVerified: badges.isVerified,
    seller_verified: badges.seller_verified,
  });
}
