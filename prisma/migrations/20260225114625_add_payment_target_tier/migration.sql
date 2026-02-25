-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "targetTier" "Subscription";

-- CreateIndex
CREATE INDEX "Payment_targetTier_idx" ON "Payment"("targetTier");
