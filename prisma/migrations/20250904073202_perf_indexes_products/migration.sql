-- DropIndex
DROP INDEX "public"."Product_brand_idx";

-- DropIndex
DROP INDEX "public"."Product_category_subcategory_idx";

-- DropIndex
DROP INDEX "public"."Product_createdAt_idx";

-- DropIndex
DROP INDEX "public"."Product_featured_idx";

-- DropIndex
DROP INDEX "public"."Product_price_idx";

-- DropIndex
DROP INDEX "public"."Product_sellerId_createdAt_idx";

-- CreateIndex
CREATE INDEX "Product_status_featured_createdAt_idx" ON "public"."Product"("status", "featured", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "Product_status_createdAt_idx" ON "public"."Product"("status", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "Product_status_category_subcategory_createdAt_idx" ON "public"."Product"("status", "category", "subcategory", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "Product_status_price_idx" ON "public"."Product"("status", "price");

-- CreateIndex
CREATE INDEX "Product_sellerId_status_createdAt_idx" ON "public"."Product"("sellerId", "status", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "Product_status_brand_idx" ON "public"."Product"("status", "brand");
