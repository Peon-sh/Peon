import { prisma } from '../src/lib/prisma';
import { enqueue } from '../src/lib/queue/sqs';
import { cronMatches } from '../src/lib/queue/cron';

/**
 * Cron scheduler (run via `pnpm schedule`). Evaluates enabled scheduled
 * tasks/backups and threshold docker-cleanup settings once per minute and
 * enqueues matching jobs. Dedupes per minute with an in-memory guard — run
 * only one schedule process; it is not safe across multiple instances.
 */

type Log = (msg: string) => void;

/** Guards against firing the same schedule twice within one minute bucket. */
const lastFired = new Map<string, string>();

function minuteBucket(date: Date): string {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}-${date.getHours()}-${date.getMinutes()}`;
}

function shouldFire(key: string, expr: string, now: Date): boolean {
  if (!cronMatches(expr, now)) return false;
  const bucket = minuteBucket(now);
  if (lastFired.get(key) === bucket) return false;
  lastFired.set(key, bucket);
  return true;
}

async function tick(log: Log) {
  const now = new Date();

  // Scheduled tasks
  const tasks = await prisma.scheduledTask.findMany({ where: { enabled: true } });
  for (const task of tasks) {
    if (!shouldFire(`task:${task.id}`, task.frequency, now)) continue;
    const execution = await prisma.scheduledTaskExecution.create({
      data: { taskId: task.id, status: 'RUNNING' },
    });
    await enqueue({ type: 'task.run', taskId: task.id, executionId: execution.id });
    log(`enqueued task.run for "${task.name}" (${task.id})`);
  }

  // Scheduled database backups
  const backups = await prisma.scheduledBackup.findMany({ where: { enabled: true } });
  for (const backup of backups) {
    if (!shouldFire(`backup:${backup.id}`, backup.frequency, now)) continue;
    const execution = await prisma.scheduledBackupExecution.create({
      data: { backupId: backup.id, status: 'RUNNING', dumpAll: backup.dumpAll },
    });
    await enqueue({ type: 'backup.run', backupId: backup.id, executionId: execution.id });
    log(`enqueued backup.run for backup ${backup.id}`);
  }

  // Threshold-based docker cleanup per server
  const cleanupSettings = await prisma.serverSetting.findMany({
    where: { forceDockerCleanup: true },
  });
  for (const setting of cleanupSettings) {
    if (!shouldFire(`cleanup:${setting.serverId}`, setting.dockerCleanupFrequency, now)) continue;
    await enqueue({ type: 'server.cleanup', serverId: setting.serverId });
    log(`enqueued server.cleanup for server ${setting.serverId}`);
  }
}

/** Starts the scheduler loop; ticks every minute, aligned to the top of the minute. */
export function startScheduler(log: Log, isRunning: () => boolean) {
  const run = async () => {
    if (!isRunning()) return;
    try {
      await tick(log);
    } catch (err) {
      console.error('[scheduler] tick error:', err instanceof Error ? err.message : err);
    }
  };

  // Align the first tick to the next minute boundary, then run every 60s.
  const msToNextMinute = 60_000 - (Date.now() % 60_000);
  setTimeout(() => {
    void run();
    setInterval(() => void run(), 60_000);
  }, msToNextMinute);

  log(`scheduler armed; first tick in ${Math.round(msToNextMinute / 1000)}s`);
}
