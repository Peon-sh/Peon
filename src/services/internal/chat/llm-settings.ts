import type { LlmProvider } from '@/lib/prisma';
import { prisma } from '@/lib/prisma';
import { decrypt, encrypt } from '@/lib/crypto/encryption';
import { AppError, NotFoundError } from '@/lib/errors';
import { platformOpenAiApiKey, serverEnv } from '@/lib/env';
import type { ChatProviderId } from './providers/types';

export function toPrismaLlmProvider(provider: ChatProviderId): LlmProvider {
  return provider === 'openai' ? 'OPENAI' : 'ANTHROPIC';
}

export function fromPrismaLlmProvider(provider: LlmProvider): ChatProviderId {
  return provider === 'OPENAI' ? 'openai' : 'anthropic';
}

function maskApiKey(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length <= 8) return '••••••••';
  return `${trimmed.slice(0, 3)}…${trimmed.slice(-4)}`;
}

export type LlmCredentialStatus = {
  provider: ChatProviderId;
  configured: boolean;
  keyHint: string | null;
};

export type SupportedModelDto = {
  provider: ChatProviderId;
  modelId: string;
  displayName: string;
  supportsReasoning: boolean;
  sortOrder: number;
};

export type ChatStatusDto = {
  ready: boolean;
  /** True when OpenAI chat runs on the platform key rather than a workspace key. */
  platformManaged: boolean;
  providersConfigured: ChatProviderId[];
  models: SupportedModelDto[];
};

export class LlmSettingsService {
  static async listCredentialsStatus(workspaceId: string): Promise<LlmCredentialStatus[]> {
    const rows = await prisma.workspaceLlmCredential.findMany({
      where: { workspaceId },
    });
    const byProvider = new Map(rows.map((row) => [row.provider, row]));

    return (['openai', 'anthropic'] as const).map((provider) => {
      const row = byProvider.get(toPrismaLlmProvider(provider));
      if (!row) {
        return { provider, configured: false, keyHint: null };
      }
      try {
        return {
          provider,
          configured: true,
          keyHint: maskApiKey(decrypt(row.apiKey)),
        };
      } catch {
        return { provider, configured: true, keyHint: '••••••••' };
      }
    });
  }

  static async upsertCredential(
    workspaceId: string,
    provider: ChatProviderId,
    apiKey: string,
  ): Promise<LlmCredentialStatus> {
    const trimmed = apiKey.trim();
    if (!trimmed) {
      throw new AppError('API key is required', 400, 'LLM_KEY_REQUIRED');
    }

    await prisma.workspaceLlmCredential.upsert({
      where: {
        workspaceId_provider: {
          workspaceId,
          provider: toPrismaLlmProvider(provider),
        },
      },
      create: {
        workspaceId,
        provider: toPrismaLlmProvider(provider),
        apiKey: encrypt(trimmed),
      },
      update: {
        apiKey: encrypt(trimmed),
      },
    });

    const { AuditService } = await import('@/services/internal/audit/audit');
    await AuditService.record({
      workspaceId,
      action: 'llm_credential.upserted',
      resourceType: 'llm_credential',
      resourceName: provider,
      summary: `Upserted LLM credential for ${provider}`,
      metadata: { provider },
    });

    return {
      provider,
      configured: true,
      keyHint: maskApiKey(trimmed),
    };
  }

  static async deleteCredential(workspaceId: string, provider: ChatProviderId) {
    try {
      await prisma.workspaceLlmCredential.delete({
        where: {
          workspaceId_provider: {
            workspaceId,
            provider: toPrismaLlmProvider(provider),
          },
        },
      });
    } catch {
      throw new NotFoundError('LLM credential not found');
    }
    const { AuditService } = await import('@/services/internal/audit/audit');
    await AuditService.record({
      workspaceId,
      action: 'llm_credential.deleted',
      resourceType: 'llm_credential',
      resourceName: provider,
      summary: `Deleted LLM credential for ${provider}`,
      metadata: { provider },
    });
    return { deleted: true };
  }

