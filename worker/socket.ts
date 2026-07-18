import 'dotenv/config';
import type { Server as HttpServer } from 'node:http';
import { startTerminalServer } from './terminal-server';

let terminalServer: HttpServer | null = null;

function main() {
  terminalServer = startTerminalServer((m) => console.log(`[socket] ${m}`));
  console.log('[socket] terminal WebSocket server started');
}

function shutdown() {
  console.log('[socket] shutting down…');
  terminalServer?.close();
  terminalServer = null;
  setTimeout(() => process.exit(0), 1000);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

try {
  main();
} catch (err) {
  console.error('[socket] fatal:', err);
  process.exit(1);
}
