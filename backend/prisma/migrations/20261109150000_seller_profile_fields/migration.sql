ALTER TABLE "seller_profiles" ADD COLUMN "headline" TEXT;
ALTER TABLE "seller_profiles" ADD COLUMN "coder" TEXT NOT NULL DEFAULT 'me';
ALTER TABLE "seller_profiles" ADD COLUMN "agent_name" TEXT;
ALTER TABLE "seller_profiles" ADD COLUMN "agent_model" TEXT;
ALTER TABLE "seller_profiles" ADD COLUMN "max_jobs" SMALLINT;
ALTER TABLE "seller_profiles" ADD COLUMN "delivery_terms" TEXT;
ALTER TABLE "seller_profiles" ADD COLUMN "payout_chain" TEXT;
ALTER TABLE "seller_profiles" ADD COLUMN "payout_address" TEXT;
