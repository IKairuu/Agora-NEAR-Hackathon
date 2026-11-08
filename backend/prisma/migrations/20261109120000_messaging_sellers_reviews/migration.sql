-- CreateEnum
CREATE TYPE "hire_offer_status" AS ENUM ('sent', 'accepted', 'declined');

-- CreateEnum
CREATE TYPE "message_sender" AS ENUM ('agent', 'owner', 'seller', 'system');

-- CreateEnum
CREATE TYPE "review_run_status" AS ENUM ('queued', 'running', 'done', 'failed');

-- CreateEnum
CREATE TYPE "thumb_kind" AS ENUM ('test', 'contract', 'coverage', 'browser', 'csv', 'upgrade', 'diff', 'audit');

-- CreateEnum
CREATE TYPE "gig_tone" AS ENUM ('night', 'paper', 'grad');

-- CreateEnum
CREATE TYPE "saved_kind" AS ENUM ('service', 'seller');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "job_status" ADD VALUE 'agreed';
ALTER TYPE "job_status" ADD VALUE 'delivered';
ALTER TYPE "job_status" ADD VALUE 'reviewed';
ALTER TYPE "job_status" ADD VALUE 'released';
ALTER TYPE "job_status" ADD VALUE 'expired';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "dispute_status" ADD VALUE 'recheck';
ALTER TYPE "dispute_status" ADD VALUE 'escalated';

-- AlterTable
ALTER TABLE "profiles" ADD COLUMN     "mode" TEXT,
ADD COLUMN     "role" TEXT,
ADD COLUMN     "theme" TEXT;

-- AlterTable
ALTER TABLE "jobs" ADD COLUMN     "service_id" UUID,
ADD COLUMN     "visibility" TEXT NOT NULL DEFAULT 'public';

-- AlterTable
ALTER TABLE "acceptance_specs" ADD COLUMN     "holdout_hash" TEXT;

-- AlterTable
ALTER TABLE "deliveries" ADD COLUMN     "files_touched" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "reason" TEXT,
ADD COLUMN     "verdict" TEXT;

-- AlterTable
ALTER TABLE "reviewer_votes" ADD COLUMN     "review_run_id" UUID;

-- AlterTable
ALTER TABLE "disputes" ADD COLUMN     "bond_amount" DECIMAL(20,6),
ADD COLUMN     "bond_tx" TEXT,
ADD COLUMN     "escalated_at" TIMESTAMPTZ(6);

-- CreateTable
CREATE TABLE "hire_offers" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "job_id" UUID NOT NULL,
    "bid_id" UUID,
    "seller_id" UUID NOT NULL,
    "price" DECIMAL(20,6) NOT NULL,
    "status" "hire_offer_status" NOT NULL DEFAULT 'sent',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "hire_offers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "threads" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "job_id" UUID,
    "buyer_id" UUID NOT NULL,
    "seller_id" UUID,
    "title" TEXT NOT NULL,
    "last_message_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "threads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "messages" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "thread_id" UUID NOT NULL,
    "sender" "message_sender" NOT NULL,
    "sender_profile_id" UUID,
    "body" TEXT NOT NULL,
    "card_type" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "link" TEXT,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "holdouts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "spec_id" UUID NOT NULL,
    "holdout_hash" TEXT NOT NULL,
    "ciphertext" BYTEA NOT NULL,
    "key_id" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "holdouts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "review_runs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "delivery_id" UUID NOT NULL,
    "round" SMALLINT NOT NULL DEFAULT 1,
    "run_id" TEXT,
    "status" "review_run_status" NOT NULL DEFAULT 'queued',
    "exit_code" INTEGER,
    "install_exit" INTEGER,
    "baseline_exit_code" INTEGER,
    "scope_ok" BOOLEAN,
    "changed_files" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "log_hash" TEXT,
    "log_path" TEXT,
    "duration_ms" INTEGER,
    "error" TEXT,
    "result" JSONB,
    "started_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMPTZ(6),

    CONSTRAINT "review_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "council_members" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "dao_account" TEXT NOT NULL,
    "near_account_id" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'council',
    "excluded_for" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "council_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "seller_profiles" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "seller_id" UUID,
    "step" SMALLINT NOT NULL DEFAULT 0,
    "display_name" TEXT,
    "initials" TEXT,
    "country" TEXT,
    "about" TEXT,
    "langs" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "experience" JSONB,
    "github_username" TEXT,
    "skills" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "categories" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "price_from" DECIMAL(20,6),
    "days" SMALLINT,
    "level" TEXT NOT NULL DEFAULT 'New seller',
    "online" BOOLEAN NOT NULL DEFAULT false,
    "stake_tx" TEXT,
    "published_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "seller_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "services" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "seller_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "thumb" "thumb_kind" NOT NULL,
    "tone" "gig_tone" NOT NULL,
    "category" TEXT NOT NULL,
    "from_price" DECIMAL(20,6) NOT NULL,
    "days" SMALLINT NOT NULL,
    "prompt" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "services_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "saved_items" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "kind" "saved_kind" NOT NULL,
    "service_id" UUID,
    "seller_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "saved_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "hire_offers_job_id_idx" ON "hire_offers"("job_id");

