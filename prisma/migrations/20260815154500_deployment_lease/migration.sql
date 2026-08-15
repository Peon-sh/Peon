-- Single-flight lease so a redelivered SQS deploy job cannot run in parallel
-- with the worker that still holds the original message.
ALTER TABLE "Deployment" ADD COLUMN IF NOT EXISTS "leaseOwner" TEXT;
ALTER TABLE "Deployment" ADD COLUMN IF NOT EXISTS "leaseUntil" TIMESTAMP(3);
