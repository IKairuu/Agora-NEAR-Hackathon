-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "private";

-- CreateEnum
CREATE TYPE "party_kind" AS ENUM ('human', 'agent');

-- CreateEnum
CREATE TYPE "agent_role" AS ENUM ('spec_writer', 'buyer', 'bidding', 'transaction', 'guardian', 'reviewer', 'fraud_lure', 'price_check');

-- CreateEnum
CREATE TYPE "agent_status" AS ENUM ('active', 'paused', 'revoked');

-- CreateEnum
CREATE TYPE "job_status" AS ENUM ('draft', 'open', 'negotiating', 'funded', 'in_progress', 'settled', 'refunded', 'disputed', 'cancelled');

-- CreateEnum
CREATE TYPE "bid_status" AS ENUM ('pending_check', 'live', 'held', 'shortlisted', 'accepted', 'rejected', 'withdrawn');

-- CreateEnum
CREATE TYPE "price_check_result" AS ENUM ('cleared', 'held', 'unverified');

-- CreateEnum
CREATE TYPE "milestone_status" AS ENUM ('pending', 'funded', 'delivered', 'in_review', 'released', 'disputed', 'refunded', 'split');

-- CreateEnum
CREATE TYPE "release_reason" AS ENUM ('two_approvals', 'timeout_no_votes', 'dao_ruling');

-- CreateEnum
CREATE TYPE "delivery_status" AS ENUM ('submitted', 'reviewing', 'approved', 'rejected');

-- CreateEnum
CREATE TYPE "check_weight" AS ENUM ('required', 'advisory');

-- CreateEnum
CREATE TYPE "dispute_status" AS ENUM ('open', 'voting', 'resolved');

-- CreateEnum
CREATE TYPE "dispute_ruling" AS ENUM ('release', 'refund', 'split');

-- CreateEnum
CREATE TYPE "event_severity" AS ENUM ('info', 'ok', 'hold', 'block');

-- CreateEnum
CREATE TYPE "tx_status" AS ENUM ('pending', 'success', 'rejected');

-- CreateTable
CREATE TABLE "categories" (
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("slug")
);

-- CreateTable
CREATE TABLE "profiles" (
    "id" UUID NOT NULL,
    "display_name" TEXT,
    "near_account_id" TEXT,
    "agents_account_id" TEXT,
    "is_business" BOOLEAN NOT NULL DEFAULT false,
    "location" TEXT,
    "bio" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agents" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "owner_id" UUID,
    "role" "agent_role" NOT NULL,
    "label" TEXT NOT NULL,
    "near_account_id" TEXT NOT NULL,
    "public_key" TEXT,
    "allowed_methods" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "model" TEXT,
    "n8n_workflow_id" TEXT,
    "status" "agent_status" NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sellers" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "owner_id" UUID NOT NULL,
    "kind" "party_kind" NOT NULL,
    "agent_id" UUID,
    "near_account_id" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "headline" TEXT,
    "skills" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "categories" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "price_floor" DECIMAL(20,6),
    "max_concurrent_jobs" INTEGER NOT NULL DEFAULT 1,
    "delivery_terms" TEXT,
    "payout_chain" TEXT,
    "payout_address" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sellers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mandates" (
    "owner_id" UUID NOT NULL,
    "per_job_cap" DECIMAL(20,6) NOT NULL,
    "daily_cap" DECIMAL(20,6) NOT NULL,
    "new_seller_cap" DECIMAL(20,6) NOT NULL,
    "review_window_hours" INTEGER NOT NULL,
    "allowed_categories" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "strict_sellers" BOOLEAN NOT NULL DEFAULT false,
    "paused" BOOLEAN NOT NULL DEFAULT false,
    "paused_by" TEXT,
    "paused_at" TIMESTAMPTZ(6),
    "last_tx_hash" TEXT,
    "synced_at" TIMESTAMPTZ(6),

    CONSTRAINT "mandates_pkey" PRIMARY KEY ("owner_id")
);

