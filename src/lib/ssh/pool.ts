import { NodeSSH } from 'node-ssh';
import { isE2eMode } from '@/lib/e2e';
import { sshConnectHostOptions } from './host';
import type { ExecResult, LogSink, SshTarget } from './types';

interface PooledConnection {
  ssh: NodeSSH;
  lastUsed: number;
  connecting: Promise<NodeSSH> | null;
  serverId: string;
}

/** Stable identity for a target so IP/user/key changes drop stale pooled sessions. */
export function sshTargetIdentity(target: SshTarget): string {
  const key = target.privateKey;
  const keyHint = `${key.length}:${key.slice(0, 24)}:${key.slice(-24)}`;
  return `${target.host}|${target.port}|${target.username}|${keyHint}`;
}

function poolKey(target: SshTarget): string {
  return `${target.id}::${sshTargetIdentity(target)}`;
}

/** Detect half-open SSH sessions that still report connected but reject new channels. */
export function isStaleSshChannelError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /Channel open failure|Not connected|No response from server|Connection lost|ECONNRESET/i.test(msg);
}

/**
 * A lightweight SSH connection pool built on node-ssh (ssh2). Connections are
 * reused per host identity (not just server id) and lazily reconnected.
 */
class SshPool {
  private connections = new Map<string, PooledConnection>();
  private idleTimeoutMs = 5 * 60 * 1000;

  private attachErrorHandler(key: string, ssh: NodeSSH): void {
    const client = ssh.connection;
    client?.on('error', () => {
      this.connections.delete(key);
      try {
        ssh.dispose();
      } catch {
        // Connection is already broken; removing it from the pool is enough.
      }
    });
    client?.on('close', () => {
      this.connections.delete(key);
    });
  }

  private async connect(target: SshTarget, key: string): Promise<NodeSSH> {
    const ssh = new NodeSSH();
    const hostOpts = sshConnectHostOptions(target.host);
    await ssh.connect({
      ...hostOpts,
      port: target.port,
      username: target.username,
      privateKey: target.privateKey,
      readyTimeout: target.readyTimeoutMs ?? 30_000,
      keepaliveInterval: 15_000,
    });
    this.attachErrorHandler(key, ssh);
    return ssh;
  }

  private async getConnection(target: SshTarget, forceNew = false): Promise<NodeSSH> {
    const key = poolKey(target);
    if (forceNew) this.disconnect(target.id);

    const existing = this.connections.get(key);
    if (existing) {
      if (existing.connecting) return existing.connecting;
      if (existing.ssh.isConnected()) {
        existing.lastUsed = Date.now();
        return existing.ssh;
      }
      this.dropKey(key);
    }

    // Drop any other identities for this server so we never keep a session to an old IP.
    this.disconnect(target.id);

    const connecting = this.connect(target, key);
    this.connections.set(key, {
      ssh: null as unknown as NodeSSH,
      lastUsed: Date.now(),
      connecting,
      serverId: target.id,
    });
    try {
      const ssh = await connecting;
      this.connections.set(key, { ssh, lastUsed: Date.now(), connecting: null, serverId: target.id });
      return ssh;
    } catch (err) {
      this.connections.delete(key);
      throw err;
    }
  }

  private dropKey(key: string): void {
    const conn = this.connections.get(key);
    if (conn?.ssh?.isConnected?.()) {
      try {
        conn.ssh.dispose();
      } catch {
        // ignore
      }
    }
    this.connections.delete(key);
  }

  /** True when the pooled session looks alive but cannot open a new channel. */
  private isStaleChannelError(err: unknown): boolean {
    return isStaleSshChannelError(err);
  }

  private async withFreshConnection<T>(
    target: SshTarget,
    run: (ssh: NodeSSH) => Promise<T>,
  ): Promise<T> {
    try {
      return await run(await this.getConnection(target));
    } catch (err) {
      if (!this.isStaleChannelError(err)) throw err;
      // Drop the half-open session and retry once on a new connection.
      return await run(await this.getConnection(target, true));
    }
  }

