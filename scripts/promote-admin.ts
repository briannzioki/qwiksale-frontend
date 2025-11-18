// scripts/promote-admin.ts
import prisma from "../src/lib/db";

async function main() {
  const email = process.argv[2];
  if (!email) {
    console.error("Usage: tsx scripts/promote-admin.ts you@example.com");
    process.exit(1);
  }

  const u = await prisma.user.update({
    where: { email },
    data: { role: "ADMIN" },
    select: { id: true, email: true, role: true },
  });

  console.log("✅ Promoted:", u.id, u.email, "role:", u.role);
}

main()
  .catch((e) => {
    console.error("❌ promote-admin failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