-- CreateTable
CREATE TABLE "approved_sellers" (
    "owner_id" UUID NOT NULL,
    "seller_id" UUID NOT NULL,
    "added_tx" TEXT,
    "added_at" TIMESTAMPTZ(6),

    CONSTRAINT "approved_sellers_pkey" PRIMARY KEY ("owner_id","seller_id")
);

-- CreateTable
CREATE TABLE "balances" (
    "account_id" TEXT NOT NULL,
    "profile_id" UUID,
    "available" DECIMAL(20,6) NOT NULL DEFAULT 0,
    "escrowed" DECIMAL(20,6) NOT NULL DEFAULT 0,
    "spent_today" DECIMAL(20,6) NOT NULL DEFAULT 0,
    "day_started" TIMESTAMPTZ(6),
    "synced_at" TIMESTAMPTZ(6),

    CONSTRAINT "balances_pkey" PRIMARY KEY ("account_id")
);

-- CreateTable
CREATE TABLE "reputation" (
    "account_id" TEXT NOT NULL,
    "settled_jobs" INTEGER NOT NULL DEFAULT 0,
    "refunded_jobs" INTEGER NOT NULL DEFAULT 0,
    "disputed_jobs" INTEGER NOT NULL DEFAULT 0,
    "settled_volume" DECIMAL(20,6) NOT NULL DEFAULT 0,
    "distinct_buyers" INTEGER NOT NULL DEFAULT 0,
    "first_try_pass_rate" DECIMAL(5,2),
    "synced_at" TIMESTAMPTZ(6),

    CONSTRAINT "reputation_pkey" PRIMARY KEY ("account_id")
);

-- CreateTable
CREATE TABLE "jobs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "ref" TEXT NOT NULL DEFAULT ('J-'::text || nextval('job_ref_seq'::regclass)),
    "onchain_id" BIGINT,
    "buyer_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "repo_url" TEXT,
    "base_commit" TEXT,
    "budget_label" TEXT,
    "budget_max_public" DECIMAL(20,6),
    "deliver_within" interval,
    "status" "job_status" NOT NULL DEFAULT 'draft',
    "accepted_bid_id" UUID,
    "seller_id" UUID,
    "agreed_price" DECIMAL(20,6),
    "posted_tx" TEXT,
    "posted_at" TIMESTAMPTZ(6),
    "search" tsvector,
    "embedding" vector(1536),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "private"."job_limits" (
    "job_id" UUID NOT NULL,
    "max_price_ciphertext" TEXT NOT NULL,
    "key_ref" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "job_limits_pkey" PRIMARY KEY ("job_id")
);

