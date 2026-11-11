-- CreateTable
CREATE TABLE IF NOT EXISTS "llm_usage" (
    "day" DATE NOT NULL,
    "owner_id" TEXT NOT NULL,
    "workflow" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "tokens" INTEGER NOT NULL DEFAULT 0,
    "requests" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "llm_usage_pkey" PRIMARY KEY ("day","owner_id","workflow","model")
);
