import type { ExecResult, LogSink } from '@/lib/ssh/types';

export type { ExecResult, LogSink } from '@/lib/ssh/types';

export interface ExecOptions {
  cwd?: string;
}

/**
 * How Peon runs commands on a server.
 *
 * Deliberately identical in shape to the `sshPool` surface that the deploy
 * engine, server operations, backups and task runner already used, so migrating
 * call sites is mechanical and the deployment logic keeps one code path.
 *
 * Two implementations:
 *
 * - `SshServerExecutor` — the original behaviour, delegating to the SSH pool.
 * - `LocalServerExecutor` — runs on the control-plane host itself.
 *
 * Commands are shell strings in both cases. That is intentional: the deploy
 * engine emits `docker compose up -d`, `docker inspect --format=…` and similar,
 * and reusing them verbatim is what keeps local and remote behaviour identical.
 * Anything that quotes user input must go through `lib/shell/quote.ts` in both
 * implementations — the injection surface is the same either way.
 */
export interface ServerExecutor {
  readonly mode: 'ssh' | 'local';

  /** Run a command, capturing full output. */
  exec(command: string, options?: ExecOptions): Promise<ExecResult>;

  /** Run a command, streaming output to a sink as it arrives. */
  execStream(command: string, sink: LogSink, options?: ExecOptions): Promise<ExecResult>;

  /** Write string content to a path on the target. */
  putContent(remotePath: string, content: string): Promise<void>;

  /** Copy a local file to the target. */
  putFile(localPath: string, remotePath: string): Promise<void>;

  /** Copy a file from the target to a local path. */
  getFile(remotePath: string, localPath: string): Promise<void>;

  /** Connectivity check. */
  ping(): Promise<boolean>;

  /** Connectivity check that reports why it failed. */
  pingWithError(): Promise<{ ok: true } | { ok: false; error: string }>;

  /** Drop any pooled connection. No-op for local execution. */
  disconnect(): void;
}
