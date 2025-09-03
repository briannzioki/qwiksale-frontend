/*
  Warnings:

  - You are about to drop the column `address` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `city` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `country` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `emailVerified` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `passwordHash` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `phone` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `phoneVerified` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `postalCode` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `verified` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `whatsapp` on the `User` table. All the data in the column will be lost.
  - The `subscription` column on the `User` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - A unique constraint covering the columns `[referralCode]` on the table `User` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "public"."Subscription" AS ENUM ('FREE', 'GOLD', 'PLATINUM');

-- CreateEnum
CREATE TYPE "public"."Role" AS ENUM ('USER', 'MODERATOR', 'ADMIN');

-- CreateEnum
CREATE TYPE "public"."TicketType" AS ENUM ('CONTACT', 'BUG', 'REPORT_LISTING', 'REPORT_USER', 'OTHER');

-- CreateEnum
CREATE TYPE "public"."TicketStatus" AS ENUM ('OPEN', 'IN_REVIEW', 'RESOLVED', 'CLOSED');

-- DropIndex
DROP INDEX "public"."User_createdAt_idx";

-- DropIndex
DROP INDEX "public"."User_phone_key";

-- AlterTable
ALTER TABLE "public"."Payment" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "public"."Product" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "public"."User" DROP COLUMN "address",
DROP COLUMN "city",
DROP COLUMN "country",
DROP COLUMN "emailVerified",
DROP COLUMN "passwordHash",
DROP COLUMN "phone",
DROP COLUMN "phoneVerified",
DROP COLUMN "postalCode",
DROP COLUMN "verified",
DROP COLUMN "whatsapp",
ADD COLUMN     "referralCode" TEXT,
ADD COLUMN     "referralQualified" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "referredById" TEXT,
ADD COLUMN     "role" "public"."Role" NOT NULL DEFAULT 'USER',
ADD COLUMN     "subscriptionUntil" TIMESTAMP(3),
ALTER COLUMN "email" SET DATA TYPE TEXT,
DROP COLUMN "subscription",
ADD COLUMN     "subscription" "public"."Subscription" NOT NULL DEFAULT 'FREE',
ALTER COLUMN "updatedAt" DROP DEFAULT,
ALTER COLUMN "username" SET DATA TYPE TEXT;

-- DropEnum
DROP TYPE "public"."SubscriptionTier";

-- CreateTable
CREATE TABLE "public"."Referral" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "inviterId" TEXT NOT NULL,
    "inviteeId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "qualifiedAt" TIMESTAMP(3),

    CONSTRAINT "Referral_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."SupportTicket" (
    "id" TEXT NOT NULL,
    "type" "public"."TicketType" NOT NULL DEFAULT 'CONTACT',
    "status" "public"."TicketStatus" NOT NULL DEFAULT 'OPEN',
    "name" TEXT,
    "email" TEXT,
    "subject" TEXT,
    "message" TEXT NOT NULL,
    "url" TEXT,
    "productId" TEXT,
    "reporterId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupportTicket_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Referral_inviteeId_key" ON "public"."Referral"("inviteeId");

-- CreateIndex
CREATE INDEX "Referral_code_idx" ON "public"."Referral"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Referral_inviterId_inviteeId_key" ON "public"."Referral"("inviterId", "inviteeId");

-- CreateIndex
CREATE INDEX "SupportTicket_type_createdAt_idx" ON "public"."SupportTicket"("type", "createdAt");

-- CreateIndex
CREATE INDEX "SupportTicket_status_createdAt_idx" ON "public"."SupportTicket"("status", "createdAt");

-- CreateIndex
CREATE INDEX "SupportTicket_productId_createdAt_idx" ON "public"."SupportTicket"("productId", "createdAt");

-- CreateIndex
CREATE INDEX "SupportTicket_reporterId_createdAt_idx" ON "public"."SupportTicket"("reporterId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "User_referralCode_key" ON "public"."User"("referralCode");

-- AddForeignKey
ALTER TABLE "public"."User" ADD CONSTRAINT "User_referredById_fkey" FOREIGN KEY ("referredById") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Referral" ADD CONSTRAINT "Referral_inviterId_fkey" FOREIGN KEY ("inviterId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Referral" ADD CONSTRAINT "Referral_inviteeId_fkey" FOREIGN KEY ("inviteeId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SupportTicket" ADD CONSTRAINT "SupportTicket_productId_fkey" FOREIGN KEY ("productId") REFERENCES "public"."Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SupportTicket" ADD CONSTRAINT "SupportTicket_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
