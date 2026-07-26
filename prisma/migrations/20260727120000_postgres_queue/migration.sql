-- Postgres-backed job queue. Removes the hard AWS SQS dependency for
-- self-hosted installations. Existing SQS installations are unaffected:
-- QUEUE_DRIVER continues to resolve to `sqs` whenever SQS URLs are configured.

CREATE TYPE "QueueJobStatus" AS ENUM ('PENDING', 'PROCESSING', 'FAILED', 'COMPLETED');

CREATE TABLE "QueueJob" (
    "id"           TEXT NOT NULL,
    "queue"        TEXT NOT NULL,
    "type"         TEXT NOT NULL,
    "payload"      JSONB NOT NULL,
    "status"       "QueueJobStatus" NOT NULL DEFAULT 'PENDING',
    "attempts"     INTEGER NOT NULL DEFAULT 0,
    "maxAttempts"  INTEGER NOT NULL DEFAULT 5,
    "lastError"    TEXT,
    -- Job is invisible to consumers until this moment. Doubles as the retry
    -- backoff timer and the lease expiry for a crashed worker.
    "visibleAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    -- Set when claimed; used only for diagnostics.
    "claimedAt"    TIMESTAMP(3),
    "claimedBy"    TEXT,
    "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"    TIMESTAMP(3) NOT NULL,
    "completedAt"  TIMESTAMP(3),

    CONSTRAINT "QueueJob_pkey" PRIMARY KEY ("id")
);

-- The claim query's access path: pending/processing rows in one queue ordered
-- by visibility. Partial index keeps completed history out of the hot path.
CREATE INDEX "QueueJob_claim_idx"
    ON "QueueJob" ("queue", "visibleAt")
    WHERE "status" IN ('PENDING', 'PROCESSING');

CREATE INDEX "QueueJob_status_idx" ON "QueueJob" ("status", "createdAt");
