-- AlterTable
ALTER TABLE "SupportTicket" ADD COLUMN     "contentHash" CHAR(64),
ADD COLUMN     "serviceId" TEXT;

-- CreateIndex
CREATE INDEX "SupportTicket_serviceId_createdAt_idx" ON "SupportTicket"("serviceId", "createdAt");

-- CreateIndex
CREATE INDEX "SupportTicket_email_createdAt_idx" ON "SupportTicket"("email", "createdAt");

-- CreateIndex
CREATE INDEX "SupportTicket_contentHash_createdAt_idx" ON "SupportTicket"("contentHash", "createdAt");

-- AddForeignKey
ALTER TABLE "SupportTicket" ADD CONSTRAINT "SupportTicket_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE SET NULL ON UPDATE CASCADE;
