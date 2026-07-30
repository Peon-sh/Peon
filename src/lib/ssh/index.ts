import { prisma } from '@/lib/prisma';
import { decrypt } from '@/lib/crypto/encryption';
import { NotFoundError, AppError } from '@/lib/errors';
import { normalizeSshHost } from './host';
import type { SshTarget } from './types';

export * from './types';
export * from './host';
export * from './host-key';
export { sshPool } from './pool';

/** Build an SSH target for a server, decrypting its private key. */
export async function sshTargetForServer(serverId: string): Promise<SshTarget> {
  const server = await prisma.server.findUnique({
    where: { id: serverId },
    include: { privateKey: true, settings: true },
  });
  if (!server) throw new NotFoundError('Server not found.');
  if (!server.privateKey) throw new AppError('Server has no SSH key configured.');

  const host = normalizeSshHost(server.ip);
  if (!host) throw new AppError('Server has an empty IP / hostname.');

  const timeoutSec = server.settings?.connectionTimeout ?? 30;

  return {
    id: server.id,
    host,
    port: server.port,
    username: server.user,
    privateKey: decrypt(server.privateKey.privateKey),
    readyTimeoutMs: Math.min(Math.max(timeoutSec, 5), 300) * 1000,
    hostKeyFingerprint: server.hostKeyFingerprint,
  };
}
