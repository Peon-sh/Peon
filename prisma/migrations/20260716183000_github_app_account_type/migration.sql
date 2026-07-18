-- GitHub App installation account type (Organization | User) for correct settings URLs
ALTER TABLE "GithubApp" ADD COLUMN IF NOT EXISTS "accountType" TEXT;
