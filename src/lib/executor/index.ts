import { prisma } from '@/lib/prisma';
import { NotFoundError } from '@/lib/errors';
import { sshTargetForServer } from '@/lib/ssh';
import { LocalServerExecutor } from './local';
import { SshServerExecutor } from './ssh';
import type { ServerExecutor } from './types';

export type { ServerExecutor, ExecOptions, ExecResult, LogSink } from './types';
export { LocalServerExecutor } from './local';
export { SshServerExecutor } from './ssh';

/** One instance is enough — it holds no per-server state. */
const localExecutor = new LocalServerExecutor();

/**
 * Resolve how to run commands on a server.
 *
 * `executionMode` defaults to `REMOTE` in the schema, so every pre-existing
 * server keeps using SSH with no migration step and no behaviour change.
 */
export async function executorForServer(serverId: string): Promise<ServerExecutor> {
  const server = await prisma.server.findUnique({
    where: { id: serverId },
    select: { executionMode: true },
  });
  if (!server) throw new NotFoundError('Server not found.');

  if (server.executionMode === 'LOCAL') return localExecutor;

  // Decrypts the private key and resolves host/port/user.
  return new SshServerExecutor(await sshTargetForServer(serverId));
}

/** Executor for the control-plane host, without a Server row. */
export function localServerExecutor(): ServerExecutor {
  return localExecutor;
}
