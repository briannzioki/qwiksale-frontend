-- CreateEnum
CREATE TYPE "RequestKind" AS ENUM ('product', 'service');

-- CreateEnum
CREATE TYPE "RequestStatus" AS ENUM ('ACTIVE', 'HIDDEN', 'CLOSED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "RequestContactMode" AS ENUM ('chat', 'phone', 'whatsapp');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "requestActiveLimitOverride" INTEGER,
ADD COLUMN     "requestBanReason" TEXT,
ADD COLUMN     "requestBannedUntil" TIMESTAMP(3),
ADD COLUMN     "requestDailyLimitOverride" INTEGER;

-- CreateTable
CREATE TABLE "Request" (
    "id" TEXT NOT NULL,
    "kind" "RequestKind" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "location" TEXT,
    "category" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" "RequestStatus" NOT NULL DEFAULT 'ACTIVE',
    "contactEnabled" BOOLEAN NOT NULL DEFAULT true,
    "contactMode" "RequestContactMode" NOT NULL DEFAULT 'chat',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "boostUntil" TIMESTAMP(3),
    "ownerId" TEXT NOT NULL,

    CONSTRAINT "Request_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Request_expiresAt_idx" ON "Request"("expiresAt");

-- CreateIndex
CREATE INDEX "Request_boostUntil_idx" ON "Request"("boostUntil");

-- CreateIndex
CREATE INDEX "Request_createdAt_idx" ON "Request"("createdAt" DESC);

-- CreateIndex
CREATE INDEX "Request_kind_idx" ON "Request"("kind");

-- CreateIndex
CREATE INDEX "Request_category_idx" ON "Request"("category");

-- CreateIndex
CREATE INDEX "Request_status_idx" ON "Request"("status");

-- CreateIndex
CREATE INDEX "Request_ownerId_createdAt_idx" ON "Request"("ownerId", "createdAt" DESC);

-- AddForeignKey
ALTER TABLE "Request" ADD CONSTRAINT "Request_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
