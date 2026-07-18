import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@ai-sdk/openai', () => ({
  createOpenAI: () => ({
    responses: (modelId: string) => ({ modelId, provider: 'openai.responses' }),
  }),
}));

vi.mock('@ai-sdk/anthropic', () => ({
  createAnthropic: () => (modelId: string) => ({ modelId, provider: 'anthropic' }),
}));

import { resolveLanguageModel } from '../providers/factory';

describe('chat provider factory', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('resolves openai with an injected api key', () => {
    const { model, provider, config } = resolveLanguageModel({
      provider: 'openai',
      modelId: 'gpt-5.6-sol',
      apiKey: 'sk-test',
      supportsReasoning: true,
    });
    expect(config).toMatchObject({ provider: 'openai', modelId: 'gpt-5.6-sol' });
    expect(model).toMatchObject({ modelId: 'gpt-5.6-sol' });
    expect(provider.providerOptions(config)).toEqual({
      openai: {
        reasoningEffort: 'medium',
        reasoningSummary: 'detailed',
      },
    });
  });

  it('resolves anthropic with an injected api key', () => {
    const { model, provider, config } = resolveLanguageModel({
      provider: 'anthropic',
      modelId: 'claude-sonnet-5',
      apiKey: 'sk-ant-test',
    });
    expect(model).toMatchObject({ modelId: 'claude-sonnet-5' });
    expect(provider.id).toBe('anthropic');
    expect(provider.providerOptions(config)).toBeUndefined();
  });

  it('fails closed without an api key', () => {
    expect(() =>
      resolveLanguageModel({
        provider: 'openai',
        modelId: 'gpt-5.6-sol',
        apiKey: '',
      }),
    ).toThrow(/Configure an LLM API key/);
  });

  it('fails closed for unknown provider', () => {
    expect(() =>
      resolveLanguageModel({
        provider: 'unknown' as never,
        modelId: 'x',
        apiKey: 'sk',
      }),
    ).toThrow(/Unknown chat provider/);
  });
});
