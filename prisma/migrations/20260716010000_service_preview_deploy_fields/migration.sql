-- AlterTable
ALTER TABLE "ServicePreview" ADD COLUMN IF NOT EXISTS "headBranch" TEXT;
ALTER TABLE "ServicePreview" ADD COLUMN IF NOT EXISTS "commitSha" TEXT;
ALTER TABLE "ServicePreview" ADD COLUMN IF NOT EXISTS "githubCommentId" INTEGER;
