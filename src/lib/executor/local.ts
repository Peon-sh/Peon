import { spawn } from 'node:child_process';
import { copyFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { isE2eMode } from '@/lib/e2e';
import type { ExecOptions, ExecResult, LogSink, ServerExecutor } from './types';

/**
 * Runs commands on the machine Peon itself is running on.
 *
 * ## Why the shell, and why that is not a new injection surface
 *
 * Commands arrive as shell strings because the deploy engine builds them that
 * way (`docker compose up -d`, `docker inspect --format='…' name`). They are
 * executed with `/bin/sh -c`, exactly as the SSH transport does on the remote
 * side. Any user-controlled fragment inside those strings is already quoted by
 * `lib/shell/quote.ts` before it gets here — that is a property of the callers
 * and is identical for both executors.
 *
 * Using dockerode instead would mean rewriting every call site into an API
 * shape, giving local and remote deployments two different code paths. Keeping
 * one path is worth more than avoiding a shell that the remote side uses anyway.
 *
 * ## Privileges
 *
 * This needs access to the Docker daemon, which is equivalent to root on the
 * host. Only the worker process should ever hold it — never the web process.
 * See `docs/server-modes.md`.
 */
export class LocalServerExecutor implements ServerExecutor {
  readonly mode = 'local' as const;

  private run(
    command: string,
    options: ExecOptions | undefined,
    onStdout?: (chunk: string) => void,
    onStderr?: (chunk: string) => void,
  ): Promise<ExecResult> {
    return new Promise((resolve, reject) => {
      const child = spawn('/bin/sh', ['-c', command], {
        cwd: options?.cwd,
        env: process.env,
      });

      let stdout = '';
      let stderr = '';

      child.stdout.on('data', (buf: Buffer) => {
        const s = buf.toString('utf8');
        stdout += s;
        onStdout?.(s);
      });
      child.stderr.on('data', (buf: Buffer) => {
        const s = buf.toString('utf8');
        stderr += s;
        onStderr?.(s);
      });

      child.on('error', reject);
      child.on('close', (code) => {
        // Match node-ssh: a signalled process reports a non-zero code, never null.
        resolve({ code: code ?? 1, stdout, stderr });
      });
    });
  }

  async exec(command: string, options?: ExecOptions): Promise<ExecResult> {
    if (isE2eMode()) return { code: 0, stdout: 'ok', stderr: '' };
    return this.run(command, options);
  }

  async execStream(
    command: string,
    sink: LogSink,
    options?: ExecOptions,
  ): Promise<ExecResult> {
    if (isE2eMode()) {
      sink('ok', 'stdout');
      return { code: 0, stdout: 'ok', stderr: '' };
    }
    return this.run(
      command,
      options,
      (chunk) => sink(chunk, 'stdout'),
      (chunk) => sink(chunk, 'stderr'),
    );
  }

  async putContent(remotePath: string, content: string): Promise<void> {
    if (isE2eMode()) return;
    await mkdir(path.dirname(remotePath), { recursive: true });
    await writeFile(remotePath, content, 'utf8');
  }

  async putFile(localPath: string, remotePath: string): Promise<void> {
    if (isE2eMode()) return;
    await mkdir(path.dirname(remotePath), { recursive: true });
    await copyFile(localPath, remotePath);
  }

  async getFile(remotePath: string, localPath: string): Promise<void> {
    if (isE2eMode()) {
      await writeFile(localPath, '-- e2e backup stub\n');
      return;
    }
    await mkdir(path.dirname(localPath), { recursive: true });
    await copyFile(remotePath, localPath);
  }

  /** Local execution is reachable when Docker answers. */
  async ping(): Promise<boolean> {
    const res = await this.exec('docker version --format "{{.Server.Version}}"');
    return res.code === 0;
  }

  async pingWithError(): Promise<{ ok: true } | { ok: false; error: string }> {
    const res = await this.exec('docker version --format "{{.Server.Version}}"');
    if (res.code === 0) return { ok: true };
    return {
      ok: false,
      error:
        res.stderr.trim() ||
        'Docker is not reachable from the Peon worker. The worker needs access to ' +
          '/var/run/docker.sock (see docs/server-modes.md).',
    };
  }

  /** Nothing is pooled for local execution. */
  disconnect(): void {}
}
