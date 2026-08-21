-- AlterEnum
-- Safe inside the migration transaction on PostgreSQL 12+: the new value is added
-- but not used until this transaction commits.
ALTER TYPE "ServiceStatus" ADD VALUE 'SUSPENDED';

-- AlterTable
ALTER TABLE "Service" ADD COLUMN     "suspendedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Service_suspendedAt_idx" ON "Service"("suspendedAt");
