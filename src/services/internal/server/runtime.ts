import { executorForServer } from '@/lib/executor';
import { shellSingleQuote } from '@/lib/shell/quote';

/**
 * Host-level SSH access for the server Terminal tab.
 * One-shot command execution (not a full interactive TTY).
 */
export const ServerRuntime = {
  async warm(serverId: string) {
    const executor = await executorForServer(serverId);
    await executor.exec('true');
    return { ready: true };
  },

  async exec(serverId: string, command: string) {
    const executor = await executorForServer(serverId);
    const res = await executor.exec(`bash -lc ${shellSingleQuote(command)} 2>&1`);
    return { code: res.code, output: res.stdout || res.stderr };
  },
};
