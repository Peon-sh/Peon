-- Prefer PLATFORM rows when the same installationId was duplicated (legacy
-- custom + platform connect). Reassign services, then drop extras.
WITH ranked AS (
  SELECT
    id,
    "installationId",
    ROW_NUMBER() OVER (
      PARTITION BY "installationId"
      ORDER BY
        CASE WHEN kind = 'PLATFORM' THEN 0 ELSE 1 END,
        "updatedAt" DESC
    ) AS rn
  FROM "GithubApp"
  WHERE "installationId" IS NOT NULL
),
keepers AS (
  SELECT id, "installationId" FROM ranked WHERE rn = 1
),
dups AS (
  SELECT r.id AS dup_id, k.id AS keeper_id
  FROM ranked r
  JOIN keepers k ON k."installationId" = r."installationId"
  WHERE r.rn > 1
)
UPDATE "Service" s
SET "githubAppId" = d.keeper_id
FROM dups d
WHERE s."githubAppId" = d.dup_id;

WITH ranked AS (
  SELECT
    id,
    "installationId",
    ROW_NUMBER() OVER (
      PARTITION BY "installationId"
      ORDER BY
        CASE WHEN kind = 'PLATFORM' THEN 0 ELSE 1 END,
        "updatedAt" DESC
    ) AS rn
  FROM "GithubApp"
  WHERE "installationId" IS NOT NULL
)
DELETE FROM "GithubApp"
WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

-- Drop non-unique index replaced by a unique constraint (nullable installationId
-- still allows many CUSTOM rows without an install).
DROP INDEX IF EXISTS "GithubApp_installationId_idx";

-- One installation ID → one GithubApp row (multi-org = multiple PLATFORM rows).
CREATE UNIQUE INDEX "GithubApp_installationId_key" ON "GithubApp"("installationId");
