import { prisma } from "@/server/db";
import { sendMail } from "@/server/email";

export async function GET() {
  // minimal digest example
  const sellers = await prisma.user.findMany({ where: { /* active */ }, select: { id: true, email: true }});
  for (const s of sellers) {
    // compute stats
    const [views, saves] = [12, 3]; // TODO: compute from your events table
    if (!s.email) continue;
    await sendMail(s.email, "Your QwikSale weekly digest", `<p>You got ${views} views and ${saves} saves.</p>`);
  }
  return Response.json({ ok: true });
}
