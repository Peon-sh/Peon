-- CreateEnum
CREATE TYPE "LlmProvider" AS ENUM ('OPENAI', 'ANTHROPIC');

-- CreateTable
CREATE TABLE "WorkspaceLlmCredential" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "provider" "LlmProvider" NOT NULL,
    "apiKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkspaceLlmCredential_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatSupportedModel" (
    "id" TEXT NOT NULL,
    "provider" "LlmProvider" NOT NULL,
    "modelId" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "supportsReasoning" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "ChatSupportedModel_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WorkspaceLlmCredential_workspaceId_idx" ON "WorkspaceLlmCredential"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "WorkspaceLlmCredential_workspaceId_provider_key" ON "WorkspaceLlmCredential"("workspaceId", "provider");

-- CreateIndex
CREATE INDEX "ChatSupportedModel_provider_enabled_sortOrder_idx" ON "ChatSupportedModel"("provider", "enabled", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "ChatSupportedModel_provider_modelId_key" ON "ChatSupportedModel"("provider", "modelId");

-- AddForeignKey
ALTER TABLE "WorkspaceLlmCredential" ADD CONSTRAINT "WorkspaceLlmCredential_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Seed supported models (catalog synced with prisma/seed.ts)
-- OpenAI: https://developers.openai.com/api/docs/models
-- Anthropic: https://platform.claude.com/docs/en/about-claude/models/overview
INSERT INTO "ChatSupportedModel" ("id", "provider", "modelId", "displayName", "enabled", "sortOrder", "supportsReasoning") VALUES
  ('csm_openai_gpt56_sol', 'OPENAI', 'gpt-5.6-sol', 'GPT-5.6 Sol', true, 10, true),
  ('csm_openai_gpt56_terra', 'OPENAI', 'gpt-5.6-terra', 'GPT-5.6 Terra', true, 20, true),
  ('csm_openai_gpt56_luna', 'OPENAI', 'gpt-5.6-luna', 'GPT-5.6 Luna', true, 30, true),
  ('csm_openai_gpt55', 'OPENAI', 'gpt-5.5', 'GPT-5.5', true, 40, true),
  ('csm_anthropic_fable5', 'ANTHROPIC', 'claude-fable-5', 'Claude Fable 5', true, 10, true),
  ('csm_anthropic_opus48', 'ANTHROPIC', 'claude-opus-4-8', 'Claude Opus 4.8', true, 20, true),
  ('csm_anthropic_sonnet5', 'ANTHROPIC', 'claude-sonnet-5', 'Claude Sonnet 5', true, 30, true);
