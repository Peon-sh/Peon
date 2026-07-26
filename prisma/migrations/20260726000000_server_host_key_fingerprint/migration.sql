-- AlterTable
-- Existing servers start NULL: the fingerprint is recorded on the next successful connection.
ALTER TABLE "Server" ADD COLUMN IF NOT EXISTS "hostKeyFingerprint" TEXT;
