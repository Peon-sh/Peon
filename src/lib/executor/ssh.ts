import { sshPool } from '@/lib/ssh';
import type { SshTarget } from '@/lib/ssh/types';
import type { ExecOptions, ExecResult, LogSink, ServerExecutor } from './types';

/**
 * The original SSH behaviour, behind the executor interface.
 *
 * A pure delegation layer — no logic lives here. Connection pooling, host-key
 * verification, stale-channel retry and E2E stubbing all stay in `sshPool`, so
 * wrapping cannot change remote behaviour.
 */
export class SshServerExecutor implements ServerExecutor {
  readonly mode = 'ssh' as const;

  constructor(private readonly target: SshTarget) {}

  exec(command: string, options?: ExecOptions): Promise<ExecResult> {
    return sshPool.exec(this.target, command, options);
  }

  execStream(command: string, sink: LogSink, options?: ExecOptions): Promise<ExecResult> {
    return sshPool.execStream(this.target, command, sink, options);
  }

  putContent(remotePath: string, content: string): Promise<void> {
    return sshPool.putContent(this.target, remotePath, content);
  }

  putFile(localPath: string, remotePath: string): Promise<void> {
    return sshPool.putFile(this.target, localPath, remotePath);
  }

  getFile(remotePath: string, localPath: string): Promise<void> {
    return sshPool.getFile(this.target, remotePath, localPath);
  }

  ping(): Promise<boolean> {
    return sshPool.ping(this.target);
  }

  pingWithError(): Promise<{ ok: true } | { ok: false; error: string }> {
    return sshPool.pingWithError(this.target);
  }

  disconnect(): void {
    sshPool.disconnect(this.target.id);
  }
}
