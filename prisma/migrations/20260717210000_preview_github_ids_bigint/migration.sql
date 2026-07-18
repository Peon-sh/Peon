-- GitHub comment / check-run IDs exceed PostgreSQL INTEGER (e.g. 5007040321).
ALTER TABLE "ServicePreview" ALTER COLUMN "githubCommentId" SET DATA TYPE BIGINT;
ALTER TABLE "ServicePreview" ALTER COLUMN "githubCheckRunId" SET DATA TYPE BIGINT;
