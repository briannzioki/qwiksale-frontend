-- CreateTable
CREATE TABLE "ServiceContactReveal" (
    "id" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "viewerUserId" TEXT,
    "ip" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ServiceContactReveal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ServiceContactReveal_serviceId_createdAt_idx" ON "ServiceContactReveal"("serviceId", "createdAt");

-- CreateIndex
CREATE INDEX "ServiceContactReveal_viewerUserId_createdAt_idx" ON "ServiceContactReveal"("viewerUserId", "createdAt");

-- CreateIndex
CREATE INDEX "ServiceContactReveal_ip_createdAt_idx" ON "ServiceContactReveal"("ip", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ServiceContactReveal_serviceId_viewerUserId_key" ON "ServiceContactReveal"("serviceId", "viewerUserId");

-- AddForeignKey
ALTER TABLE "ServiceContactReveal" ADD CONSTRAINT "ServiceContactReveal_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE CASCADE ON UPDATE CASCADE;
