// scripts/quick-check.ts
import type { Prisma } from "@prisma/client";
import { prisma } from "../src/app/lib/prisma"; // adjust if your central client is at ../src/lib/db

// Narrow selects so we can derive precise row types
const productSelect = {
  id: true,
  name: true,
  image: true,
  gallery: true,
  featured: true,
  createdAt: true,
} as const;

const serviceSelect = {
  id: true,
  name: true,
  image: true,
  gallery: true,
  featured: true,
  createdAt: true,
} as const;

type ProductRow = Prisma.ProductGetPayload<{ select: typeof productSelect }>;
type ServiceRow = Prisma.ServiceGetPayload<{ select: typeof serviceSelect }>;

async function main() {
  const latestP: ProductRow[] = await prisma.product.findMany({
    where: { status: "ACTIVE" },
    orderBy: { createdAt: "desc" },
    take: 10,
    select: productSelect,
  });

  const latestS: ServiceRow[] = await prisma.service.findMany({
    where: { status: "ACTIVE" },
    orderBy: { createdAt: "desc" },
    take: 10,
    select: serviceSelect,
  });

  console.table(
    latestP.map((p: ProductRow) => ({ ...p, galleryLen: p.gallery.length }))
  );
  console.table(
    latestS.map((s: ServiceRow) => ({ ...s, galleryLen: s.gallery.length }))
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    try {
      await prisma.$disconnect();
    } catch {}
    process.exit(0);
  });
