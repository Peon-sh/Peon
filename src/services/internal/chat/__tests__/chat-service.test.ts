import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NotFoundError } from '@/lib/errors';

vi.mock('@/lib/prisma', () => ({
  prisma: {
    chatThread: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      findUnique: vi.fn(),
    },
    chatMessage: {
      findMany: vi.fn(),
      create: vi.fn(),
      upsert: vi.fn(),
    },
    chatToolCall: {
      findFirst: vi.fn(),
      upsert: vi.fn(),
      update: vi.fn(),
    },
  },
}));

import { prisma } from '@/lib/prisma';
import { ChatService } from '../chat';

describe('ChatService ownership', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('requireOwnedThread throws when missing', async () => {
    vi.mocked(prisma.chatThread.findFirst).mockResolvedValue(null);
    await expect(ChatService.requireOwnedThread('t1', 'u1', 'ws1')).rejects.toBeInstanceOf(
      NotFoundError,
    );
    expect(prisma.chatThread.findFirst).toHaveBeenCalledWith({
      where: { id: 't1', userId: 'u1', workspaceId: 'ws1' },
    });
  });

  it('lists only current user threads in workspace', async () => {
    vi.mocked(prisma.chatThread.findMany).mockResolvedValue([]);
    await ChatService.listThreads('ws1', 'u1');
    expect(prisma.chatThread.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { workspaceId: 'ws1', userId: 'u1' },
      }),
    );
  });

  it('decideApproval rejects other users', async () => {
    vi.mocked(prisma.chatToolCall.findFirst).mockResolvedValue({
      id: 'c1',
      approvalStatus: 'PENDING',
      thread: { userId: 'other' },
    } as never);
    await expect(
      ChatService.decideApproval({
        approvalId: 'a1',
        toolCallId: 'tc1',
        threadId: 't1',
        userId: 'u1',
        approved: true,
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('decideApproval rejects non-pending approvals', async () => {
    vi.mocked(prisma.chatToolCall.findFirst).mockResolvedValue({
      id: 'c1',
      approvalStatus: 'APPROVED',
      thread: { userId: 'u1' },
    } as never);
    await expect(
      ChatService.decideApproval({
        approvalId: 'a1',
        userId: 'u1',
        approved: true,
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('decideApproval creates a pending row when missing but toolCallId+threadId given', async () => {
    vi.mocked(prisma.chatToolCall.findFirst).mockResolvedValue(null);
    vi.mocked(prisma.chatThread.findFirst).mockResolvedValue({
      id: 't1',
      userId: 'u1',
      workspaceId: 'ws1',
    } as never);
    vi.mocked(prisma.chatToolCall.upsert).mockResolvedValue({
      id: 'c1',
      approvalStatus: 'PENDING',
      thread: { userId: 'u1' },
    } as never);
    vi.mocked(prisma.chatToolCall.update).mockResolvedValue({
      id: 'c1',
      approvalStatus: 'APPROVED',
    } as never);

    await ChatService.decideApproval({
      approvalId: 'a1',
      toolCallId: 'tc1',
      threadId: 't1',
      userId: 'u1',
      approved: true,
    });

    expect(prisma.chatToolCall.upsert).toHaveBeenCalled();
    expect(prisma.chatToolCall.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          approvalId: 'a1',
          approvalStatus: 'APPROVED',
        }),
      }),
    );
  });
});
