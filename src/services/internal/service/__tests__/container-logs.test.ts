import { beforeEach, describe, expect, it, vi } from 'vitest';

const { exec, create, findMany, deleteMany, uploadPlatformObject, deletePlatformObject, isPlatformS3Configured } =
  vi.hoisted(() => ({
    exec: vi.fn(),
    create: vi.fn(),
    findMany: vi.fn(),
    deleteMany: vi.fn(),
    uploadPlatformObject: vi.fn(),
    deletePlatformObject: vi.fn(),
    isPlatformS3Configured: vi.fn(),
  }));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    serviceContainerLog: { create, findMany, deleteMany },
  },
}));

vi.mock('@/lib/ssh', () => ({
  sshPool: { exec },
}));

vi.mock('@/services/external/s3/assets', () => ({
  uploadPlatformObject,
  deletePlatformObject,
  getPlatformObject: vi.fn(),
  isPlatformS3Configured,
}));

import { archiveContainerLogs } from '../container-logs';

const target = { id: 'srv', host: '10.0.0.1', port: 22, username: 'root', privateKey: 'key' };

describe('archiveContainerLogs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isPlatformS3Configured.mockReturnValue(true);
    uploadPlatformObject.mockImplementation(async (input: { key: string }) => ({ key: input.key }));
    deletePlatformObject.mockResolvedValue(undefined);
    create.mockResolvedValue({ id: 'row' });
    findMany.mockResolvedValue([]);
    deleteMany.mockResolvedValue({ count: 0 });
  });

  it('uploads the log text to a private S3 object and stores only the key', async () => {
    exec.mockResolvedValue({ code: 0, stdout: 'hello\n', stderr: '' });
    findMany.mockResolvedValue([{ id: 'old-1', objectKey: 'container-logs/svc/old-1.log' }]);

    await archiveContainerLogs({
      target,
      serviceId: 'svc',
      containerName: 'api-1',
      deploymentId: 'dep',
      reason: 'deploy',
    });

    expect(uploadPlatformObject).toHaveBeenCalledWith(
      expect.objectContaining({
        body: Buffer.from('hello'),
        contentType: 'text/plain; charset=utf-8',
        cacheControl: 'private, no-store',
      }),
    );
    const uploaded = uploadPlatformObject.mock.calls[0]![0] as { key: string; publicRead?: boolean };
    expect(uploaded.publicRead).toBeUndefined();
    expect(uploaded.key).toMatch(/^container-logs\/svc\/.+\.log$/);
    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        serviceId: 'svc',
        deploymentId: 'dep',
        containerName: 'api-1',
        reason: 'deploy',
        objectKey: uploaded.key,
      }),
    });
    expect(create.mock.calls[0]![0].data.content).toBeUndefined();
    expect(deletePlatformObject).toHaveBeenCalledWith('container-logs/svc/old-1.log');
    expect(deleteMany).toHaveBeenCalledWith({ where: { id: { in: ['old-1'] } } });
  });

  it('skips a missing container', async () => {
    exec.mockResolvedValue({ code: 1, stdout: 'No such container', stderr: '' });

    await archiveContainerLogs({
      target,
      serviceId: 'svc',
      containerName: 'gone',
      reason: 'rolling',
    });

    expect(uploadPlatformObject).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });

  it('does not write a row when S3 is not configured', async () => {
    isPlatformS3Configured.mockReturnValue(false);
    exec.mockResolvedValue({ code: 0, stdout: 'hello\n', stderr: '' });

    await archiveContainerLogs({
      target,
      serviceId: 'svc',
      containerName: 'api-1',
      reason: 'deploy',
    });

    expect(uploadPlatformObject).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });

  it('does not throw when the host command fails', async () => {
    exec.mockRejectedValue(new Error('ssh down'));

    await expect(
      archiveContainerLogs({
        target,
        serviceId: 'svc',
        containerName: 'api-1',
        reason: 'cleanup',
      }),
    ).resolves.toBeUndefined();
    expect(create).not.toHaveBeenCalled();
  });
});
