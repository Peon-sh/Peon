import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  isStepCount,
  streamText,
  type UIMessage,
} from 'ai';
import type { User } from '@/lib/prisma';
import { prisma } from '@/lib/prisma';
import { createMcpAccess } from '@/lib/mcp/access';
import { toAiSdkTools } from '@/lib/mcp/adapters/ai-sdk';
import { assembleAllTools } from '@/lib/mcp/catalog';
import { needsChatApproval } from '@/lib/mcp/catalog/classify';
import type { CatalogTool } from '@/lib/mcp/catalog/types';
import { AppError } from '@/lib/errors';
import { ChatService } from './chat';
import { LlmSettingsService } from './llm-settings';
import { takeRecentMessages } from './message-window';
import { createPresentVisualTool } from './present-visual';
import { createLookupUserManualTool } from './lookup-user-manual';
import { resolveLanguageModel } from './providers/factory';
import type { ChatProviderId } from './providers/types';
import { PEON_CHAT_SYSTEM_PROMPT } from './system-prompt';

const CHAT_ONLY_READ_TOOLS = new Set(['present_visual', 'lookup_user_manual']);

function textFromMessage(message: UIMessage): string {
  return message.parts
    .filter((p): p is { type: 'text'; text: string } => p.type === 'text')
    .map((p) => p.text)
    .join('\n')
    .trim();
}

function toolsByName(tools: CatalogTool[]): Map<string, CatalogTool> {
  return new Map(tools.map((t) => [t.name, t]));
}

export async function streamChatAgent(input: {
  threadId: string;
  user: User;
  workspaceId: string;
  messages: UIMessage[];
  abortSignal?: AbortSignal;
}): Promise<Response> {
  const { threadId, user, workspaceId, messages, abortSignal } = input;

  await ChatService.requireOwnedThread(threadId, user.id, workspaceId);

  const lastMessage = messages[messages.length - 1];
  if (!lastMessage) {
    throw new AppError('No messages provided', 400);
  }

  if (lastMessage.role === 'user') {
    const existing = await ChatService.loadUiMessages(threadId);
    if (!existing.some((m) => m.id === lastMessage.id)) {
      await ChatService.persistUserMessage(threadId, lastMessage);
      const titleSource = textFromMessage(lastMessage);
      if (titleSource) {
        await ChatService.maybeSetTitleFromFirstMessage(threadId, titleSource);
      }
    }
  }

  const thread = await ChatService.requireOwnedThread(threadId, user.id, workspaceId);
  const resolved = await LlmSettingsService.resolveModelSelection(workspaceId, {
    provider: (thread.modelProvider as ChatProviderId | null) ?? undefined,
    modelId: thread.modelId ?? undefined,
  });
  const { model, config, provider } = resolveLanguageModel(resolved);

  if (thread.modelProvider !== config.provider || thread.modelId !== config.modelId) {
    await prisma.chatThread.update({
      where: { id: threadId },
      data: {
        modelProvider: config.provider,
        modelId: config.modelId,
      },
    });
  }

  const ctx = { user, workspaceId };
  const catalog = assembleAllTools(ctx);
  const access = createMcpAccess(ctx);
  const catalogMap = toolsByName(catalog);
  const peonTools = toAiSdkTools(catalog, ctx, access, { forChat: true });

  const stored = await ChatService.loadUiMessages(threadId);
  const uiMessages = messages.length >= stored.length ? messages : stored;

  const stream = createUIMessageStream({
    originalMessages: uiMessages,
    execute: async ({ writer }) => {
      const tools = {
        ...peonTools,
        present_visual: createPresentVisualTool(writer),
        lookup_user_manual: createLookupUserManualTool(),
      };
      // Only the last N turns go to the model; full history stays in the thread UI/DB.
      const contextMessages = takeRecentMessages(uiMessages);
      const modelMessages = await convertToModelMessages(contextMessages);
      const result = streamText({
        model,
        system: PEON_CHAT_SYSTEM_PROMPT,
        messages: modelMessages,
        tools,
        abortSignal,
        stopWhen: isStepCount(12),
        providerOptions: provider.providerOptions(config) as never,
        toolApproval: ({ toolCall }) => {
          if (CHAT_ONLY_READ_TOOLS.has(toolCall.toolName)) {
            return 'not-applicable';
          }
          const def = catalogMap.get(toolCall.toolName);
          if (!def || !needsChatApproval(def.kind)) {
            return 'not-applicable';
          }
          return 'user-approval';
        },
        onStepFinish: async ({ toolCalls, toolResults }) => {
          for (const call of toolCalls ?? []) {
            const def = catalogMap.get(call.toolName);
            const kind =
              def?.kind ?? (CHAT_ONLY_READ_TOOLS.has(call.toolName) ? 'read' : 'mutating');
            await ChatService.recordToolCall({
              threadId,
              toolName: call.toolName,
              toolCallId: call.toolCallId,
              kind,
              input: 'input' in call ? call.input : undefined,
              redactInputKeys: def?.redactInputKeys,
              approvalStatus: needsChatApproval(kind) ? 'PENDING' : 'APPROVED',
            });
          }
          for (const result of toolResults ?? []) {
            await ChatService.finalizeToolCall({
              toolCallId: result.toolCallId,
              output: 'output' in result ? result.output : undefined,
              isError: false,
              approvalStatus: 'APPROVED',
            }).catch(() => undefined);
          }
        },
      });

      writer.merge(
        result.toUIMessageStream({
          sendReasoning: true,
          originalMessages: uiMessages,
          messageMetadata: () => ({
            createdAt: new Date().toISOString(),
          }),
        }),
      );
    },
    onFinish: async ({ responseMessage, isAborted }) => {
      await ChatService.upsertAssistantMessage(
        threadId,
        responseMessage,
        isAborted ? 'CANCELLED' : 'COMPLETE',
      );
      await ChatService.syncToolCallsFromMessage(threadId, responseMessage);
    },
  });

  return createUIMessageStreamResponse({ stream });
}
