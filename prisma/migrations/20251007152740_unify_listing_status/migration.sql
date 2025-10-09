/*
  Warnings:

  - The `status` column on the `Product` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The `status` column on the `Service` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- CreateEnum
CREATE TYPE "ListingStatus" AS ENUM ('ACTIVE', 'DRAFT', 'PAUSED', 'ARCHIVED');

-- DropForeignKey
ALTER TABLE "public"."Favorite" DROP CONSTRAINT "Favorite_productId_fkey";

-- DropForeignKey
ALTER TABLE "public"."Favorite" DROP CONSTRAINT "Favorite_userId_fkey";

-- AlterTable
ALTER TABLE "Product" DROP COLUMN "status",
ADD COLUMN     "status" "ListingStatus" NOT NULL DEFAULT 'ACTIVE';

-- AlterTable
ALTER TABLE "Service" DROP COLUMN "status",
ADD COLUMN     "status" "ListingStatus" NOT NULL DEFAULT 'ACTIVE';

-- DropEnum
DROP TYPE "public"."ProductStatus";

-- CreateIndex
CREATE INDEX "Product_status_featured_createdAt_idx" ON "Product"("status", "featured", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "Product_status_createdAt_idx" ON "Product"("status", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "Product_status_category_subcategory_createdAt_idx" ON "Product"("status", "category", "subcategory", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "Product_status_price_idx" ON "Product"("status", "price");

-- CreateIndex
CREATE INDEX "Product_sellerId_status_createdAt_idx" ON "Product"("sellerId", "status", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "Product_status_brand_idx" ON "Product"("status", "brand");

-- CreateIndex
CREATE INDEX "Product_status_featured_publishedAt_idx" ON "Product"("status", "featured", "publishedAt" DESC);

-- CreateIndex
CREATE INDEX "Product_status_publishedAt_idx" ON "Product"("status", "publishedAt" DESC);

-- CreateIndex
CREATE INDEX "Product_status_category_subcategory_publishedAt_idx" ON "Product"("status", "category", "subcategory", "publishedAt" DESC);

-- CreateIndex
CREATE INDEX "Product_sellerId_status_publishedAt_idx" ON "Product"("sellerId", "status", "publishedAt" DESC);

-- CreateIndex
CREATE INDEX "Service_status_featured_createdAt_idx" ON "Service"("status", "featured", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "Service_status_createdAt_idx" ON "Service"("status", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "Service_status_category_subcategory_createdAt_idx" ON "Service"("status", "category", "subcategory", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "Service_status_price_idx" ON "Service"("status", "price");

-- CreateIndex
CREATE INDEX "Service_sellerId_status_createdAt_idx" ON "Service"("sellerId", "status", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "Service_status_featured_publishedAt_idx" ON "Service"("status", "featured", "publishedAt" DESC);

-- CreateIndex
CREATE INDEX "Service_status_publishedAt_idx" ON "Service"("status", "publishedAt" DESC);

-- CreateIndex
CREATE INDEX "Service_status_category_subcategory_publishedAt_idx" ON "Service"("status", "category", "subcategory", "publishedAt" DESC);

-- CreateIndex
CREATE INDEX "Service_sellerId_status_publishedAt_idx" ON "Service"("sellerId", "status", "publishedAt" DESC);

-- AddForeignKey
ALTER TABLE "Favorite" ADD CONSTRAINT "Favorite_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Favorite" ADD CONSTRAINT "Favorite_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
