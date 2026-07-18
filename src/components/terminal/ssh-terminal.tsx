'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import { Button } from '@/components/ui/button';
import { Panel } from '@/components/app/page';
import { cn } from '@/lib/utils';
import { createServerTerminalSession } from '@/services/api/server';
import { createServiceTerminalSession } from '@/services/api/service';

type ConnectionState = 'idle' | 'connecting' | 'connected' | 'disconnected' | 'error';

type SshTerminalProps = {
  serverId?: string;
  serviceId?: string;
  className?: string;
};

/**
 * Interactive terminal (xterm.js + WebSocket PTY).
 * - serverId → host SSH login shell
 * - serviceId → docker exec -it inside the service container
 * Connection starts only when the user clicks Connect.
 */
export function SshTerminal({ serverId, serviceId, className }: SshTerminalProps) {
  if (!serverId && !serviceId) {
    throw new Error('SshTerminal requires serverId or serviceId');
  }
  if (serverId && serviceId) {
    throw new Error('SshTerminal accepts only one of serverId or serviceId');
  }

  const mode = serviceId ? 'service' : 'server';
  const targetId = serviceId ?? serverId!;

  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const pingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [state, setState] = useState<ConnectionState>('idle');
  const [error, setError] = useState<string | null>(null);

  const clearPing = () => {
    if (pingRef.current) clearInterval(pingRef.current);
    pingRef.current = null;
  };

  const closeSocket = useCallback(() => {
    clearPing();
    const sock = socketRef.current;
    socketRef.current = null;
    if (!sock) return;
    try {
      sock.close();
    } catch {
      // ignore
    }
  }, []);

  const fit = useCallback(() => {
    const term = termRef.current;
    const fitAddon = fitRef.current;
    if (!term || !fitAddon) return;
    try {
      fitAddon.fit();
    } catch {
      return;
    }
    const sock = socketRef.current;
    if (sock?.readyState === WebSocket.OPEN) {
      sock.send(JSON.stringify({ resize: { cols: term.cols, rows: term.rows } }));
    }
  }, []);

  // Mount xterm once; do not auto-connect.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const term = new Terminal({
      cursorBlink: true,
      fontSize: 13,
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
      theme: {
        background: '#0a0f0c',
        foreground: '#e5e5e5',
        cursor: '#9dffb0',
        selectionBackground: '#1f3d2a',
      },
      convertEol: true,
    });
    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(el);
    termRef.current = term;
    fitRef.current = fitAddon;
    term.writeln(
      mode === 'service'
        ? '\x1b[90m# Click Connect to open an interactive shell in the service container.\x1b[0m'
        : '\x1b[90m# Click Connect to open an interactive SSH session.\x1b[0m',
    );

    term.onData((data) => {
      const sock = socketRef.current;
      if (sock?.readyState === WebSocket.OPEN) {
        sock.send(JSON.stringify({ message: data }));
      }
    });

    const onResize = () => requestAnimationFrame(fit);
    const resizeObserver = new ResizeObserver(onResize);
    resizeObserver.observe(el);
    window.addEventListener('resize', onResize);
    requestAnimationFrame(fit);

    return () => {
      window.removeEventListener('resize', onResize);
      resizeObserver.disconnect();
      closeSocket();
      term.dispose();
      termRef.current = null;
      fitRef.current = null;
    };
  }, [targetId, mode, closeSocket, fit]);

  const disconnect = useCallback(() => {
    const term = termRef.current;
    closeSocket();
    setState('disconnected');
    setError(null);
    term?.writeln('\r\n\x1b[90m# Disconnected.\x1b[0m');
  }, [closeSocket]);

  const connect = useCallback(async () => {
    const term = termRef.current;
    const fitAddon = fitRef.current;
    if (!term || !fitAddon) return;

    closeSocket();
    setState('connecting');
    setError(null);
    term.writeln('\x1b[90m# Connecting…\x1b[0m');

    try {
      fitAddon.fit();
      const session =
        mode === 'service'
          ? await createServiceTerminalSession(targetId, {
              cols: term.cols,
              rows: term.rows,
            })
          : await createServerTerminalSession(targetId, {
              cols: term.cols,
              rows: term.rows,
            });

      const ws = new WebSocket(session.wsUrl);
      socketRef.current = ws;

      ws.onopen = () => {
        setState('connected');
        requestAnimationFrame(fit);
        clearPing();
        pingRef.current = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ ping: true }));
          }
        }, 25_000);
      };

      ws.onmessage = (ev) => {
        const data = typeof ev.data === 'string' ? ev.data : String(ev.data);
        if (data === 'pty-ready') {
          term.clear();
          term.focus();
          requestAnimationFrame(fit);
          return;
        }
        if (data === 'pong') return;
        if (data === 'pty-exited') {
          closeSocket();
          setState('disconnected');
          term.writeln('\r\n\x1b[33m[peon] session ended on the server\x1b[0m');
          return;
        }
        if (data.startsWith('Unauthorized:')) {
          closeSocket();
          setState('error');
          setError(data);
          term.writeln(`\r\n\x1b[31m${data}\x1b[0m`);
          return;
        }
        term.write(data);
      };

      ws.onclose = () => {
        clearPing();
        if (socketRef.current === ws) socketRef.current = null;
        setState((s) => (s === 'connecting' || s === 'connected' ? 'disconnected' : s));
      };

      ws.onerror = () => {
        setState('error');
        setError('WebSocket error — is the worker running with the terminal server?');
      };
    } catch (err) {
      setState('error');
      const message = err instanceof Error ? err.message : 'Failed to open terminal';
      setError(message);
      term.writeln(`\r\n\x1b[31m${message}\x1b[0m`);
    }
  }, [targetId, mode, closeSocket, fit]);

  const connectedLabel =
    mode === 'service' ? 'Connected · container shell' : 'Connected · interactive SSH';

  const statusLabel =
    state === 'idle'
      ? 'Not connected'
      : state === 'connecting'
        ? 'Connecting…'
        : state === 'connected'
          ? connectedLabel
          : state === 'disconnected'
            ? 'Disconnected'
            : (error ?? 'Error');

  return (
    <div className={cn('flex min-h-[min(70svh,720px)] flex-col gap-2', className)}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-muted-foreground text-[11px]">{statusLabel}</div>
        <div className="flex items-center gap-2">
          {state === 'connected' || state === 'connecting' ? (
            <Button variant="outline" size="sm" onClick={disconnect} disabled={state === 'connecting'}>
              Disconnect
            </Button>
          ) : (
            <Button size="sm" onClick={() => void connect()}>
              Connect
            </Button>
          )}
        </div>
      </div>
      <Panel
        contentClassName="bg-[#0a0f0c] flex min-h-0 flex-1 flex-col overflow-hidden p-2"
        className="flex min-h-0 flex-1 flex-col"
      >
        <div ref={containerRef} className="h-full min-h-[min(65svh,680px)] w-full" />
      </Panel>
    </div>
  );
}
