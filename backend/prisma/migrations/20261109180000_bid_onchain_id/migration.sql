-- AlterTable
ALTER TABLE "bids" ADD COLUMN     "onchain_id" BIGINT;

-- CreateIndex
CREATE UNIQUE INDEX "bids_onchain_id_key" ON "bids"("onchain_id");
