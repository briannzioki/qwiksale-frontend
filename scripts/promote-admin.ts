// scripts/promote-admin.ts
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const email = process.argv[2];
  if (!email) {
    console.error("Usage: tsx scripts/promote-admin.ts you@example.com");
    process.exit(1);
  }

  const u = await prisma.user.update({
    where: { email },
    data: { role: "ADMIN" }, // promote via role enum
    select: { id: true, email: true, role: true },
  });

  console.log("Promoted:", u.id, u.email, "role:", u.role);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
