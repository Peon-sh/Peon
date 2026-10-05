import http from 'node:http';
import { WebSocketServer, type WebSocket } from 'ws';
import { NodeSSH } from 'node-ssh';
import type { ClientChannel } from 'ssh2';
import { serverEnv } from '../src/lib/env';
import { prisma } from '../src/lib/prisma';
import { sshConnectHostOptions, sshTargetForServer } from '../src/lib/ssh';
import { dockerExecInteractiveCommand } from '../src/lib/terminal/service-shell';
import { verifyTerminalTicket, type TerminalTicketPayload } from '../src/lib/terminal/ticket';
import { ServiceRuntime } from '../src/services/internal/service/runtime';
import type { SshTarget } from '../src/lib/ssh/types';

async function connectSsh(target: SshTarget): Promise<NodeSSH> {
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
  return ssh;
}

function canManageInfrastructure(role: string): boolean {
  return role === 'OWNER' || role === 'ADMIN';
}

type Session = {
  ssh: NodeSSH;
  channel: ClientChannel;
  maxTimer: ReturnType<typeof setTimeout>;
};

/**
 * Interactive terminal:
 * browser ↔ WebSocket ↔ dedicated ssh2 PTY
 *   - server tickets → login shell on the host
 *   - service tickets → `docker exec -it` inside the service container
 */
export function startTerminalServer(log: (msg: string) => void = console.log): http.Server {
  const env = serverEnv();
  const port = env.TERMINAL_WS_PORT;
  const maxSessionMs = env.TERMINAL_SESSION_MAX_SECONDS * 1000;

  const server = http.createServer((req, res) => {
    if (req.url === '/ready') {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('OK');
      return;
    }
    res.writeHead(404);
    res.end('Not Found');
  });

  const wss = new WebSocketServer({ server, path: '/terminal/ws' });

  wss.on('connection', (ws, req) => {
    void handleConnection(ws, req.url ?? '', maxSessionMs, log);
  });

  server.listen(port, () => {
    log(`terminal WS listening on :${port}/terminal/ws`);
  });

  return server;
}

