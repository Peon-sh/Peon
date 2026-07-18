-- Allow the same GitHub App installation to be connected in multiple workspaces.
-- Keep each workspace unique by installation id to avoid duplicates inside one workspace.

DROP INDEX IF EXISTS "GithubApp_installationId_key";

CREATE UNIQUE INDEX "GithubApp_workspaceId_installationId_key"
ON "GithubApp"("workspaceId", "installationId");

-- Keep installation-based lookups fast (webhooks/status fanout).
CREATE INDEX IF NOT EXISTS "GithubApp_installationId_idx"
ON "GithubApp"("installationId");
