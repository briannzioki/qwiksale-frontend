import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function must(name, v) {
  if (!v) throw new Error(`Missing env ${name}`);
  return v;
}

const userId = must("USER_ID", process.env.USER_ID);
const msisdn = must("MSISDN", process.env.MSISDN);
const tier = (process.env.TIER || "GOLD").toUpperCase();
const amount = Number(process.env.AMOUNT || (tier === "PLATINUM" ? 499 : 199));

const checkoutRequestId = `TEST_CHECKOUT_${Date.now()}_${Math.random().toString(16).slice(2)}`;
const merchantRequestId = `TEST_MERCHANT_${Date.now()}_${Math.random().toString(16).slice(2)}`;

const payment = await prisma.payment.create({
  data: {
    status: "PENDING",
    method: "MPESA",
    currency: "KES",
    amount,
    payerPhone: msisdn,
    accountRef: "QWIKSALE",
    checkoutRequestId,
    merchantRequestId,
    userId,
    targetTier: tier,
  },
  select: {
    id: true,
    userId: true,
    amount: true,
    payerPhone: true,
    checkoutRequestId: true,
    merchantRequestId: true,
    targetTier: true,
    status: true,
  },
});

console.log(JSON.stringify(payment));

await prisma.$disconnect();
