import { beforeEach, describe, expect, it, vi } from 'vitest';

const findManyCredentials = vi.fn();
const findManyModels = vi.fn();
const countCredentials = vi.fn();
const findUniqueCredential = vi.fn();

vi.mock('@/lib/prisma', () => ({
  prisma: {
    workspaceLlmCredential: {
      findMany: (...args: unknown[]) => findManyCredentials(...args),
      findUnique: (...args: unknown[]) => findUniqueCredential(...args),
      count: (...args: unknown[]) => countCredentials(...args),
    },
    chatSupportedModel: {
      findMany: (...args: unknown[]) => findManyModels(...args),
    },
  },
}));

const platformKey = vi.fn<() => string | null>(() => null);
vi.mock('@/lib/env', () => ({
  platformOpenAiApiKey: () => platformKey(),
  serverEnv: () => ({ OPENAI_CHAT_MODEL: 'gpt-5.6-sol' }),
}));

vi.mock('@/lib/crypto/encryption', () => ({
  encrypt: (value: string) => `enc:${value}`,
  decrypt: (value: string) => value.replace(/^enc:/, ''),
}));

import { LlmSettingsService } from '../llm-settings';

describe('LlmSettingsService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    platformKey.mockReturnValue(null);
  });

  describe('with a platform OpenAI key', () => {
    const openaiModels = [
      { provider: 'OPENAI', modelId: 'gpt-5.6-sol', displayName: 'GPT-5.6 Sol', supportsReasoning: true, sortOrder: 10, enabled: true },
      { provider: 'OPENAI', modelId: 'gpt-5.5', displayName: 'GPT-5.5', supportsReasoning: true, sortOrder: 40, enabled: true },
      { provider: 'ANTHROPIC', modelId: 'claude-sonnet-4-5', displayName: 'Claude Sonnet 4.5', supportsReasoning: false, sortOrder: 10, enabled: true },
    ];

    beforeEach(() => {
      platformKey.mockReturnValue('sk-platform');
    });

    it('is ready with only the platform model when the workspace has no key', async () => {
      findManyCredentials.mockResolvedValue([]);
      findManyModels.mockResolvedValue(openaiModels);

      const status = await LlmSettingsService.getChatStatus('ws_1');
      expect(status.ready).toBe(true);
      expect(status.platformManaged).toBe(true);
      expect(status.providersConfigured).toEqual(['openai']);
      expect(status.models.map((m) => m.modelId)).toEqual(['gpt-5.6-sol']);
    });

    it('resolves the platform key for the default model', async () => {
      findManyCredentials.mockResolvedValue([]);
      findManyModels.mockResolvedValue(openaiModels);
      findUniqueCredential.mockResolvedValue(null);

      const resolved = await LlmSettingsService.resolveModelSelection('ws_1');
      expect(resolved).toMatchObject({ provider: 'openai', modelId: 'gpt-5.6-sol', apiKey: 'sk-platform' });
    });

    it('prefers the workspace OpenAI key and its full model list when present', async () => {
      findManyCredentials.mockResolvedValue([{ provider: 'OPENAI', apiKey: 'enc:sk-ws' }]);
      findManyModels.mockResolvedValue(openaiModels);
      findUniqueCredential.mockResolvedValue({ apiKey: 'enc:sk-ws' });

      const status = await LlmSettingsService.getChatStatus('ws_1');
      expect(status.platformManaged).toBe(false);
      expect(status.models.map((m) => m.modelId)).toEqual(['gpt-5.6-sol', 'gpt-5.5']);

      const resolved = await LlmSettingsService.resolveModelSelection('ws_1', { provider: 'openai', modelId: 'gpt-5.5' });
      expect(resolved.apiKey).toBe('sk-ws');
    });
  });

  it('reports chat not ready when no credentials exist', async () => {
    findManyCredentials.mockResolvedValue([]);
    findManyModels.mockResolvedValue([
      {
        provider: 'OPENAI',
        modelId: 'gpt-5.5',
        displayName: 'GPT-5.5',
        supportsReasoning: true,
        sortOrder: 10,
        enabled: true,
      },
    ]);

    const status = await LlmSettingsService.getChatStatus('ws_1');
    expect(status.ready).toBe(false);
    expect(status.models).toEqual([]);
    expect(status.providersConfigured).toEqual([]);
  });

  it('returns only models for configured providers', async () => {
    findManyCredentials.mockResolvedValue([
      { provider: 'OPENAI', apiKey: 'enc:sk-test-abcdef' },
    ]);
    findManyModels.mockResolvedValue([
      {
        provider: 'OPENAI',
        modelId: 'gpt-5.5',
        displayName: 'GPT-5.5',
        supportsReasoning: true,
        sortOrder: 10,
        enabled: true,
      },
      {
        provider: 'ANTHROPIC',
        modelId: 'claude-sonnet-4-5',
        displayName: 'Claude Sonnet 4.5',
        supportsReasoning: false,
        sortOrder: 10,
        enabled: true,
      },
    ]);

    const status = await LlmSettingsService.getChatStatus('ws_1');
    expect(status.ready).toBe(true);
    expect(status.providersConfigured).toEqual(['openai']);
    expect(status.models).toHaveLength(1);
    expect(status.models[0]?.modelId).toBe('gpt-5.5');
  });

  it('resolves default model from first available', async () => {
    findManyCredentials.mockResolvedValue([
      { provider: 'ANTHROPIC', apiKey: 'enc:sk-ant' },
    ]);
    findManyModels.mockResolvedValue([
      {
        provider: 'ANTHROPIC',
        modelId: 'claude-sonnet-4-5',
        displayName: 'Claude Sonnet 4.5',
        supportsReasoning: false,
        sortOrder: 10,
        enabled: true,
      },
    ]);
    findUniqueCredential.mockResolvedValue({ apiKey: 'enc:sk-ant' });

    const resolved = await LlmSettingsService.resolveModelSelection('ws_1');
    expect(resolved).toMatchObject({
      provider: 'anthropic',
      modelId: 'claude-sonnet-4-5',
      apiKey: 'sk-ant',
    });
  });
});
