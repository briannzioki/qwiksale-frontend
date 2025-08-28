import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/authOptions";
import { prisma } from "@/app/lib/prisma";

function normalizePhoneKenya(raw: string): string | null {
  let s = (raw || "").trim().replace(/\D+/g, "");
  if (!s) return null;
  if (/^07\d{8}$/.test(s)) s = "254" + s.slice(1);
  if (/^\+2547\d{8}$/.test(s)) s = s.replace(/^\+/, "");
  if (/^2547\d{8}$/.test(s)) return s;
  return null;
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  const userId = (session as any)?.user?.id as string | undefined;
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { identifier, code } = await req.json().catch(() => ({}));
  const phone = normalizePhoneKenya(identifier || "");
  if (!phone || typeof code !== "string" || code.length !== 6) {
    return NextResponse.json({ error: "Invalid phone/code" }, { status: 400 });
  }

  const id = `tel:${phone}`;
  const vt = await prisma.verificationToken.findUnique({
    where: { identifier_token: { identifier: id, token: code } },
  });

  if (!vt || vt.expires < new Date()) {
    return NextResponse.json({ error: "Code invalid or expired" }, { status: 400 });
  }

  // Attach phone to the CURRENT user (and mark verified)
  try {
    await prisma.user.update({
      where: { id: userId },
      data: { phone, phoneVerified: true },
    });
  } catch (e: any) {
    if (e?.code === "P2002") {
      return NextResponse.json({ error: "Phone already in use" }, { status: 409 });
    }
    throw e;
  } finally {
    // consume the token
    await prisma.verificationToken.delete({
      where: { identifier_token: { identifier: id, token: code } },
    }).catch(() => {});
  }

  return NextResponse.json({ ok: true });
}
