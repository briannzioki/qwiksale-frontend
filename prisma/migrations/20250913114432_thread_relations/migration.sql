-- CreateEnum
CREATE TYPE "public"."ListingType" AS ENUM ('product', 'service');

-- CreateTable
CREATE TABLE "public"."Thread" (
    "id" TEXT NOT NULL,
    "listingType" "public"."ListingType" NOT NULL,
    "listingId" TEXT NOT NULL,
    "buyerId" TEXT NOT NULL,
    "sellerId" TEXT NOT NULL,
    "buyerHidden" BOOLEAN NOT NULL DEFAULT false,
    "sellerHidden" BOOLEAN NOT NULL DEFAULT false,
    "lastMessageAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "buyerLastReadAt" TIMESTAMP(3),
    "sellerLastReadAt" TIMESTAMP(3),

    CONSTRAINT "Thread_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Message" (
    "id" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),
    "readAt" TIMESTAMP(3),

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Review" (
    "id" TEXT NOT NULL,
    "raterId" TEXT NOT NULL,
    "rateeId" TEXT NOT NULL,
    "listingId" TEXT,
    "rating" INTEGER NOT NULL,
    "text" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Review_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Thread_buyerId_lastMessageAt_idx" ON "public"."Thread"("buyerId", "lastMessageAt" DESC);

-- CreateIndex
CREATE INDEX "Thread_sellerId_lastMessageAt_idx" ON "public"."Thread"("sellerId", "lastMessageAt" DESC);

-- CreateIndex
CREATE INDEX "Thread_listingType_listingId_idx" ON "public"."Thread"("listingType", "listingId");

-- CreateIndex
CREATE UNIQUE INDEX "Thread_listingType_listingId_buyerId_sellerId_key" ON "public"."Thread"("listingType", "listingId", "buyerId", "sellerId");

-- CreateIndex
CREATE INDEX "Message_threadId_createdAt_idx" ON "public"."Message"("threadId", "createdAt");

-- CreateIndex
CREATE INDEX "Message_senderId_createdAt_idx" ON "public"."Message"("senderId", "createdAt");

-- CreateIndex
CREATE INDEX "Review_rateeId_idx" ON "public"."Review"("rateeId");

-- CreateIndex
CREATE INDEX "Review_raterId_idx" ON "public"."Review"("raterId");

-- CreateIndex
CREATE INDEX "Review_listingId_idx" ON "public"."Review"("listingId");

-- AddForeignKey
ALTER TABLE "public"."Thread" ADD CONSTRAINT "Thread_buyerId_fkey" FOREIGN KEY ("buyerId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Thread" ADD CONSTRAINT "Thread_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Message" ADD CONSTRAINT "Message_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "public"."Thread"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Message" ADD CONSTRAINT "Message_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Review" ADD CONSTRAINT "Review_raterId_fkey" FOREIGN KEY ("raterId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Review" ADD CONSTRAINT "Review_rateeId_fkey" FOREIGN KEY ("rateeId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
