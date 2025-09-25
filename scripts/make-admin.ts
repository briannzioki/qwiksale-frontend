/* scripts/make-admin.ts */
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

const email = process.env.ADMIN_EMAIL || "you@yourdomain.com";

async function main() {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    throw new Error(`No user with email ${email}. Create the account first (via /signup or NextAuth).`);
  }
  await prisma.user.update({ where: { email }, data: { role: "ADMIN" } });
  console.log(`✅ Promoted ${email} to ADMIN`);
}
main().finally(() => prisma.$disconnect());
