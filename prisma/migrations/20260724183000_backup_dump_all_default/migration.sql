-- Instance-wide dumps are the default for new schedules; flip existing rows too
-- since dumpAll was previously unused (always single-DB dump).
ALTER TABLE "ScheduledBackup" ALTER COLUMN "dumpAll" SET DEFAULT true;
UPDATE "ScheduledBackup" SET "dumpAll" = true;

ALTER TABLE "ScheduledBackupExecution" ADD COLUMN IF NOT EXISTS "dumpAll" BOOLEAN NOT NULL DEFAULT true;
