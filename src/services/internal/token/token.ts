import crypto from 'node:crypto';
import { prisma } from '@/lib/prisma';
import { NotFoundError, UnauthorizedError } from '@/lib/errors';
import type { CreateTokenInput } from '@/schemas/server.schema';
import type { User } from '@/lib/prisma';
import { AuditService } from '@/services/internal/audit/audit';

function generatePlaintextToken(): string {
  return `peon_${crypto.randomBytes(20).toString('hex')}`;
}

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export const TokenService = {
  list(workspaceId: string, userId: string) {
    return prisma.personalAccessToken.findMany({
      where: { workspaceId, userId },
      select: {
        id: true,
        name: true,
        lastUsedAt: true,
        expiresAt: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  },

  async create(workspaceId: string, userId: string, input: CreateTokenInput) {
    const plaintext = generatePlaintextToken();
    const record = await prisma.personalAccessToken.create({
      data: {
        workspaceId,
        userId,
        name: input.name,
        tokenHash: hashToken(plaintext),
        expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
      },
      select: { id: true, name: true, expiresAt: true, createdAt: true },
    });
    await AuditService.record({
      workspaceId,
      action: 'token.created',
      resourceType: 'token',
      resourceId: record.id,
      resourceName: record.name,
      summary: `Created API token "${record.name}"`,
    });
    return { ...record, token: plaintext };
  },

  /** Resolve the token owner for access checks. */
  async ownerFor(tokenId: string): Promise<{ workspaceId: string; userId: string }> {
    const token = await prisma.personalAccessToken.findUnique({
      where: { id: tokenId },
      select: { workspaceId: true, userId: true },
    });
    if (!token) throw new NotFoundError('Token not found.');
    return token;
  },

  /**
   * Resolve a plaintext bearer token (`peon_…`) to its owning user and
   * workspace. Used by the MCP server and any token-authenticated API.
   */
  async authenticate(plaintext: string): Promise<{ user: User; workspaceId: string }> {
    const record = await prisma.personalAccessToken.findUnique({
      where: { tokenHash: hashToken(plaintext) },
      include: { user: true },
    });
    if (!record) throw new UnauthorizedError('Invalid API token.');
    if (record.expiresAt && record.expiresAt < new Date()) {
      throw new UnauthorizedError('API token has expired.');
    }
    prisma.personalAccessToken
      .update({ where: { id: record.id }, data: { lastUsedAt: new Date() } })
      .catch(() => {});
    return { user: record.user, workspaceId: record.workspaceId };
  },

  async remove(tokenId: string) {
    const token = await prisma.personalAccessToken.findUnique({
      where: { id: tokenId },
      select: { id: true, name: true, workspaceId: true },
    });
    await prisma.personalAccessToken.delete({ where: { id: tokenId } });
    if (token) {
      await AuditService.record({
        workspaceId: token.workspaceId,
        action: 'token.revoked',
        resourceType: 'token',
        resourceId: token.id,
        resourceName: token.name,
        summary: `Revoked API token "${token.name}"`,
      });
    }
  },
};
