import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/prisma', () => ({
  prisma: {
    service: { findUnique: vi.fn(), delete: vi.fn() },
  },
}));

vi.mock('@/services/internal/deploy/engine', () => ({
  teardownService: vi.fn(),
}));

vi.mock('@/services/internal/audit/audit', () => ({
  AuditService: { record: vi.fn() },
}));

import { prisma } from '@/lib/prisma';
import { teardownService } from '@/services/internal/deploy/engine';
import { AuditService } from '@/services/internal/audit/audit';
import { remove } from '../lifecycle';

const findUnique = vi.mocked(prisma.service.findUnique);
const serviceDelete = vi.mocked(prisma.service.delete);
const teardown = vi.mocked(teardownService);
const record = vi.mocked(AuditService.record);

const svc = {
  id: 'svc1',
  name: 'web',
  project: { workspaceId: 'ws1' },
};

describe('service.remove', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    findUnique.mockResolvedValue(svc as never);
    serviceDelete.mockResolvedValue({} as never);
    teardown.mockResolvedValue(undefined);
    record.mockResolvedValue(undefined as never);
  });

  it('tears down the VPS app before deleting the Peon record', async () => {
    await remove('svc1');

    expect(teardown.mock.invocationCallOrder[0]).toBeLessThan(
      serviceDelete.mock.invocationCallOrder[0]!,
    );
    expect(teardown).toHaveBeenCalledWith('svc1');
    expect(serviceDelete).toHaveBeenCalledWith({ where: { id: 'svc1' } });
    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'service.deleted',
        resourceId: 'svc1',
        workspaceId: 'ws1',
        metadata: { teardown: 'ok' },
      }),
    );
  });

  it('still deletes the Peon record when teardown fails, and says so in the audit log', async () => {
    teardown.mockRejectedValue(new Error('host unreachable'));

    await remove('svc1');

    expect(serviceDelete).toHaveBeenCalledWith({ where: { id: 'svc1' } });
    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'service.deleted',
        metadata: { teardown: 'failed' },
        summary: expect.stringContaining('containers may still be running'),
      }),
    );
  });
});
