// src/app/api/account/verify-email/request/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { getViewer } from "@/app/lib/auth";
import { err, noStore } from "@/app/api/_lib/http";
import { guardRate } from "@/app/api/_lib/guard";
import { sendEmail, otpEmailHTML } from "@/app/api/_lib/email";
import { issueEmailOtp } from "@/app/lib/email-verify";

export async function POST(req: Request) {
  const viewer = await getViewer();
  if (!viewer?.email) {
    return err(401, "not authenticated");
  }

  const limited = await guardRate(req, "email_verify_request");
  if (limited) return limited;

  const email = viewer.email;
  const code = await issueEmailOtp(email);

  const subject = "Verify your QwikSale email";
  const html = otpEmailHTML(code);
  const text = `Your QwikSale verification code is: ${code}\nIt expires in 10 minutes.`;

  await sendEmail({ to: email, subject, html, text });

  return noStore({ ok: true, sent: true });
}
