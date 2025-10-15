// scripts/seed-min.ts
import { prisma } from "../src/app/lib/prisma";

async function main() {
  const user = await prisma.user.upsert({
    where: { email: "seed@example.com" },
    update: {},
    create: { email: "seed@example.com", name: "Seed User" },
  });

  await prisma.product.create({
    data: {
      name: "Seed Product",
      status: "ACTIVE",
      sellerId: user.id,
      gallery: ["https://picsum.photos/seed/a/1200/800", "https://picsum.photos/seed/b/1200/800"],
    },
  });

  await prisma.service.create({
    data: {
      name: "Seed Service",
      status: "ACTIVE",
      providerId: user.id,
      gallery: ["https://picsum.photos/seed/c/1200/800"],
    },
  });
}

main().finally(() => prisma.$disconnect());
