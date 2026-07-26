import { prisma } from '@/lib/prisma';

/**
 * Record a host key learned on first connect.
 *
 * The `hostKeyFingerprint: null` guard means a learned key can never replace one
 * that is already trusted — concurrent connections race harmlessly, and a
 * rotated key still has to go through an explicit re-trust.
 */
export async function rememberHostKey(serverId: string, fingerprint: string): Promise<void> {
  await prisma.server.updateMany({
    where: { id: serverId, hostKeyFingerprint: null },
    data: { hostKeyFingerprint: fingerprint },
  });
}
