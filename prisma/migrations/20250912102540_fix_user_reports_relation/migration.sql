-- CreateEnum
CREATE TYPE "public"."RateType" AS ENUM ('hour', 'day', 'fixed');

-- CreateEnum
CREATE TYPE "public"."ReportListingType" AS ENUM ('product', 'service');

-- CreateEnum
CREATE TYPE "public"."ReportReason" AS ENUM ('scam', 'prohibited', 'spam', 'wrong_category', 'counterfeit', 'offensive', 'other');

-- AlterTable
ALTER TABLE "public"."User" ADD COLUMN     "location" TEXT,
ADD COLUMN     "rating" DOUBLE PRECISION,
ADD COLUMN     "sales" INTEGER;

-- CreateTable
CREATE TABLE "public"."Service" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT NOT NULL,
    "subcategory" TEXT,
    "price" INTEGER,
    "rateType" "public"."RateType" NOT NULL DEFAULT 'fixed',
    "serviceArea" TEXT,
    "availability" TEXT,
    "image" TEXT,
    "gallery" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "location" TEXT,
    "status" "public"."ProductStatus" NOT NULL DEFAULT 'ACTIVE',
    "featured" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "sellerId" TEXT,
    "sellerName" TEXT,
    "sellerPhone" TEXT,
    "sellerLocation" TEXT,
    "sellerMemberSince" TEXT,
    "sellerRating" DOUBLE PRECISION,
    "sellerSales" INTEGER,

    CONSTRAINT "Service_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Report" (
    "id" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "listingType" "public"."ReportListingType" NOT NULL,
    "reason" "public"."ReportReason" NOT NULL,
    "details" TEXT,
    "ip" TEXT,
    "userId" TEXT,
    "resolved" BOOLEAN NOT NULL DEFAULT false,
    "resolvedById" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Report_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Service_status_featured_createdAt_idx" ON "public"."Service"("status", "featured", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "Service_status_createdAt_idx" ON "public"."Service"("status", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "Service_status_category_subcategory_createdAt_idx" ON "public"."Service"("status", "category", "subcategory", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "Service_status_price_idx" ON "public"."Service"("status", "price");

-- CreateIndex
CREATE INDEX "Service_sellerId_status_createdAt_idx" ON "public"."Service"("sellerId", "status", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "Report_createdAt_idx" ON "public"."Report"("createdAt");

-- CreateIndex
CREATE INDEX "Report_listingType_listingId_idx" ON "public"."Report"("listingType", "listingId");

-- CreateIndex
CREATE INDEX "Report_resolved_createdAt_idx" ON "public"."Report"("resolved", "createdAt");

-- CreateIndex
CREATE INDEX "Report_userId_idx" ON "public"."Report"("userId");

-- AddForeignKey
ALTER TABLE "public"."Service" ADD CONSTRAINT "Service_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Report" ADD CONSTRAINT "Report_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