async function handleConnection(
  ws: WebSocket,
  rawUrl: string,
  maxSessionMs: number,
  log: (msg: string) => void,
) {
  let session: Session | null = null;

  const cleanup = () => {
    if (!session) return;
    clearTimeout(session.maxTimer);
    try {
      session.channel.close();
    } catch {
      // ignore
    }
    try {
      session.ssh.dispose();
    } catch {
      // ignore
    }
    session = null;
  };

  ws.on('close', cleanup);
  ws.on('error', cleanup);

  try {
    const url = new URL(rawUrl, 'http://localhost');
    const ticket = url.searchParams.get('ticket');
    if (!ticket) {
      ws.send('Unauthorized: missing ticket');
      ws.close();
      return;
    }

    const payload = await verifyTerminalTicket(ticket);
    const cols = clampDim(payload.cols ?? 120, 20, 500);
    const rows = clampDim(payload.rows ?? 40, 10, 200);

    const opened =
      payload.kind === 'service'
        ? await openServiceSession(payload, cols, rows)
        : await openServerSession(payload, cols, rows);

    session = {
      ssh: opened.ssh,
      channel: opened.channel,
      maxTimer: setTimeout(() => {
        try {
          ws.send('\r\n\x1b[33m[peon] terminal session timed out\x1b[0m\r\n');
        } catch {
          // ignore
        }
        cleanup();
        ws.close();
      }, maxSessionMs),
    };

    // Buffer PTY output until after pty-ready. The shell often prints `$ `
    // immediately on start; if we only attach listeners after pty-ready, that
    // first prompt is dropped and the UI shows a bare cursor.
    const pending: string[] = [];
    let clientReady = false;
    const forward = (data: Buffer | string) => {
      const text = typeof data === 'string' ? data : data.toString('utf8');
      if (!clientReady) {
        pending.push(text);
        return;
      }
      if (ws.readyState === ws.OPEN) {
        ws.send(text);
      }
    };

    opened.channel.on('data', forward);
    opened.channel.stderr?.on('data', forward);
    opened.channel.on('close', () => {
      if (ws.readyState === ws.OPEN) {
        ws.send('pty-exited');
        ws.close();
      }
      cleanup();
    });

    // Client clears "Connecting…" on pty-ready, then we flush the buffered prompt.
    ws.send('pty-ready');
    clientReady = true;
    for (const chunk of pending) {
      if (ws.readyState === ws.OPEN) {
        ws.send(chunk);
      }
    }
    pending.length = 0;

    log(
      payload.kind === 'service'
        ? `terminal session opened for service ${payload.serviceId} (user ${payload.userId})`
        : `terminal session opened for server ${payload.serverId} (user ${payload.userId})`,
    );

    ws.on('message', (raw) => {
      if (!session || ws.readyState !== ws.OPEN) return;
      const text = typeof raw === 'string' ? raw : raw.toString('utf8');
      let msg: Record<string, unknown>;
      try {
        msg = JSON.parse(text) as Record<string, unknown>;
      } catch {
        session.channel.write(text);
        return;
      }

      if (typeof msg.message === 'string') {
        session.channel.write(msg.message);
        return;
      }
      if (msg.resize && typeof msg.resize === 'object') {
        const r = msg.resize as { cols?: unknown; rows?: unknown };
        const nextCols = clampDim(Number(r.cols) || cols, 20, 500);
        const nextRows = clampDim(Number(r.rows) || rows, 10, 200);
        session.channel.setWindow(nextRows, nextCols, 0, 0);
        return;
      }
      if (msg.ping === true) {
        ws.send('pong');
      }
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log(`terminal connection failed: ${message}`);
    try {
      ws.send(`Unauthorized: ${message}`);
    } catch {
      // ignore
    }
    cleanup();
    ws.close();
  }
}

async function openServerSession(
  payload: TerminalTicketPayload,
  cols: number,
  rows: number,
): Promise<{ ssh: NodeSSH; channel: ClientChannel }> {
  const serverId = payload.serverId!;
  const server = await prisma.server.findUnique({
    where: { id: serverId },
    select: { id: true, workspaceId: true, privateKeyId: true },
  });
  if (!server?.privateKeyId) {
    throw new Error('server not found');
  }

  const membership = await prisma.workspaceMembership.findUnique({
    where: {
      workspaceId_userId: { workspaceId: server.workspaceId, userId: payload.userId },
    },
  });
  if (!membership || !canManageInfrastructure(membership.role)) {
    throw new Error('forbidden');
  }

  const target = await sshTargetForServer(serverId);
  const ssh = await connectSsh(target);

  const channel = await ssh.requestShell({
    term: 'xterm-256color',
    cols,
    rows,
  });

  return { ssh, channel };
}

async function openServiceSession(
  payload: TerminalTicketPayload,
  cols: number,
  rows: number,
): Promise<{ ssh: NodeSSH; channel: ClientChannel }> {
  const serviceId = payload.serviceId!;
  const svc = await prisma.service.findFirst({
    where: { id: serviceId, deletedAt: null },
    select: {
      id: true,
      project: { select: { id: true, workspaceId: true } },
    },
  });
  if (!svc) throw new Error('service not found');

  const membership = await prisma.workspaceMembership.findUnique({
    where: {
      workspaceId_userId: {
        workspaceId: svc.project.workspaceId,
        userId: payload.userId,
      },
    },
  });
  if (!membership) throw new Error('forbidden');

  let allowed = canManageInfrastructure(membership.role);
  if (!allowed) {
    const projectMembership = await prisma.projectMembership.findUnique({
      where: {
        projectId_userId: { projectId: svc.project.id, userId: payload.userId },
      },
    });
    allowed = projectMembership?.role === 'ADMIN';
  }
  if (!allowed) throw new Error('forbidden');

  const { target, container } = await ServiceRuntime.resolveContainer(serviceId);
  const ssh = await connectSsh(target);

  const channel = await dockerExecPty(ssh, container, cols, rows);
  return { ssh, channel };
}

/** Allocate a PTY and attach `docker exec -it` into the container shell. */
function dockerExecPty(
  ssh: NodeSSH,
  container: string,
  cols: number,
  rows: number,
): Promise<ClientChannel> {
  return new Promise((resolve, reject) => {
    const conn = ssh.connection;
    if (!conn) {
      reject(new Error('SSH connection not ready'));
      return;
    }
    const cmd = dockerExecInteractiveCommand(container);
    conn.exec(
      cmd,
      {
        pty: {
          term: 'xterm-256color',
          cols,
          rows,
        },
      },
      (err, stream) => {
        if (err || !stream) {
          reject(err ?? new Error('Failed to start docker exec PTY'));
          return;
        }
        resolve(stream);
      },
    );
  });
}

function clampDim(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, Math.floor(n)));
}
