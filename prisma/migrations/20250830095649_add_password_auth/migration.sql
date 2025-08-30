-- AlterTable
ALTER TABLE "public"."User" ADD COLUMN     "address" TEXT,
ADD COLUMN     "city" TEXT,
ADD COLUMN     "country" TEXT,
ADD COLUMN     "passwordHash" TEXT,
ADD COLUMN     "postalCode" TEXT,
ADD COLUMN     "whatsapp" VARCHAR(15);
