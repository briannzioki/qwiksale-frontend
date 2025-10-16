/* Backfills:
   1) Product/Service.publishedAt = createdAt (where null)
   2) SupportTicket.contentHash (if the column exists) */
const { PrismaClient } = require("@prisma/client");
const crypto = require("node:crypto");

const prisma = new PrismaClient();
const BATCH = 1000;

function hashTicket(message, email, reporterId) {
  return crypto
    .createHash("sha256")
    .update(`${message || ""}|${email || ""}|${reporterId || ""}`)
    .digest("hex");
}

async function ensurePublishedAt() {
  const prod = await prisma.$executeRawUnsafe(`
    UPDATE "Product"
       SET "publishedAt" = COALESCE("publishedAt","createdAt")
     WHERE "publishedAt" IS NULL
  `);
  const svc = await prisma.$executeRawUnsafe(`
    UPDATE "Service"
       SET "publishedAt" = COALESCE("publishedAt","createdAt")
     WHERE "publishedAt" IS NULL
  `);
  console.log(`[Product] publishedAt updated: ${Number(prod) || 0}`);
  console.log(`[Service] publishedAt updated: ${Number(svc) || 0}`);
}

async function columnExists(table, column) {
  const rows = await prisma.$queryRaw`
    SELECT 1
      FROM information_schema.columns
     WHERE table_schema = current_schema()
       AND table_name   = ${table}
       AND column_name  = ${column}
     LIMIT 1
  `;
  return Array.isArray(rows) && rows.length > 0;
}

async function backfillContentHash() {
  const hasCol = await columnExists("SupportTicket", "contentHash");
  if (!hasCol) {
    console.log("?  Skipping contentHash backfill: column not found.");
    return;
  }

  let total = 0;
  for (;;) {
    const rows = await prisma.$queryRaw`
      SELECT "id","message","email","reporterId"
        FROM "SupportTicket"
       WHERE "contentHash" IS NULL
       ORDER BY "createdAt" ASC
       LIMIT ${BATCH}
    `;
    if (!rows.length) break;

    await prisma.$transaction(
      rows.map((r) => {
        const digest = hashTicket(r.message, r.email, r.reporterId);
        return prisma.$executeRaw`
          UPDATE "SupportTicket"
             SET "contentHash" = ${digest}
           WHERE "id" = ${r.id}
        `;
      }),
      { timeout: 60_000 }
    );

    total += rows.length;
    console.log(`[SupportTicket] contentHash backfilled: ${total}`);
    if (rows.length < BATCH) break;
  }
}

async function main() {
  await ensurePublishedAt();
  await backfillContentHash();
}

main()
  .then(async () => {
    await prisma.$disconnect();
    console.log(" Backfill complete.");
  })
  .catch(async (e) => {
    console.error(" Backfill failed:", e);
    await prisma.$disconnect();
    process.exit(1);
  });
