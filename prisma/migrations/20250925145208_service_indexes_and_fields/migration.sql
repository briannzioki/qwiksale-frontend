-- AlterTable
ALTER TABLE "public"."Product" ADD COLUMN     "dedupeKey" VARCHAR(64),
ADD COLUMN     "publishedAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "public"."Service" ADD COLUMN     "publishedAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP;

-- CreateIndex
CREATE INDEX "Product_status_featured_publishedAt_idx" ON "public"."Product"("status", "featured", "publishedAt" DESC);

-- CreateIndex
CREATE INDEX "Product_status_publishedAt_idx" ON "public"."Product"("status", "publishedAt" DESC);

-- CreateIndex
CREATE INDEX "Product_status_category_subcategory_publishedAt_idx" ON "public"."Product"("status", "category", "subcategory", "publishedAt" DESC);

-- CreateIndex
CREATE INDEX "Product_sellerId_status_publishedAt_idx" ON "public"."Product"("sellerId", "status", "publishedAt" DESC);

-- CreateIndex
CREATE INDEX "Product_sellerId_dedupeKey_createdAt_idx" ON "public"."Product"("sellerId", "dedupeKey", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "Service_status_featured_publishedAt_idx" ON "public"."Service"("status", "featured", "publishedAt" DESC);

-- CreateIndex
CREATE INDEX "Service_status_publishedAt_idx" ON "public"."Service"("status", "publishedAt" DESC);

-- CreateIndex
CREATE INDEX "Service_status_category_subcategory_publishedAt_idx" ON "public"."Service"("status", "category", "subcategory", "publishedAt" DESC);

-- CreateIndex
CREATE INDEX "Service_sellerId_status_publishedAt_idx" ON "public"."Service"("sellerId", "status", "publishedAt" DESC);
