/* scripts/make-admin.ts */
import prisma from "../src/lib/db";

const email = process.env.ADMIN_EMAIL || "you@yourdomain.com";

async function main() {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    throw new Error(
      `No user with email ${email}. Create the account first (via /signup or NextAuth).`
    );
  }

  await prisma.user.update({ where: { email }, data: { role: "ADMIN" } });
  console.log(`✅ Promoted ${email} to ADMIN`);
}

main()
  .catch((err) => {
    console.error("❌ make-admin failed:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
