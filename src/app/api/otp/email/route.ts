import { guardRate } from "@/app/api/_lib/guard";
import { json, err, noStore } from "@/app/api/_lib/http";
import { sendEmail, otpEmailHTML } from "@/app/api/_lib/email";
// import { setEmailOtp, verifyEmailOtp } from "@/app/api/_lib/otp-store"; // mirror your phone OTP store

export async function POST(req: Request) {
  const limited = await guardRate(req, "post:otp:email:start");
  if (limited) return limited;

  const { email } = await req.json();
  if (!email) return err(400, "missing email");

  // const code = setEmailOtp(email);
  const code = Math.floor(100000 + Math.random()*900000).toString();
  const sent = await sendEmail({ to: email, subject: "Your QwikSale code", html: otpEmailHTML(code), text: `Your code: ${code}` });
  return noStore({ ok: true, id: sent.id, queued: sent.queued });
}
