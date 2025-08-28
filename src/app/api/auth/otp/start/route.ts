import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";

// Same phone normalizer as before
function normalizePhoneKenya(raw: string): string | null {
  let s = (raw || "").trim().replace(/\D+/g, "");
  if (!s) return null;
  if (/^07\d{8}$/.test(s)) s = "254" + s.slice(1);
  if (/^\+2547\d{8}$/.test(s)) s = s.replace(/^\+/, "");
  if (/^2547\d{8}$/.test(s)) return s;
  return null;
}

function random6() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

export async function POST(req: Request) {
  const { identifier } = await req.json().catch(() => ({ identifier: "" }));
  const phone = normalizePhoneKenya(identifier);
  if (!phone) {
    return NextResponse.json(
      { error: "Provide a Kenyan phone: 07XXXXXXXX or 2547XXXXXXXX" },
      { status: 400 }
    );
  }

  const code = random6();
  const expires = new Date(Date.now() + 10 * 60 * 1000); // 10 min

  // Store token under composite key (identifier, token)
  await prisma.verificationToken.create({
    data: {
      identifier: `tel:${phone}`,
      token: code,
      expires,
    },
  });

  // For now, log to server. Replace with SMS provider later.
  console.log(`[OTP] ${phone} → ${code} (valid 10 min)`);

  return NextResponse.json({ ok: true });
}
