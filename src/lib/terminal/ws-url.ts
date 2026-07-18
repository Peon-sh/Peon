import { publicEnv, serverEnv } from '@/lib/env';

/** Append `ticket` query param to a configured or absolute WS base URL. */
export function appendTerminalTicket(base: string, ticket: string): string {
  const url = new URL(base);
  url.searchParams.set('ticket', ticket);
  return url.toString();
}

/**
 * Browser WebSocket URL for an interactive terminal session.
 * Prefer NEXT_PUBLIC_TERMINAL_WS_URL when set (production).
 */
export function terminalWsUrlForTicket(ticket: string): string {
  const configured = publicEnv.terminalWsUrl.trim();
  if (configured) return appendTerminalTicket(configured, ticket);

  const port = serverEnv().TERMINAL_WS_PORT;
  const proto = publicEnv.appUrl.startsWith('https') ? 'wss' : 'ws';
  let host = 'localhost';
  try {
    host = new URL(publicEnv.appUrl).hostname;
  } catch {
    // keep localhost
  }
  return `${proto}://${host}:${port}/terminal/ws?ticket=${encodeURIComponent(ticket)}`;
}
