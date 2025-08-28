-- CreateEnum
CREATE TYPE "public"."PaymentStatus" AS ENUM ('PENDING', 'PAID', 'FAILED');

-- AlterTable
ALTER TABLE "public"."User" ADD COLUMN     "verified" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "public"."Payment" (
    "id" TEXT NOT NULL,
    "status" "public"."PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "amount" INTEGER NOT NULL,
    "payerPhone" TEXT NOT NULL,
    "mpesaReceipt" TEXT,
    "transactionDate" TIMESTAMP(3),
    "checkoutRequestId" TEXT,
    "merchantRequestId" TEXT,
    "accountRef" TEXT,
    "rawCallback" JSONB,
    "productId" TEXT,
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ContactReveal" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "viewerUserId" TEXT,
    "ip" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContactReveal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Payment_status_createdAt_idx" ON "public"."Payment"("status", "createdAt");

-- CreateIndex
CREATE INDEX "Payment_checkoutRequestId_idx" ON "public"."Payment"("checkoutRequestId");

-- CreateIndex
CREATE INDEX "Payment_merchantRequestId_idx" ON "public"."Payment"("merchantRequestId");

-- CreateIndex
CREATE INDEX "Payment_accountRef_idx" ON "public"."Payment"("accountRef");

-- CreateIndex
CREATE INDEX "ContactReveal_productId_createdAt_idx" ON "public"."ContactReveal"("productId", "createdAt");

-- CreateIndex
CREATE INDEX "ContactReveal_viewerUserId_createdAt_idx" ON "public"."ContactReveal"("viewerUserId", "createdAt");

-- CreateIndex
CREATE INDEX "ContactReveal_ip_createdAt_idx" ON "public"."ContactReveal"("ip", "createdAt");

-- CreateIndex
CREATE INDEX "Product_category_idx" ON "public"."Product"("category");

-- CreateIndex
CREATE INDEX "Product_subcategory_idx" ON "public"."Product"("subcategory");

-- CreateIndex
CREATE INDEX "Product_brand_idx" ON "public"."Product"("brand");

-- CreateIndex
CREATE INDEX "Product_price_idx" ON "public"."Product"("price");

-- CreateIndex
CREATE INDEX "Product_createdAt_idx" ON "public"."Product"("createdAt");

-- CreateIndex
CREATE INDEX "Product_featured_idx" ON "public"."Product"("featured");

-- AddForeignKey
ALTER TABLE "public"."Payment" ADD CONSTRAINT "Payment_productId_fkey" FOREIGN KEY ("productId") REFERENCES "public"."Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Payment" ADD CONSTRAINT "Payment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ContactReveal" ADD CONSTRAINT "ContactReveal_productId_fkey" FOREIGN KEY ("productId") REFERENCES "public"."Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
