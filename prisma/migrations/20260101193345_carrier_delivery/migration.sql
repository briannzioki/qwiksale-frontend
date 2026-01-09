-- CreateEnum
CREATE TYPE "CarrierPlanTier" AS ENUM ('BASIC', 'GOLD', 'PLATINUM');

-- CreateEnum
CREATE TYPE "CarrierVerificationStatus" AS ENUM ('UNVERIFIED', 'PENDING', 'VERIFIED', 'REJECTED');

-- CreateEnum
CREATE TYPE "CarrierStatus" AS ENUM ('OFFLINE', 'AVAILABLE', 'ON_TRIP');

-- CreateEnum
CREATE TYPE "CarrierVehicleType" AS ENUM ('BICYCLE', 'MOTORBIKE', 'CAR', 'VAN', 'TRUCK');

-- CreateEnum
CREATE TYPE "DeliveryRequestType" AS ENUM ('DELIVERY', 'CONFIRM_AVAILABILITY');

-- CreateEnum
CREATE TYPE "DeliveryRequestStatus" AS ENUM ('REQUESTED', 'ACCEPTED', 'ON_TRIP', 'COMPLETED', 'CANCELLED');

-- CreateTable
CREATE TABLE "CarrierProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "phone" VARCHAR(20),
    "status" "CarrierStatus" NOT NULL DEFAULT 'OFFLINE',
    "planTier" "CarrierPlanTier" NOT NULL DEFAULT 'BASIC',
    "verificationStatus" "CarrierVerificationStatus" NOT NULL DEFAULT 'UNVERIFIED',
    "bannedAt" TIMESTAMP(3),
    "bannedReason" TEXT,
    "suspendedUntil" TIMESTAMP(3),
    "stationLabel" TEXT,
    "stationLat" DOUBLE PRECISION,
    "stationLng" DOUBLE PRECISION,
    "lastSeenAt" TIMESTAMP(3),
    "lastSeenLat" DOUBLE PRECISION,
    "lastSeenLng" DOUBLE PRECISION,
    "docPhotoKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CarrierProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CarrierVehicle" (
    "id" TEXT NOT NULL,
    "carrierId" TEXT NOT NULL,
    "type" "CarrierVehicleType" NOT NULL,
    "registration" VARCHAR(32),
    "photoKeys" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CarrierVehicle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeliveryRequest" (
    "id" TEXT NOT NULL,
    "type" "DeliveryRequestType" NOT NULL,
    "status" "DeliveryRequestStatus" NOT NULL DEFAULT 'REQUESTED',
    "requesterId" TEXT NOT NULL,
    "carrierId" TEXT,
    "productId" TEXT,
    "pickupLabel" TEXT,
    "pickupLat" DOUBLE PRECISION,
    "pickupLng" DOUBLE PRECISION,
    "dropoffLabel" TEXT,
    "dropoffLat" DOUBLE PRECISION,
    "dropoffLng" DOUBLE PRECISION,
    "contactPhone" VARCHAR(20),
    "note" TEXT,
    "acceptedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "cancelReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeliveryRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CarrierProfile_userId_key" ON "CarrierProfile"("userId");

-- CreateIndex
CREATE INDEX "CarrierProfile_status_idx" ON "CarrierProfile"("status");

-- CreateIndex
CREATE INDEX "CarrierProfile_planTier_idx" ON "CarrierProfile"("planTier");

-- CreateIndex
CREATE INDEX "CarrierProfile_verificationStatus_idx" ON "CarrierProfile"("verificationStatus");

-- CreateIndex
CREATE INDEX "CarrierProfile_bannedAt_idx" ON "CarrierProfile"("bannedAt");

-- CreateIndex
CREATE INDEX "CarrierProfile_suspendedUntil_idx" ON "CarrierProfile"("suspendedUntil");

-- CreateIndex
CREATE INDEX "CarrierProfile_lastSeenAt_idx" ON "CarrierProfile"("lastSeenAt");

-- CreateIndex
CREATE INDEX "CarrierProfile_stationLat_stationLng_idx" ON "CarrierProfile"("stationLat", "stationLng");

-- CreateIndex
CREATE INDEX "CarrierVehicle_carrierId_idx" ON "CarrierVehicle"("carrierId");

-- CreateIndex
CREATE INDEX "CarrierVehicle_type_idx" ON "CarrierVehicle"("type");

-- CreateIndex
CREATE INDEX "DeliveryRequest_status_idx" ON "DeliveryRequest"("status");

-- CreateIndex
CREATE INDEX "DeliveryRequest_type_idx" ON "DeliveryRequest"("type");

-- CreateIndex
CREATE INDEX "DeliveryRequest_requesterId_createdAt_idx" ON "DeliveryRequest"("requesterId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "DeliveryRequest_carrierId_status_createdAt_idx" ON "DeliveryRequest"("carrierId", "status", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "DeliveryRequest_productId_createdAt_idx" ON "DeliveryRequest"("productId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "DeliveryRequest_createdAt_idx" ON "DeliveryRequest"("createdAt" DESC);

-- AddForeignKey
ALTER TABLE "CarrierProfile" ADD CONSTRAINT "CarrierProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CarrierVehicle" ADD CONSTRAINT "CarrierVehicle_carrierId_fkey" FOREIGN KEY ("carrierId") REFERENCES "CarrierProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryRequest" ADD CONSTRAINT "DeliveryRequest_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryRequest" ADD CONSTRAINT "DeliveryRequest_carrierId_fkey" FOREIGN KEY ("carrierId") REFERENCES "CarrierProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryRequest" ADD CONSTRAINT "DeliveryRequest_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;
