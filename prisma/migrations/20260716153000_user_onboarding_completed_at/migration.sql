-- AlterTable
ALTER TABLE "User" ADD COLUMN "onboardingCompletedAt" TIMESTAMP(3);

-- Backfill existing onboarded users (best-effort: use updatedAt as completion proxy)
UPDATE "User"
SET "onboardingCompletedAt" = "updatedAt"
WHERE "isOnboarded" = true AND "onboardingCompletedAt" IS NULL;
