// scripts/purge.ts
import * as dotenv from "dotenv";
// Try .env.local first (dev), then .env (prod/CI)
dotenv.config({ path: ".env.local" });
dotenv.config();

import { prisma } from "../src/app/lib/prisma";

async function main() {
  const sure = process.argv.includes("--yes");
  if (!sure) {
    console.error("Refusing to purge without --yes");
    process.exit(1);
  }

  const mask = (u?: string) =>
    u ? u.replace(/:(\/\/)?[^@]*@/, "://***:***@") : "(unset)";
  console.log("Using DATABASE_URL =", mask(process.env.DATABASE_URL));

  // Purge in a safe order. Some tables may not exist; ignore errors.
  async function wipe(label: string, fn: () => Promise<any>) {
    try {
      const r = await fn();
      const count = typeof r?.count === "number" ? r.count : 0;
      console.log(`✓ ${label} deleted: ${count}`);
    } catch (e) {
      console.log(`- ${label} skipped`);
    }
  }

  await wipe("favorites", () => (prisma as any).favorite.deleteMany({}));
  await wipe("products", () => (prisma as any).product.deleteMany({}));

  // NextAuth tables (present if you used the Prisma adapter)
  await wipe("verification tokens", () =>
    (prisma as any).verificationToken?.deleteMany({})
  );
  await wipe("sessions", () => (prisma as any).session?.deleteMany({}));
  await wipe("accounts", () => (prisma as any).account.deleteMany({}));
  await wipe("users", () => (prisma as any).user.deleteMany({}));

  console.log("Done.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
