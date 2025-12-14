// src/app/lib/email-verify.ts
import { prisma } from "@/app/lib/prisma";

const EMAIL_OTP_EXPIRES_MINUTES = 10;

function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60_000);
}

function isBefore(a: Date, b: Date): boolean {
  return a.getTime() < b.getTime();
}

// Loosen Prisma typing so TS stops complaining about `emailOtp`.
// Make sure your Prisma schema actually has an `emailOtp` model with
// fields: email (unique), code (string), expires (DateTime).
const emailOtp = (prisma as any).emailOtp as {
  upsert: (args: any) => Promise<any>;
  findUnique: (args: any) => Promise<any>;
  delete: (args: any) => Promise<any>;
};

export async function issueEmailOtp(email: string) {
  const code = String(
    Math.floor(100000 + Math.random() * 900000),
  );
  const expires = addMinutes(
    new Date(),
    EMAIL_OTP_EXPIRES_MINUTES,
  );

  await emailOtp.upsert({
    where: { email },
    update: { code, expires },
    create: { email, code, expires },
  });

  return code;
}

export async function validateEmailOtp(
  email: string,
  code: string,
) {
  const entry = await emailOtp.findUnique({
    where: { email },
  });

  if (!entry) return false;
  if (entry.code !== code) return false;

  const expiresAt = entry.expires
    ? new Date(entry.expires as any)
    : null;

  if (!expiresAt || isBefore(expiresAt, new Date())) {
    // expired
    return false;
  }

  // one-time use: delete after success
  await emailOtp.delete({ where: { email } });

  return true;
}
