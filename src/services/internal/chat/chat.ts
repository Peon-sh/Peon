import type { Prisma } from '@/lib/prisma';
import { prisma } from '@/lib/prisma';
import { NotFoundError } from '@/lib/errors';
import { getToolName, isToolUIPart, type UIMessage } from 'ai';
import { redactUiMessageParts } from './redact-message';
import { redactByKeys, redactValue } from '@/lib/mcp/catalog/redact';
import type { ToolKind } from '@/lib/mcp/catalog/types';

export class ChatService {
  static async requireOwnedThread(threadId: string, userId: string, workspaceId?: string) {
    const thread = await prisma.chatThread.findFirst({
      where: {
        id: threadId,
        userId,
        ...(workspaceId ? { workspaceId } : {}),
      },
    });
    if (!thread) {
      throw new NotFoundError('Chat thread not found');
    }
    return thread;
  }

  static async listThreads(workspaceId: string, userId: string) {
    return prisma.chatThread.findMany({
      where: { workspaceId, userId },
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        title: true,
        modelProvider: true,
        modelId: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  static async createThread(input: {
    workspaceId: string;
    userId: string;
    title?: string;
    modelProvider?: string;
    modelId?: string;
  }) {
    return prisma.chatThread.create({
      data: {
        workspaceId: input.workspaceId,
        userId: input.userId,
        title: input.title ?? null,
        modelProvider: input.modelProvider ?? null,
        modelId: input.modelId ?? null,
      },
    });
  }

  static async getThreadWithMessages(threadId: string, userId: string) {
    const thread = await prisma.chatThread.findFirst({
      where: { id: threadId, userId },
      include: {
        messages: { orderBy: { createdAt: 'asc' } },
      },
    });
    if (!thread) {
      throw new NotFoundError('Chat thread not found');
    }
    return thread;
  }

  static async renameThread(threadId: string, userId: string, title: string) {
    await this.requireOwnedThread(threadId, userId);
    return prisma.chatThread.update({
      where: { id: threadId },
      data: { title },
    });
  }

  static async updateThreadModel(
    threadId: string,
    userId: string,
    modelProvider: string,
    modelId: string,
  ) {
    await this.requireOwnedThread(threadId, userId);
    return prisma.chatThread.update({
      where: { id: threadId },
      data: { modelProvider, modelId },
      select: {
        id: true,
        title: true,
        modelProvider: true,
        modelId: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  static async deleteThread(threadId: string, userId: string) {
    await this.requireOwnedThread(threadId, userId);
    await prisma.chatThread.delete({ where: { id: threadId } });
    return { deleted: true };
  }

  static async loadUiMessages(threadId: string): Promise<UIMessage[]> {
    const messages = await prisma.chatMessage.findMany({
      where: { threadId, status: { not: 'CANCELLED' } },
      orderBy: { createdAt: 'asc' },
    });
    return messages.map((m) => ({
      id: m.id,
      role: m.role.toLowerCase() as UIMessage['role'],
      parts: m.parts as UIMessage['parts'],
    }));
  }

  static async persistUserMessage(threadId: string, message: UIMessage) {
    const parts = redactUiMessageParts(message.parts);
    const created = await prisma.chatMessage.create({
      data: {
        id: message.id,
        threadId,
        role: 'USER',
        parts: parts as Prisma.InputJsonValue,
        status: 'COMPLETE',
      },
    });
    await prisma.chatThread.update({
      where: { id: threadId },
      data: { updatedAt: new Date() },
    });
    return created;
  }

  static async upsertAssistantMessage(
    threadId: string,
    message: UIMessage,
    status: 'STREAMING' | 'COMPLETE' | 'ERROR' | 'CANCELLED',
  ) {
    const parts = redactUiMessageParts(message.parts);
    await prisma.chatMessage.upsert({
      where: { id: message.id },
      create: {
        id: message.id,
        threadId,
        role: 'ASSISTANT',
        parts: parts as Prisma.InputJsonValue,
        status,
      },
      update: {
        parts: parts as Prisma.InputJsonValue,
        status,
      },
    });
    await prisma.chatThread.update({
      where: { id: threadId },
      data: { updatedAt: new Date() },
    });
  }

  static async maybeSetTitleFromFirstMessage(threadId: string, text: string) {
    const thread = await prisma.chatThread.findUnique({ where: { id: threadId } });
    if (!thread || thread.title) return;
    const title = text.trim().slice(0, 80) || 'New chat';
    await prisma.chatThread.update({
      where: { id: threadId },
      data: { title },
    });
  }

  static async recordToolCall(input: {
    threadId: string;
    messageId?: string;
    toolName: string;
    toolCallId: string;
    approvalId?: string;
    kind: ToolKind;
    input: unknown;
    redactInputKeys?: string[];
    approvalStatus?: 'PENDING' | 'APPROVED' | 'DENIED' | 'EXPIRED';
  }) {
    const inputObj =
      input.input && typeof input.input === 'object' && !Array.isArray(input.input)
        ? (input.input as Record<string, unknown>)
        : { value: input.input };
    const inputRedacted = input.redactInputKeys?.length
      ? redactByKeys(inputObj, input.redactInputKeys)
      : redactValue(inputObj);

    return prisma.chatToolCall.upsert({
      where: { toolCallId: input.toolCallId },
      create: {
        threadId: input.threadId,
        messageId: input.messageId,
        toolName: input.toolName,
        toolCallId: input.toolCallId,
        approvalId: input.approvalId,
        kind: input.kind,
        inputRedacted: inputRedacted as Prisma.InputJsonValue,
        approvalStatus: input.approvalStatus ?? 'PENDING',
      },
      update: {
        ...(input.messageId ? { messageId: input.messageId } : {}),
        ...(input.approvalId ? { approvalId: input.approvalId } : {}),
        inputRedacted: inputRedacted as Prisma.InputJsonValue,
        ...(input.approvalStatus ? { approvalStatus: input.approvalStatus } : {}),
      },
    });
  }

  static async finalizeToolCall(input: {
    toolCallId: string;
    output?: unknown;
    isError?: boolean;
    approvalStatus?: 'APPROVED' | 'DENIED' | 'EXPIRED';
  }) {
    return prisma.chatToolCall.update({
      where: { toolCallId: input.toolCallId },
      data: {
        outputRedacted:
          input.output !== undefined
            ? (redactValue(input.output) as Prisma.InputJsonValue)
            : undefined,
        isError: input.isError ?? false,
        approvalStatus: input.approvalStatus,
        decidedAt: input.approvalStatus ? new Date() : undefined,
      },
    });
  }

  static async syncToolCallsFromMessage(threadId: string, message: UIMessage) {
    for (const part of message.parts) {
      if (!isToolUIPart(part)) continue;
      const approvalId =
        'approval' in part && part.approval && typeof part.approval === 'object'
          ? part.approval.id
          : undefined;
      const approvalStatus =
        part.state === 'output-denied' ||
        (part.state === 'approval-responded' && part.approval.approved === false)
          ? ('DENIED' as const)
          : part.state === 'output-available' ||
              (part.state === 'approval-responded' && part.approval.approved === true)
            ? ('APPROVED' as const)
            : part.state === 'approval-requested'
              ? ('PENDING' as const)
              : undefined;

      await this.recordToolCall({
        threadId,
        messageId: message.id,
        toolName: getToolName(part),
        toolCallId: part.toolCallId,
        approvalId,
        kind: 'mutating',
        input: 'input' in part ? part.input : undefined,
        approvalStatus,
      });

      if (part.state === 'output-available' || part.state === 'output-error') {
        await this.finalizeToolCall({
          toolCallId: part.toolCallId,
          output: part.state === 'output-available' ? part.output : { error: part.errorText },
          isError: part.state === 'output-error',
          approvalStatus: part.state === 'output-error' ? undefined : 'APPROVED',
        }).catch(() => undefined);
      }
    }
  }

  static async decideApproval(input: {
    approvalId: string;
    toolCallId?: string;
    threadId?: string;
    userId: string;
    approved: boolean;
  }) {
    let call = await prisma.chatToolCall.findFirst({
      where: { approvalId: input.approvalId },
      include: { thread: true },
    });

    if (!call && input.toolCallId) {
      call = await prisma.chatToolCall.findFirst({
        where: {
          toolCallId: input.toolCallId,
          thread: { userId: input.userId },
        },
        include: { thread: true },
      });
    }

    // Stream may pause for approval before onStepFinish/onFinish persists the row.
    if (!call && input.toolCallId && input.threadId) {
      const thread = await this.requireOwnedThread(input.threadId, input.userId);
      call = await prisma.chatToolCall.upsert({
        where: { toolCallId: input.toolCallId },
        create: {
          threadId: thread.id,
          toolName: 'unknown',
          toolCallId: input.toolCallId,
          approvalId: input.approvalId,
          kind: 'mutating',
          inputRedacted: {},
          approvalStatus: 'PENDING',
        },
        update: {
          approvalId: input.approvalId,
        },
        include: { thread: true },
      });
    }

    if (!call || call.thread.userId !== input.userId) {
      throw new NotFoundError('Approval not found');
    }
    if (call.approvalStatus !== 'PENDING') {
      throw new NotFoundError('Approval is no longer pending');
    }
    return prisma.chatToolCall.update({
      where: { id: call.id },
      data: {
        approvalId: input.approvalId,
        approvalStatus: input.approved ? 'APPROVED' : 'DENIED',
        decidedAt: new Date(),
      },
    });
  }
}
