-- First-class local server execution.
--
-- Additive only: every existing row becomes REMOTE, which is exactly the
-- behaviour it had before, so no data migration or backfill is required.

CREATE TYPE "ServerExecutionMode" AS ENUM ('REMOTE', 'LOCAL');

ALTER TABLE "Server"
    ADD COLUMN "executionMode" "ServerExecutionMode" NOT NULL DEFAULT 'REMOTE';

-- A LOCAL server needs no SSH credentials. Existing REMOTE rows are untouched.
