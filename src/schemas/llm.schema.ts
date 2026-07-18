import { z } from 'zod';

export const llmProviderSchema = z.enum(['openai', 'anthropic']);

export const upsertLlmCredentialSchema = z.object({
  provider: llmProviderSchema,
  apiKey: z.string().min(1).max(500),
});

export const deleteLlmCredentialSchema = z.object({
  provider: llmProviderSchema,
});

export const listLlmModelsQuerySchema = z.object({
  provider: llmProviderSchema.optional(),
});
