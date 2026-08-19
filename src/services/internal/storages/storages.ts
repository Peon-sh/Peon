import { prisma } from '@/lib/prisma';
import { decrypt, encrypt } from '@/lib/crypto/encryption';
import { NotFoundError } from '@/lib/errors';
import { assertSafeS3Endpoint } from '@/lib/net/egress';
import type { CreateStorageInput, UpdateStorageInput } from '@/schemas/storages.schema';
import { AuditService } from '@/services/internal/audit/audit';

const listSelect = {
  id: true,
  uuid: true,
  workspaceId: true,
  name: true,
  description: true,
  region: true,
  endpoint: true,
  bucket: true,
  isUsable: true,
  createdAt: true,
} as const;

const detailSelect = {
  ...listSelect,
  accessKey: true,
} as const;

export const StorageService = {
  list(workspaceId: string) {
    return prisma.s3Storage.findMany({
      where: { workspaceId },
      select: listSelect,
      orderBy: { createdAt: 'desc' },
    });
  },

  async create(workspaceId: string, input: CreateStorageInput) {
    await assertSafeS3Endpoint(input.endpoint);
    const { accessKey, secretKey, ...rest } = input;
    const storage = await prisma.s3Storage.create({
      data: {
        ...rest,
        workspaceId,
        accessKey: encrypt(accessKey),
        secretKey: encrypt(secretKey),
      },
      select: listSelect,
    });
    await AuditService.record({
      workspaceId,
      action: 'storage.created',
      resourceType: 'storage',
      resourceId: storage.id,
      resourceName: storage.name,
      summary: `Created storage "${storage.name}"`,
    });
    return storage;
  },

  async get(storageId: string) {
    const storage = await prisma.s3Storage.findUnique({
      where: { id: storageId },
      select: detailSelect,
    });
    if (!storage) throw new NotFoundError('Storage not found.');
    return {
      ...storage,
      accessKey: decrypt(storage.accessKey),
    };
  },

  async getRaw(storageId: string) {
    const storage = await prisma.s3Storage.findUnique({ where: { id: storageId } });
    if (!storage) throw new NotFoundError('Storage not found.');
    return storage;
  },

  async workspaceIdFor(storageId: string): Promise<string> {
    const storage = await prisma.s3Storage.findUnique({
      where: { id: storageId },
      select: { workspaceId: true },
    });
    if (!storage) throw new NotFoundError('Storage not found.');
    return storage.workspaceId;
  },

  async update(storageId: string, input: UpdateStorageInput) {
    if (input.endpoint !== undefined) await assertSafeS3Endpoint(input.endpoint);
    const { accessKey, secretKey, ...rest } = input;
    const storage = await prisma.s3Storage.update({
      where: { id: storageId },
      data: {
        ...rest,
        ...(accessKey !== undefined ? { accessKey: encrypt(accessKey) } : {}),
        ...(secretKey !== undefined ? { secretKey: encrypt(secretKey) } : {}),
      },
      select: listSelect,
    });
    await AuditService.record({
      workspaceId: storage.workspaceId,
      action: 'storage.updated',
      resourceType: 'storage',
      resourceId: storage.id,
      resourceName: storage.name,
      summary: `Updated storage "${storage.name}"`,
    });
    return storage;
  },

  async remove(storageId: string) {
    const storage = await prisma.s3Storage.findUnique({
      where: { id: storageId },
      select: { id: true, name: true, workspaceId: true },
    });
    await prisma.s3Storage.delete({ where: { id: storageId } });
    if (storage) {
      await AuditService.record({
        workspaceId: storage.workspaceId,
        action: 'storage.deleted',
        resourceType: 'storage',
        resourceId: storage.id,
        resourceName: storage.name,
        summary: `Deleted storage "${storage.name}"`,
      });
    }
  },

  async markTested(storageId: string) {
    const storage = await prisma.s3Storage.findUnique({
      where: { id: storageId },
      select: { id: true, name: true, workspaceId: true },
    });
    if (!storage) return;
    await AuditService.record({
      workspaceId: storage.workspaceId,
      action: 'storage.tested',
      resourceType: 'storage',
      resourceId: storage.id,
      resourceName: storage.name,
      summary: `Tested storage "${storage.name}"`,
    });
  },
};