-- CreateIndex
CREATE INDEX "hire_offers_seller_id_idx" ON "hire_offers"("seller_id");

-- CreateIndex
CREATE INDEX "threads_buyer_id_idx" ON "threads"("buyer_id");

-- CreateIndex
CREATE INDEX "threads_seller_id_idx" ON "threads"("seller_id");

-- CreateIndex
CREATE INDEX "messages_thread_id_idx" ON "messages"("thread_id");

-- CreateIndex
CREATE INDEX "notifications_user_id_idx" ON "notifications"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "holdouts_spec_id_key" ON "holdouts"("spec_id");

-- CreateIndex
CREATE UNIQUE INDEX "review_runs_delivery_id_round_key" ON "review_runs"("delivery_id", "round");

-- CreateIndex
CREATE UNIQUE INDEX "council_members_dao_account_near_account_id_key" ON "council_members"("dao_account", "near_account_id");

-- CreateIndex
CREATE UNIQUE INDEX "seller_profiles_user_id_key" ON "seller_profiles"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "seller_profiles_seller_id_key" ON "seller_profiles"("seller_id");

-- CreateIndex
CREATE INDEX "services_seller_id_idx" ON "services"("seller_id");

-- CreateIndex
CREATE INDEX "services_category_idx" ON "services"("category");

-- CreateIndex
CREATE UNIQUE INDEX "saved_items_user_id_service_id_key" ON "saved_items"("user_id", "service_id");

-- CreateIndex
CREATE UNIQUE INDEX "saved_items_user_id_seller_id_key" ON "saved_items"("user_id", "seller_id");

-- AddForeignKey
ALTER TABLE "reviewer_votes" ADD CONSTRAINT "reviewer_votes_review_run_id_fkey" FOREIGN KEY ("review_run_id") REFERENCES "review_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hire_offers" ADD CONSTRAINT "hire_offers_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hire_offers" ADD CONSTRAINT "hire_offers_seller_id_fkey" FOREIGN KEY ("seller_id") REFERENCES "sellers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "threads" ADD CONSTRAINT "threads_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "jobs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "threads" ADD CONSTRAINT "threads_buyer_id_fkey" FOREIGN KEY ("buyer_id") REFERENCES "profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "threads" ADD CONSTRAINT "threads_seller_id_fkey" FOREIGN KEY ("seller_id") REFERENCES "sellers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_thread_id_fkey" FOREIGN KEY ("thread_id") REFERENCES "threads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_sender_profile_id_fkey" FOREIGN KEY ("sender_profile_id") REFERENCES "profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "holdouts" ADD CONSTRAINT "holdouts_spec_id_fkey" FOREIGN KEY ("spec_id") REFERENCES "acceptance_specs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_runs" ADD CONSTRAINT "review_runs_delivery_id_fkey" FOREIGN KEY ("delivery_id") REFERENCES "deliveries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "seller_profiles" ADD CONSTRAINT "seller_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "seller_profiles" ADD CONSTRAINT "seller_profiles_seller_id_fkey" FOREIGN KEY ("seller_id") REFERENCES "sellers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "services" ADD CONSTRAINT "services_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "services" ADD CONSTRAINT "services_seller_id_fkey" FOREIGN KEY ("seller_id") REFERENCES "sellers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saved_items" ADD CONSTRAINT "saved_items_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saved_items" ADD CONSTRAINT "saved_items_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "services"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saved_items" ADD CONSTRAINT "saved_items_seller_id_fkey" FOREIGN KEY ("seller_id") REFERENCES "sellers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

