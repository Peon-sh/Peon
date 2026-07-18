import 'dotenv/config';
import { startScheduler } from './scheduler';

let running = true;

function main() {
  startScheduler((m) => console.log(`[schedule] ${m}`), () => running);
  console.log('[schedule] cron scheduler started (run only one instance)');
}

function shutdown() {
  console.log('[schedule] shutting down…');
  running = false;
  setTimeout(() => process.exit(0), 1000);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

try {
  main();
} catch (err) {
  console.error('[schedule] fatal:', err);
  process.exit(1);
}
