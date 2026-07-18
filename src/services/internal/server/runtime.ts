import { sshPool, sshTargetForServer } from '@/lib/ssh';
import { shellSingleQuote } from '@/lib/shell/quote';

/**
 * Host-level SSH access for the server Terminal tab.
 * One-shot command execution (not a full interactive TTY).
 */
export const ServerRuntime = {
  async warm(serverId: string) {
    const target = await sshTargetForServer(serverId);
    await sshPool.exec(target, 'true');
    return { ready: true };
  },

  async exec(serverId: string, command: string) {
    const target = await sshTargetForServer(serverId);
    const res = await sshPool.exec(target, `bash -lc ${shellSingleQuote(command)} 2>&1`);
    return { code: res.code, output: res.stdout || res.stderr };
  },
};
