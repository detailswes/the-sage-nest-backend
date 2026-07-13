-- AlterTable
ALTER TABLE "Service" ADD COLUMN     "webflow_sync_error" TEXT;

-- CreateEnum
CREATE TYPE "WebflowSyncFailureStatus" AS ENUM ('PENDING_RETRY', 'RESOLVED');

-- CreateTable
CREATE TABLE "WebflowSyncFailure" (
    "id" SERIAL NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" INTEGER NOT NULL,
    "idempotency_key" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "last_error" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "status" "WebflowSyncFailureStatus" NOT NULL DEFAULT 'PENDING_RETRY',
    "alerted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WebflowSyncFailure_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WebflowSyncFailure_idempotency_key_key" ON "WebflowSyncFailure"("idempotency_key");

-- CreateIndex
CREATE INDEX "WebflowSyncFailure_status_idx" ON "WebflowSyncFailure"("status");
