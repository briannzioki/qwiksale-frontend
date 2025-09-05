-- AlterTable
ALTER TABLE "public"."Payment" ADD COLUMN     "resultDesc" TEXT;

-- AlterTable
ALTER TABLE "public"."SupportTicket" ADD COLUMN     "clientIp" TEXT,
ADD COLUMN     "referer" TEXT,
ADD COLUMN     "userAgent" TEXT;

-- AlterTable
ALTER TABLE "public"."User" ALTER COLUMN "email" SET DATA TYPE CITEXT,
ALTER COLUMN "username" SET DATA TYPE CITEXT;
