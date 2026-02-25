import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const paymentId = process.env.PAYMENT_ID;
if (!paymentId) {
  console.error("Missing env PAYMENT_ID");
  process.exit(1);
}

const payment = await prisma.payment.findUnique({
  where: { id: paymentId },
  select: {
    id: true,
    status: true,
    amount: true,
    payerPhone: true,
    targetTier: true,
    mpesaReceipt: true,
    paidAt: true,
    checkoutRequestId: true,
    merchantRequestId: true,
    userId: true,
    updatedAt: true,
  },
});

let user = null;
if (payment?.userId) {
  user = await prisma.user.findUnique({
    where: { id: payment.userId },
    select: { id: true, email: true, subscription: true, subscriptionUntil: true, updatedAt: true },
  });
}

console.log(JSON.stringify({ payment, user }, null, 2));
await prisma.$disconnect();
