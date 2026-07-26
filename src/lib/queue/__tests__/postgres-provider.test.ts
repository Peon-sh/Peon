import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/prisma', () => ({
  prisma: {
    queueJob: {
      create: vi.fn(),
      update: vi.fn(),
      findUnique: vi.fn(),
      deleteMany: vi.fn(),
    },
    $queryRaw: vi.fn(),
  },
}));

import { prisma } from '@/lib/prisma';
import { PostgresQueueProvider } from '../providers/postgres';

const create = vi.mocked(prisma.queueJob.create);
const update = vi.mocked(prisma.queueJob.update);
const findUnique = vi.mocked(prisma.queueJob.findUnique);
const queryRaw = vi.mocked(prisma.$queryRaw);

const provider = new PostgresQueueProvider();

const deployJob = { type: 'deploy', deploymentId: 'd1', serviceId: 's1' } as const;

describe('PostgresQueueProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    update.mockResolvedValue({} as never);
    findUnique.mockResolvedValue({ maxAttempts: 5, attempts: 1 } as never);
  });

  describe('enqueue', () => {
    it('routes deploy jobs to the deployments queue', async () => {
      create.mockResolvedValue({} as never);
      await provider.enqueue(deployJob);

      expect(create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ queue: 'deployments', type: 'deploy' }),
        }),
      );
    });

    it('routes non-deploy jobs to the tasks queue', async () => {
      create.mockResolvedValue({} as never);
      await provider.enqueue({ type: 'server.cleanup', serverId: 'srv1' });

      expect(create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ queue: 'tasks' }) }),
      );
    });

    it('stores the whole message as the payload', async () => {
      create.mockResolvedValue({} as never);
      await provider.enqueue(deployJob);

      const arg = create.mock.calls[0]?.[0] as { data: { payload: unknown } };
      expect(arg.data.payload).toEqual(deployJob);
    });
  });

  describe('claiming', () => {
    it('returns a parsed job with its row id as the receipt', async () => {
      queryRaw.mockResolvedValue([{ id: 'job-1', payload: deployJob, attempts: 1 }] as never);

      const jobs = await provider.receiveMessages('deployments', 0, 5);

      expect(jobs).toHaveLength(1);
      expect(jobs[0]).toMatchObject({ receipt: 'job-1', attempts: 1 });
      expect(jobs[0]?.message).toEqual(deployJob);
    });

    it('uses SKIP LOCKED so concurrent workers cannot claim the same row', async () => {
      queryRaw.mockResolvedValue([] as never);
      await provider.receiveMessages('tasks', 0, 1);

      // Prisma tagged templates arrive as a strings array.
      const sql = (queryRaw.mock.calls[0]?.[0] as unknown as { join?: (s: string) => string });
      const text = Array.isArray(sql) ? (sql as string[]).join(' ') : String(sql);
      expect(text).toMatch(/FOR UPDATE SKIP LOCKED/);
    });

    it('returns an empty array when nothing is due', async () => {
      queryRaw.mockResolvedValue([] as never);
      await expect(provider.receiveMessages('tasks', 0, 5)).resolves.toEqual([]);
    });

    it('fails a malformed payload instead of redelivering it forever', async () => {
      queryRaw.mockResolvedValue([{ id: 'bad-1', payload: 'not-an-object', attempts: 1 }] as never);

      const jobs = await provider.receiveMessages('tasks', 0, 1);

      expect(jobs).toEqual([]);
      expect(update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'bad-1' },
          data: expect.objectContaining({ status: 'FAILED' }),
        }),
      );
    });

    it('fails a payload with no type field', async () => {
      queryRaw.mockResolvedValue([{ id: 'bad-2', payload: { foo: 1 }, attempts: 1 }] as never);

      await expect(provider.receiveMessages('tasks', 0, 1)).resolves.toEqual([]);
      expect(update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: 'FAILED' }) }),
      );
    });
  });

  describe('acknowledgement', () => {
    it('marks a job COMPLETED on success', async () => {
      await provider.deleteMessage('tasks', 'job-1');

      expect(update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'job-1' },
          data: expect.objectContaining({ status: 'COMPLETED' }),
        }),
      );
    });

    it('marks a job FAILED terminally', async () => {
      await provider.failMessage('tasks', 'job-1', 'target deleted');

      expect(update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'FAILED', lastError: 'target deleted' }),
        }),
      );
    });

    it('does not throw when acknowledging a row that no longer exists', async () => {
      update.mockRejectedValue(new Error('record not found'));
      await expect(provider.deleteMessage('tasks', 'gone')).resolves.toBeUndefined();
    });
  });

  describe('retry and attempt limits', () => {
    it('reschedules with backoff while attempts remain', async () => {
      findUnique.mockResolvedValue({ attempts: 2, maxAttempts: 5 } as never);

      await provider.retryMessage('job-1', 'ssh timeout');

      const arg = update.mock.calls[0]?.[0] as { data: { status: string; visibleAt: Date } };
      expect(arg.data.status).toBe('PENDING');
      expect(arg.data.visibleAt.getTime()).toBeGreaterThan(Date.now());
    });

    it('backs off exponentially', async () => {
      findUnique.mockResolvedValue({ attempts: 1, maxAttempts: 5 } as never);
      await provider.retryMessage('job-1', 'e');
      const first = (update.mock.calls[0]?.[0] as { data: { visibleAt: Date } }).data.visibleAt;

      vi.clearAllMocks();
      update.mockResolvedValue({} as never);
      findUnique.mockResolvedValue({ attempts: 4, maxAttempts: 9 } as never);
      await provider.retryMessage('job-1', 'e');
      const later = (update.mock.calls[0]?.[0] as { data: { visibleAt: Date } }).data.visibleAt;

      expect(later.getTime()).toBeGreaterThan(first.getTime());
    });

    it('gives up permanently once maxAttempts is reached', async () => {
      findUnique.mockResolvedValue({ attempts: 5, maxAttempts: 5 } as never);

      await provider.retryMessage('job-1', 'always fails');

      expect(update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: 'FAILED' }) }),
      );
    });

    it('does nothing for an unknown job', async () => {
      findUnique.mockResolvedValue(null as never);
      await provider.retryMessage('missing', 'e');
      expect(update).not.toHaveBeenCalled();
    });
  });
});
