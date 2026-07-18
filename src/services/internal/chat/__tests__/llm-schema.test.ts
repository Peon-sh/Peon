import { describe, expect, it } from 'vitest';
import { createChatThreadSchema, updateChatThreadSchema } from '@/schemas/chat.schema';
import { upsertLlmCredentialSchema } from '@/schemas/llm.schema';

describe('llm and chat schemas', () => {
  it('accepts credential upsert payloads', () => {
    expect(
      upsertLlmCredentialSchema.parse({
        provider: 'openai',
        apiKey: 'sk-test',
      }),
    ).toEqual({ provider: 'openai', apiKey: 'sk-test' });
  });

  it('accepts create thread with model selection', () => {
    expect(
      createChatThreadSchema.parse({
        workspaceId: 'ws_1',
        modelProvider: 'anthropic',
        modelId: 'claude-sonnet-4-5',
      }),
    ).toMatchObject({
      workspaceId: 'ws_1',
      modelProvider: 'anthropic',
      modelId: 'claude-sonnet-4-5',
    });
  });

  it('requires title or model fields on update', () => {
    expect(() => updateChatThreadSchema.parse({})).toThrow();
    expect(
      updateChatThreadSchema.parse({
        modelProvider: 'openai',
        modelId: 'gpt-5.5',
      }),
    ).toMatchObject({ modelProvider: 'openai', modelId: 'gpt-5.5' });
  });
});
