-- AlterTable
ALTER TABLE "Service" ADD COLUMN "repositoryProjectId" INTEGER;

-- CreateIndex
CREATE INDEX "Service_githubAppId_repositoryProjectId_idx" ON "Service"("githubAppId", "repositoryProjectId");
