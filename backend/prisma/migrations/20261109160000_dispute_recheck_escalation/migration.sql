-- AlterTable
ALTER TABLE "disputes" ADD COLUMN     "bond_returned" BOOLEAN,
ADD COLUMN     "claim" "dispute_ruling",
ADD COLUMN     "escalated_by" UUID,
ADD COLUMN     "escalator_account" TEXT,
ADD COLUMN     "recheck_at" TIMESTAMPTZ(6),
ADD COLUMN     "recheck_outcome" "dispute_ruling",
ADD COLUMN     "resolved_by" TEXT,
ADD COLUMN     "seller_share_bps" INTEGER;

-- AddForeignKey
ALTER TABLE "disputes" ADD CONSTRAINT "disputes_escalated_by_fkey" FOREIGN KEY ("escalated_by") REFERENCES "profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

