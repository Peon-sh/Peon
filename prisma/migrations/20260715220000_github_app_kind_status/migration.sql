-- CreateEnum
CREATE TYPE "GithubAppKind" AS ENUM ('CUSTOM', 'PLATFORM');

-- CreateEnum
CREATE TYPE "GithubAppStatus" AS ENUM ('CONNECTED', 'SUSPENDED', 'DISCONNECTED');

-- AlterTable
ALTER TABLE "GithubApp" ADD COLUMN "kind" "GithubAppKind" NOT NULL DEFAULT 'CUSTOM';
ALTER TABLE "GithubApp" ADD COLUMN "status" "GithubAppStatus" NOT NULL DEFAULT 'CONNECTED';

-- CreateIndex
CREATE INDEX "GithubApp_installationId_idx" ON "GithubApp"("installationId");

-- CreateIndex
CREATE INDEX "GithubApp_appId_idx" ON "GithubApp"("appId");