  /** Run a command and capture full output. */
  async exec(target: SshTarget, command: string, options?: { cwd?: string }): Promise<ExecResult> {
    if (isE2eMode()) return { code: 0, stdout: 'ok', stderr: '' };
    return this.withFreshConnection(target, async (ssh) => {
      const result = await ssh.execCommand(command, { cwd: options?.cwd });
      return { code: result.code, stdout: result.stdout, stderr: result.stderr };
    });
  }

  /** Run a command, streaming output line-by-line to a sink. */
  async execStream(
    target: SshTarget,
    command: string,
    sink: LogSink,
    options?: { cwd?: string },
  ): Promise<ExecResult> {
    if (isE2eMode()) {
      sink('ok', 'stdout');
      return { code: 0, stdout: 'ok', stderr: '' };
    }
    return this.withFreshConnection(target, async (ssh) => {
      let stdout = '';
      let stderr = '';
      const result = await ssh.execCommand(command, {
        cwd: options?.cwd,
        onStdout: (chunk) => {
          const s = chunk.toString('utf8');
          stdout += s;
          sink(s, 'stdout');
        },
        onStderr: (chunk) => {
          const s = chunk.toString('utf8');
          stderr += s;
          sink(s, 'stderr');
        },
      });
      return { code: result.code, stdout, stderr };
    });
  }

  /** Upload string content to a remote path. */
  async putContent(target: SshTarget, remotePath: string, content: string): Promise<void> {
    if (isE2eMode()) return;
    await this.withFreshConnection(target, async (ssh) => {
      const { Readable } = await import('node:stream');
      const sftp = await ssh.requestSFTP();
      await new Promise<void>((resolve, reject) => {
        const stream = sftp.createWriteStream(remotePath);
        stream.on('error', reject);
        stream.on('close', () => resolve());
        Readable.from([content]).pipe(stream);
      });
    });
  }

  async putFile(target: SshTarget, localPath: string, remotePath: string): Promise<void> {
    if (isE2eMode()) return;
    await this.withFreshConnection(target, async (ssh) => {
      await ssh.putFile(localPath, remotePath);
    });
  }

  /** Download a remote file to a local path over SFTP. */
  async getFile(target: SshTarget, remotePath: string, localPath: string): Promise<void> {
    if (isE2eMode()) {
      const { writeFile } = await import('node:fs/promises');
      await writeFile(localPath, '-- e2e backup stub\n');
      return;
    }
    await this.withFreshConnection(target, async (ssh) => {
      await ssh.getFile(localPath, remotePath);
    });
  }

  /** Verify connectivity. Returns false on any SSH failure. */
  async ping(target: SshTarget): Promise<boolean> {
    try {
      const res = await this.exec(target, 'echo peon-ok');
      return res.stdout.includes('peon-ok');
    } catch {
      return false;
    }
  }

  /** Like ping, but returns the underlying error message when unreachable. */
  async pingWithError(target: SshTarget): Promise<{ ok: true } | { ok: false; error: string }> {
    try {
      const res = await this.exec(target, 'echo peon-ok');
      if (!res.stdout.includes('peon-ok')) {
        return { ok: false, error: 'SSH connected but echo check failed.' };
      }
      return { ok: true };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { ok: false, error: msg };
    }
  }

  /** Drop every pooled session for a server (all host/user/key identities). */
  disconnect(id: string): void {
    for (const [key, conn] of [...this.connections.entries()]) {
      if (key === id || key.startsWith(`${id}::`) || conn.serverId === id) {
        if (conn.ssh?.isConnected?.()) {
          try {
            conn.ssh.dispose();
          } catch {
            // ignore
          }
        }
        this.connections.delete(key);
      }
    }
  }

  reapIdle(): void {
    const now = Date.now();
    for (const [key, conn] of this.connections) {
      if (now - conn.lastUsed > this.idleTimeoutMs) {
        if (conn.ssh?.isConnected?.()) {
          try {
            conn.ssh.dispose();
          } catch {
            // ignore
          }
        }
        this.connections.delete(key);
      }
    }
  }
}

export const sshPool = new SshPool();