  static async listSupportedModels(provider?: ChatProviderId): Promise<SupportedModelDto[]> {
    const rows = await prisma.chatSupportedModel.findMany({
      where: {
        enabled: true,
        ...(provider ? { provider: toPrismaLlmProvider(provider) } : {}),
      },
      orderBy: [{ provider: 'asc' }, { sortOrder: 'asc' }],
    });

    return rows.map((row) => ({
      provider: fromPrismaLlmProvider(row.provider),
      modelId: row.modelId,
      displayName: row.displayName,
      supportsReasoning: row.supportsReasoning,
      sortOrder: row.sortOrder,
    }));
  }

  static async getDecryptedApiKey(
    workspaceId: string,
    provider: ChatProviderId,
  ): Promise<string> {
    const row = await prisma.workspaceLlmCredential.findUnique({
      where: {
        workspaceId_provider: {
          workspaceId,
          provider: toPrismaLlmProvider(provider),
        },
      },
    });
    if (row) return decrypt(row.apiKey);
    const platformKey = provider === 'openai' ? platformOpenAiApiKey() : null;
    if (platformKey) return platformKey;
    throw new AppError(
      `${provider} API key is not configured for this workspace`,
      503,
      'CHAT_NOT_CONFIGURED',
    );
  }

  static async assertChatReady(workspaceId: string): Promise<boolean> {
    if (platformOpenAiApiKey()) return true;
    const count = await prisma.workspaceLlmCredential.count({ where: { workspaceId } });
    return count > 0;
  }

  static async getChatStatus(workspaceId: string): Promise<ChatStatusDto> {
    const [credentials, allModels] = await Promise.all([
      this.listCredentialsStatus(workspaceId),
      this.listSupportedModels(),
    ]);
    const providersConfigured = credentials
      .filter((item) => item.configured)
      .map((item) => item.provider);
    const platformManaged = !providersConfigured.includes('openai') && !!platformOpenAiApiKey();
    if (platformManaged) providersConfigured.unshift('openai');
    const configured = new Set(providersConfigured);

    let models = allModels.filter((model) => configured.has(model.provider));
    if (platformManaged) {
      // The platform key serves one model; fall back to the full OpenAI list if it is unknown.
      const platformModelId = serverEnv().OPENAI_CHAT_MODEL;
      const hasPlatformModel = models.some(
        (model) => model.provider === 'openai' && model.modelId === platformModelId,
      );
      if (hasPlatformModel) {
        models = models.filter(
          (model) => model.provider !== 'openai' || model.modelId === platformModelId,
        );
      }
    }

    return {
      ready: providersConfigured.length > 0,
      platformManaged,
      providersConfigured,
      models,
    };
  }

  static async resolveModelSelection(
    workspaceId: string,
    input?: { provider?: ChatProviderId; modelId?: string },
  ): Promise<{
    provider: ChatProviderId;
    modelId: string;
    apiKey: string;
    supportsReasoning: boolean;
  }> {
    const status = await this.getChatStatus(workspaceId);
    if (!status.ready || status.models.length === 0) {
      throw new AppError(
        'Chat is not configured on this instance',
        503,
        'CHAT_NOT_CONFIGURED',
      );
    }

    let provider = input?.provider;
    let modelId = input?.modelId;

    if (provider && modelId) {
      const match = status.models.find(
        (model) => model.provider === provider && model.modelId === modelId,
      );
      if (!match) {
        throw new AppError('Selected model is not available', 400, 'INVALID_CHAT_MODEL');
      }
    } else if (provider) {
      const match = status.models.find((model) => model.provider === provider);
      if (!match) {
        throw new AppError(
          `No models available for ${provider}. Add an API key or pick another provider.`,
          400,
          'INVALID_CHAT_MODEL',
        );
      }
      modelId = match.modelId;
    } else {
      const first = status.models[0]!;
      provider = first.provider;
      modelId = first.modelId;
    }

    const selected = status.models.find(
      (model) => model.provider === provider && model.modelId === modelId,
    );
    if (!selected || !provider || !modelId) {
      throw new AppError('Selected model is not available', 400, 'INVALID_CHAT_MODEL');
    }

    const apiKey = await this.getDecryptedApiKey(workspaceId, provider);
    return {
      provider,
      modelId,
      apiKey,
      supportsReasoning: selected.supportsReasoning,
    };
  }
}