-- CreateTable
CREATE TABLE "acceptance_specs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "job_id" UUID NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "test_command" TEXT NOT NULL,
    "build_command" TEXT,
    "failing_tests" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "allowed_paths" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "test_files" JSONB,
    "spec_hash" TEXT,
    "approved_at" TIMESTAMPTZ(6),
    "locked_at" TIMESTAMPTZ(6),
    "lock_tx" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "acceptance_specs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "spec_checks" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "spec_id" UUID NOT NULL,
    "position" SMALLINT NOT NULL,
    "name" TEXT NOT NULL,
    "how_verified" TEXT NOT NULL,
    "weight" "check_weight" NOT NULL DEFAULT 'required',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "spec_checks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bids" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "job_id" UUID NOT NULL,
    "seller_id" UUID NOT NULL,
    "placed_by_agent_id" UUID,
    "price" DECIMAL(20,6) NOT NULL,
    "delivery_eta" interval,
    "note" TEXT,
    "proposed_milestones" JSONB,
    "status" "bid_status" NOT NULL DEFAULT 'pending_check',
    "price_check" "price_check_result",
    "reference_median" DECIMAL(20,6),
    "reference_sample_size" INTEGER,
    "fraud_score" SMALLINT,
    "hold_reason" TEXT,
    "seller_explanation" TEXT,
    "owner_approved_risk" BOOLEAN NOT NULL DEFAULT false,
    "onchain_tx" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bids_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "risk_assessments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "subject_type" TEXT NOT NULL,
    "subject_id" TEXT NOT NULL,
    "score" SMALLINT NOT NULL,
    "reasons" JSONB,
    "agent_id" UUID,
    "flag_tx" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "risk_assessments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "negotiation_messages" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "job_id" UUID NOT NULL,
    "bid_id" UUID,
    "round" SMALLINT NOT NULL,
    "sender" TEXT NOT NULL,
    "sender_agent_id" UUID,
    "body" TEXT NOT NULL,
    "offered_price" DECIMAL(20,6),
    "attestation" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "negotiation_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "milestones" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "job_id" UUID NOT NULL,
    "idx" SMALLINT NOT NULL,
    "amount" DECIMAL(20,6) NOT NULL,
    "description" TEXT,
    "status" "milestone_status" NOT NULL DEFAULT 'pending',
    "funded_tx" TEXT,
    "funded_at" TIMESTAMPTZ(6),
    "review_deadline" TIMESTAMPTZ(6),
    "release_reason" "release_reason",
    "released_tx" TEXT,
    "released_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "milestones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deliveries" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "milestone_id" UUID NOT NULL,
    "attempt" SMALLINT NOT NULL DEFAULT 1,
    "seller_id" UUID NOT NULL,
    "commit_sha" TEXT NOT NULL,
    "repo_url" TEXT NOT NULL,
    "status" "delivery_status" NOT NULL DEFAULT 'submitted',
    "diff_stats" JSONB,
    "submit_tx" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reviewer_votes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "delivery_id" UUID NOT NULL,
    "reviewer_agent_id" UUID NOT NULL,
    "approve" BOOLEAN NOT NULL,
    "check_results" JSONB,
    "log_hash" TEXT,
    "log_path" TEXT,
    "attestation_hash" TEXT,
    "model" TEXT,
    "duration_ms" INTEGER,
    "vote_tx" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reviewer_votes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "disputes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "milestone_id" UUID NOT NULL,
    "opened_by" UUID NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "dispute_status" NOT NULL DEFAULT 'open',
    "evidence_hash" TEXT,
    "dao_proposal_id" BIGINT,
    "ruling" "dispute_ruling",
    "seller_amount" DECIMAL(20,6),
    "buyer_amount" DECIMAL(20,6),
    "resolve_tx" TEXT,
    "opened_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMPTZ(6),

    CONSTRAINT "disputes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ratings" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "job_id" UUID NOT NULL,
    "rater_id" UUID NOT NULL,
    "ratee_account" TEXT NOT NULL,
    "stars" SMALLINT NOT NULL,
    "comment" TEXT,
    "rating_tx" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ratings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "completion_records" (
    "token_id" TEXT NOT NULL,
    "job_id" UUID NOT NULL,
    "seller_id" UUID NOT NULL,
    "amount" DECIMAL(20,6) NOT NULL,
    "mint_tx" TEXT,
    "minted_at" TIMESTAMPTZ(6),

    CONSTRAINT "completion_records_pkey" PRIMARY KEY ("token_id")
);

