// scripts/purge-test-users.ts
import { prisma } from "../src/app/lib/prisma";

const emails = [
  // put every email you want to reuse here
  "me+test1@gmail.com",
  "test@example.com",
  "foo+qa@gmail.com",
];

async function run() {
  // Safety: never nuke admin by mistake
  const adminEmails = new Set(
    (process.env.ADMIN_EMAILS || "")
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean)
  );

  for (const raw of emails) {
    const email = raw.toLowerCase().trim();
    if (adminEmails.has(email)) {
      console.log(`SKIP admin email: ${email}`);
      continue;
    }

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      console.log(`No user for ${email}`);
      continue;
    }

    console.log(`Deleting user ${email} (id=${user.id}) …`);

    // Delete NextAuth relations first (adjust names if your schema differs)
    await prisma.account.deleteMany({ where: { userId: user.id } });
    await prisma.session.deleteMany({ where: { userId: user.id } });

    // If you store referrals/messages/listings tied to user,
    // either delete or you’ll hit FKs. Example (comment out if not in schema):
    await prisma.referral?.deleteMany({ where: { OR: [{ inviterId: user.id }, { inviteeId: user.id }] } });
    await prisma.product?.deleteMany({ where: { sellerId: user.id } });
    await prisma.service?.deleteMany({ where: { sellerId: user.id } });
    await prisma.message?.deleteMany({ where: { OR: [{ fromId: user.id }, { toId: user.id }] } });

    // Finally delete the user
    await prisma.user.delete({ where: { id: user.id } });
    console.log(`✔ Deleted ${email}`);
  }
}

run()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    return prisma.$disconnect().finally(() => process.exit(1));
  });
