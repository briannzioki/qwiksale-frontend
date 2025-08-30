/*
  Warnings:

  - You are about to alter the column `payerPhone` on the `Payment` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(15)`.
  - You are about to alter the column `accountRef` on the `Payment` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(12)`.
  - You are about to alter the column `phone` on the `User` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(15)`.
  - The `phoneVerified` column on the `User` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - A unique constraint covering the columns `[productId,viewerUserId]` on the table `ContactReveal` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[mpesaReceipt]` on the table `Payment` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[checkoutRequestId]` on the table `Payment` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[merchantRequestId]` on the table `Payment` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "public"."ProductStatus" AS ENUM ('ACTIVE', 'SOLD', 'HIDDEN', 'DRAFT');

-- CreateEnum
CREATE TYPE "public"."PaymentMethod" AS ENUM ('MPESA');

-- DropIndex
DROP INDEX "public"."Payment_checkoutRequestId_idx";

-- DropIndex
DROP INDEX "public"."Payment_merchantRequestId_idx";

-- DropIndex
DROP INDEX "public"."Product_category_idx";

-- DropIndex
DROP INDEX "public"."Product_subcategory_idx";

-- AlterTable
ALTER TABLE "public"."Payment" ADD COLUMN     "currency" TEXT NOT NULL DEFAULT 'KES',
ADD COLUMN     "method" "public"."PaymentMethod" NOT NULL DEFAULT 'MPESA',
ALTER COLUMN "payerPhone" SET DATA TYPE VARCHAR(15),
ALTER COLUMN "accountRef" SET DATA TYPE VARCHAR(12);

-- AlterTable
ALTER TABLE "public"."Product" ADD COLUMN     "soldAt" TIMESTAMP(3),
ADD COLUMN     "status" "public"."ProductStatus" NOT NULL DEFAULT 'ACTIVE';

-- AlterTable
ALTER TABLE "public"."User" ALTER COLUMN "email" DROP NOT NULL,
ALTER COLUMN "email" SET DATA TYPE CITEXT,
ALTER COLUMN "phone" SET DATA TYPE VARCHAR(15),
DROP COLUMN "phoneVerified",
ADD COLUMN     "phoneVerified" BOOLEAN NOT NULL DEFAULT false,
ALTER COLUMN "username" SET DATA TYPE CITEXT;

-- CreateIndex
CREATE UNIQUE INDEX "ContactReveal_productId_viewerUserId_key" ON "public"."ContactReveal"("productId", "viewerUserId");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_mpesaReceipt_key" ON "public"."Payment"("mpesaReceipt");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_checkoutRequestId_key" ON "public"."Payment"("checkoutRequestId");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_merchantRequestId_key" ON "public"."Payment"("merchantRequestId");

-- CreateIndex
CREATE INDEX "Payment_userId_createdAt_idx" ON "public"."Payment"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "Payment_productId_createdAt_idx" ON "public"."Payment"("productId", "createdAt");

-- CreateIndex
CREATE INDEX "Product_category_subcategory_idx" ON "public"."Product"("category", "subcategory");

-- CreateIndex
CREATE INDEX "Product_sellerId_createdAt_idx" ON "public"."Product"("sellerId", "createdAt");

-- CreateIndex
CREATE INDEX "User_createdAt_idx" ON "public"."User"("createdAt");