-- CreateTable
CREATE TABLE "chain_txs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tx_hash" TEXT,
    "block_height" BIGINT,
    "owner_id" UUID,
    "signer_account" TEXT NOT NULL,
    "signer_public_key" TEXT,
    "method" TEXT NOT NULL,
    "args" JSONB,
    "amount" DECIMAL(20,6),
    "job_id" UUID,
    "status" "tx_status" NOT NULL DEFAULT 'pending',
    "error" TEXT,
    "rejected_by" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chain_txs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_events" (
    "id" BIGSERIAL NOT NULL,
    "owner_id" UUID,
    "agent_id" UUID,
    "job_id" UUID,
    "actor_label" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "severity" "event_severity" NOT NULL DEFAULT 'info',
    "data" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agent_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "guardian_alerts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "owner_id" UUID NOT NULL,
    "trigger" TEXT NOT NULL,
    "details" JSONB,
    "pause_tx" TEXT,
    "resolved_at" TIMESTAMPTZ(6),
    "unpause_tx" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "guardian_alerts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "eval_results" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "run_id" TEXT NOT NULL,
    "pass_mark" TEXT NOT NULL,
    "case_id" TEXT NOT NULL,
    "expected" TEXT,
    "actual" TEXT,
    "passed" BOOLEAN NOT NULL,
    "tx_hash" TEXT,
    "explorer_url" TEXT,
    "details" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "eval_results_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "indexer_cursor" (
    "contract_id" TEXT NOT NULL,
    "last_block" BIGINT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "indexer_cursor_pkey" PRIMARY KEY ("contract_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "profiles_near_account_id_key" ON "profiles"("near_account_id");

-- CreateIndex
CREATE UNIQUE INDEX "profiles_agents_account_id_key" ON "profiles"("agents_account_id");

-- CreateIndex
CREATE INDEX "agents_owner_id_idx" ON "agents"("owner_id");

-- CreateIndex
CREATE UNIQUE INDEX "sellers_near_account_id_key" ON "sellers"("near_account_id");

-- CreateIndex
CREATE INDEX "sellers_owner_id_idx" ON "sellers"("owner_id");

-- CreateIndex
CREATE INDEX "balances_profile_id_idx" ON "balances"("profile_id");

-- CreateIndex
CREATE UNIQUE INDEX "jobs_ref_key" ON "jobs"("ref");

-- CreateIndex
CREATE UNIQUE INDEX "jobs_onchain_id_key" ON "jobs"("onchain_id");

-- CreateIndex
CREATE UNIQUE INDEX "jobs_accepted_bid_id_key" ON "jobs"("accepted_bid_id");

-- CreateIndex
CREATE INDEX "jobs_buyer_id_idx" ON "jobs"("buyer_id");

-- CreateIndex
CREATE INDEX "jobs_status_idx" ON "jobs"("status");

-- CreateIndex
CREATE INDEX "jobs_category_idx" ON "jobs"("category");

-- CreateIndex
CREATE UNIQUE INDEX "acceptance_specs_job_id_version_key" ON "acceptance_specs"("job_id", "version");

-- CreateIndex
CREATE UNIQUE INDEX "spec_checks_spec_id_position_key" ON "spec_checks"("spec_id", "position");

-- CreateIndex
CREATE INDEX "bids_seller_id_idx" ON "bids"("seller_id");

-- CreateIndex
CREATE UNIQUE INDEX "bids_job_id_seller_id_key" ON "bids"("job_id", "seller_id");

-- CreateIndex
CREATE INDEX "risk_assessments_subject_type_subject_id_idx" ON "risk_assessments"("subject_type", "subject_id");

-- CreateIndex
CREATE INDEX "negotiation_messages_job_id_idx" ON "negotiation_messages"("job_id");

-- CreateIndex
CREATE INDEX "negotiation_messages_bid_id_idx" ON "negotiation_messages"("bid_id");

-- CreateIndex
CREATE UNIQUE INDEX "milestones_job_id_idx_key" ON "milestones"("job_id", "idx");

-- CreateIndex
CREATE UNIQUE INDEX "deliveries_milestone_id_attempt_key" ON "deliveries"("milestone_id", "attempt");

-- CreateIndex
CREATE UNIQUE INDEX "reviewer_votes_delivery_id_reviewer_agent_id_key" ON "reviewer_votes"("delivery_id", "reviewer_agent_id");

-- CreateIndex
CREATE INDEX "disputes_milestone_id_idx" ON "disputes"("milestone_id");

-- CreateIndex
CREATE UNIQUE INDEX "ratings_job_id_rater_id_key" ON "ratings"("job_id", "rater_id");

-- CreateIndex
CREATE INDEX "completion_records_job_id_idx" ON "completion_records"("job_id");

-- CreateIndex
CREATE INDEX "completion_records_seller_id_idx" ON "completion_records"("seller_id");

-- CreateIndex
CREATE UNIQUE INDEX "chain_txs_tx_hash_key" ON "chain_txs"("tx_hash");

-- CreateIndex
CREATE INDEX "chain_txs_owner_id_idx" ON "chain_txs"("owner_id");

-- CreateIndex
CREATE INDEX "chain_txs_job_id_idx" ON "chain_txs"("job_id");

-- CreateIndex
CREATE INDEX "agent_events_owner_id_created_at_idx" ON "agent_events"("owner_id", "created_at");

-- CreateIndex
CREATE INDEX "agent_events_job_id_idx" ON "agent_events"("job_id");

-- CreateIndex
CREATE INDEX "guardian_alerts_owner_id_idx" ON "guardian_alerts"("owner_id");

-- CreateIndex
CREATE UNIQUE INDEX "eval_results_run_id_pass_mark_case_id_key" ON "eval_results"("run_id", "pass_mark", "case_id");

-- AddForeignKey
ALTER TABLE "agents" ADD CONSTRAINT "agents_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sellers" ADD CONSTRAINT "sellers_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sellers" ADD CONSTRAINT "sellers_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "agents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mandates" ADD CONSTRAINT "mandates_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approved_sellers" ADD CONSTRAINT "approved_sellers_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approved_sellers" ADD CONSTRAINT "approved_sellers_seller_id_fkey" FOREIGN KEY ("seller_id") REFERENCES "sellers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "balances" ADD CONSTRAINT "balances_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_buyer_id_fkey" FOREIGN KEY ("buyer_id") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_category_fkey" FOREIGN KEY ("category") REFERENCES "categories"("slug") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_seller_id_fkey" FOREIGN KEY ("seller_id") REFERENCES "sellers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_accepted_bid_id_fkey" FOREIGN KEY ("accepted_bid_id") REFERENCES "bids"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "private"."job_limits" ADD CONSTRAINT "job_limits_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "acceptance_specs" ADD CONSTRAINT "acceptance_specs_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "spec_checks" ADD CONSTRAINT "spec_checks_spec_id_fkey" FOREIGN KEY ("spec_id") REFERENCES "acceptance_specs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bids" ADD CONSTRAINT "bids_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bids" ADD CONSTRAINT "bids_seller_id_fkey" FOREIGN KEY ("seller_id") REFERENCES "sellers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bids" ADD CONSTRAINT "bids_placed_by_agent_id_fkey" FOREIGN KEY ("placed_by_agent_id") REFERENCES "agents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "risk_assessments" ADD CONSTRAINT "risk_assessments_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "agents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "negotiation_messages" ADD CONSTRAINT "negotiation_messages_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "negotiation_messages" ADD CONSTRAINT "negotiation_messages_bid_id_fkey" FOREIGN KEY ("bid_id") REFERENCES "bids"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "negotiation_messages" ADD CONSTRAINT "negotiation_messages_sender_agent_id_fkey" FOREIGN KEY ("sender_agent_id") REFERENCES "agents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "milestones" ADD CONSTRAINT "milestones_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deliveries" ADD CONSTRAINT "deliveries_milestone_id_fkey" FOREIGN KEY ("milestone_id") REFERENCES "milestones"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deliveries" ADD CONSTRAINT "deliveries_seller_id_fkey" FOREIGN KEY ("seller_id") REFERENCES "sellers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviewer_votes" ADD CONSTRAINT "reviewer_votes_delivery_id_fkey" FOREIGN KEY ("delivery_id") REFERENCES "deliveries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviewer_votes" ADD CONSTRAINT "reviewer_votes_reviewer_agent_id_fkey" FOREIGN KEY ("reviewer_agent_id") REFERENCES "agents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "disputes" ADD CONSTRAINT "disputes_milestone_id_fkey" FOREIGN KEY ("milestone_id") REFERENCES "milestones"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "disputes" ADD CONSTRAINT "disputes_opened_by_fkey" FOREIGN KEY ("opened_by") REFERENCES "profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ratings" ADD CONSTRAINT "ratings_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ratings" ADD CONSTRAINT "ratings_rater_id_fkey" FOREIGN KEY ("rater_id") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "completion_records" ADD CONSTRAINT "completion_records_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "completion_records" ADD CONSTRAINT "completion_records_seller_id_fkey" FOREIGN KEY ("seller_id") REFERENCES "sellers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chain_txs" ADD CONSTRAINT "chain_txs_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chain_txs" ADD CONSTRAINT "chain_txs_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "jobs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_events" ADD CONSTRAINT "agent_events_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_events" ADD CONSTRAINT "agent_events_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "agents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_events" ADD CONSTRAINT "agent_events_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "jobs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guardian_alerts" ADD CONSTRAINT "guardian_alerts_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
