import { prisma } from '@/lib/prisma';
import { decrypt, encrypt } from '@/lib/crypto/encryption';
import { generateKeyPair, fingerprintFromPublicKey } from '@/lib/ssh/keygen';
import { NotFoundError } from '@/lib/errors';
import type { CreatePrivateKeyInput } from '@/schemas/server.schema';
import { privateKeyPemFilename } from '@/services/internal/privatekey/filename';
import { AuditService } from '@/services/internal/audit/audit';

export const PrivateKeyService = {
  list(workspaceId: string) {
    return prisma.privateKey.findMany({
      where: { workspaceId },
      select: {
        id: true,
        uuid: true,
        name: true,
        description: true,
        publicKey: true,
        fingerprint: true,
        isGitRelated: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  },

  async create(workspaceId: string, input: CreatePrivateKeyInput) {
    let privateKey: string;
    let publicKey: string | null;
    let fingerprint: string | null;

    if (input.generate || !input.privateKey) {
      const pair = generateKeyPair(input.name);
      privateKey = pair.privateKey;
      publicKey = pair.publicKey;
      fingerprint = pair.fingerprint;
    } else {
      privateKey = input.privateKey;
      publicKey = input.publicKey ?? null;
      fingerprint = publicKey ? fingerprintFromPublicKey(publicKey) : null;
    }

    const created = await prisma.privateKey.create({
      data: {
        workspaceId,
        name: input.name,
        description: input.description,
        privateKey: encrypt(privateKey),
        publicKey,
        fingerprint,
      },
      select: {
        id: true,
        uuid: true,
        name: true,
        description: true,
        publicKey: true,
        fingerprint: true,
        createdAt: true,
      },
    });
    await AuditService.record({
      workspaceId,
      action: 'private_key.created',
      resourceType: 'private_key',
      resourceId: created.id,
      resourceName: created.name,
      summary: `Created private key "${created.name}"`,
    });
    return created;
  },

  async get(keyId: string) {
    const key = await prisma.privateKey.findUnique({
      where: { id: keyId },
      select: {
        id: true,
        uuid: true,
        workspaceId: true,
        name: true,
        description: true,
        publicKey: true,
        fingerprint: true,
        isGitRelated: true,
        createdAt: true,
      },
    });
    if (!key) throw new NotFoundError('Private key not found.');
    return key;
  },

  /** Resolve just the owning workspace for access checks. */
  async workspaceIdFor(keyId: string): Promise<string> {
    const key = await prisma.privateKey.findUnique({
      where: { id: keyId },
      select: { workspaceId: true },
    });
    if (!key) throw new NotFoundError('Private key not found.');
    return key.workspaceId;
  },

  async remove(keyId: string) {
    const key = await prisma.privateKey.findUnique({
      where: { id: keyId },
      select: { id: true, name: true, workspaceId: true },
    });
    await prisma.privateKey.delete({ where: { id: keyId } });
    if (key) {
      await AuditService.record({
        workspaceId: key.workspaceId,
        action: 'private_key.deleted',
        resourceType: 'private_key',
        resourceId: key.id,
        resourceName: key.name,
        summary: `Deleted private key "${key.name}"`,
      });
    }
  },

  /** Decrypt and return PEM contents for download. */
  async exportPrivateKey(keyId: string): Promise<{ filename: string; privateKey: string }> {
    const key = await prisma.privateKey.findUnique({
      where: { id: keyId },
      select: { name: true, privateKey: true },
    });
    if (!key) throw new NotFoundError('Private key not found.');

    let privateKey: string;
    try {
      privateKey = decrypt(key.privateKey);
    } catch {
      privateKey = key.privateKey;
    }

    return {
      filename: privateKeyPemFilename(key.name),
      privateKey,
    };
  },
};
