-- peon-ping-pong agent heartbeat + metrics cache on server settings
ALTER TABLE "ServerSetting" ADD COLUMN IF NOT EXISTS "agentLastSeenAt" TIMESTAMP(3);
ALTER TABLE "ServerSetting" ADD COLUMN IF NOT EXISTS "agentVersion" TEXT;
ALTER TABLE "ServerSetting" ADD COLUMN IF NOT EXISTS "agentHostMetrics" JSONB;
ALTER TABLE "ServerSetting" ADD COLUMN IF NOT EXISTS "agentContainers" JSONB;
