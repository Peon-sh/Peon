-- Rolling updates: default on for existing service settings; track live container name.
ALTER TABLE "ServiceSetting" ADD COLUMN IF NOT EXISTS "rollingUpdate" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Service" ADD COLUMN IF NOT EXISTS "activeContainerName" TEXT;
