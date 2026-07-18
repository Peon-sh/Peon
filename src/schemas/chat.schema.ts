import { z } from 'zod';
import { llmProviderSchema } from '@/schemas/llm.schema';

export const createChatThreadSchema = z.object({
  workspaceId: z.string().min(1),
  title: z.string().min(1).max(200).optional(),
  modelProvider: llmProviderSchema.optional(),
  modelId: z.string().min(1).max(120).optional(),
});

export const updateChatThreadSchema = z
  .object({
    title: z.string().min(1).max(200).optional(),
    modelProvider: llmProviderSchema.optional(),
    modelId: z.string().min(1).max(120).optional(),
  })
  .refine(
    (value) =>
      value.title !== undefined ||
      (value.modelProvider !== undefined && value.modelId !== undefined),
    { message: 'Provide title and/or modelProvider+modelId' },
  );

export const chatApprovalSchema = z.object({
  approvalId: z.string().min(1),
  toolCallId: z.string().min(1).optional(),
  threadId: z.string().min(1).optional(),
  approved: z.boolean(),
  reason: z.string().max(500).optional(),
});

export const listChatThreadsQuerySchema = z.object({
  workspaceId: z.string().min(1),
});
