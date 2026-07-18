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

vi.mock('@/lib/crypto/encryption', () => ({
  encrypt: (value: string) => `enc:${value}`,
  decrypt: (value: string) => value.replace(/^enc:/, ''),
}));

import { LlmSettingsService } from '../llm-settings';

describe('LlmSettingsService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
