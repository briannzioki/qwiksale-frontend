import { Resend } from "resend";
export const resend = new Resend(process.env.RESEND_API_KEY!);

export async function sendMail(to: string, subject: string, html: string) {
  return resend.emails.send({ from: "QwikSale <noreply@qwiksale.sale>", to, subject, html });
}
