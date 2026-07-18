-- AlterTable
CREATE TYPE "AuditActorType" AS ENUM ('USER', 'SYSTEM', 'WEBHOOK', 'TOKEN');

-- CreateTable
CREATE TABLE "WorkspaceAuditLog" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT,
    "actorUserId" TEXT,
    "actorType" "AuditActorType" NOT NULL DEFAULT 'USER',
    "actorRole" "WorkspaceRole",
    "action" TEXT NOT NULL,
    "resourceType" TEXT NOT NULL,
    "resourceId" TEXT,
    "resourceName" TEXT,
    "summary" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkspaceAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WorkspaceAuditLog_workspaceId_createdAt_idx" ON "WorkspaceAuditLog"("workspaceId", "createdAt");

-- CreateIndex
CREATE INDEX "WorkspaceAuditLog_workspaceId_action_idx" ON "WorkspaceAuditLog"("workspaceId", "action");

-- CreateIndex
CREATE INDEX "WorkspaceAuditLog_workspaceId_actorUserId_idx" ON "WorkspaceAuditLog"("workspaceId", "actorUserId");

-- CreateIndex
CREATE INDEX "WorkspaceAuditLog_workspaceId_resourceType_idx" ON "WorkspaceAuditLog"("workspaceId", "resourceType");

-- AddForeignKey
ALTER TABLE "WorkspaceAuditLog" ADD CONSTRAINT "WorkspaceAuditLog_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkspaceAuditLog" ADD CONSTRAINT "WorkspaceAuditLog_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill: ensure a single OWNER per workspace (keep Workspace.ownerId as OWNER).
UPDATE "WorkspaceMembership" AS wm
SET "role" = 'ADMIN'
WHERE wm."role" = 'OWNER'
  AND wm."userId" <> (
    SELECT w."ownerId" FROM "Workspace" w WHERE w."id" = wm."workspaceId"
  );

-- Ensure ownerId user has OWNER membership when missing.
INSERT INTO "WorkspaceMembership" ("id", "workspaceId", "userId", "role", "createdAt", "updatedAt")
SELECT
  'bfill_' || substr(md5(w."id" || w."ownerId"), 1, 20),
  w."id",
  w."ownerId",
  'OWNER',
  NOW(),
  NOW()
FROM "Workspace" w
WHERE NOT EXISTS (
  SELECT 1 FROM "WorkspaceMembership" m
  WHERE m."workspaceId" = w."id" AND m."userId" = w."ownerId"
);

UPDATE "WorkspaceMembership" AS wm
SET "role" = 'OWNER'
FROM "Workspace" w
WHERE wm."workspaceId" = w."id"
  AND wm."userId" = w."ownerId"
  AND wm."role" <> 'OWNER';
