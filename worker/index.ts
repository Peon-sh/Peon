import 'dotenv/config';
import { serverEnv } from '../src/lib/env';
import { assertEncryptionKeyUsable } from '../src/lib/crypto/preflight';
import {
  deleteMessage,
  failMessage,
  getQueueProvider,
  receiveMessages,
  resolveQueueDriver,
  shutdownQueue,
  type ReceivedJob,
} from '../src/lib/queue';
import type { QueueName } from '../src/lib/queue/messages';
import { dispatch, loadHandlers } from './handlers';
import { NotFoundError } from '../src/lib/errors';

const QUEUES: QueueName[] = ['deployments', 'tasks'];

let running = true;

async function handleJob(name: QueueName, job: ReceivedJob): Promise<void> {
  const { message, receipt } = job;
  const log = (m: string) => console.log(`[worker:${name}:${message.type}] ${m}`);

  try {
    await dispatch(message, { log });
    await deleteMessage(name, receipt);
    log('done');
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    console.error(`[worker:${name}:${message.type}] failed:`, reason);

    if (err instanceof NotFoundError) {
      // The referenced record no longer exists (stale message) — retrying can
      // never succeed, so drop it instead of redelivering.
      await failMessage(name, receipt, reason);
      log('dropped stale message (target record deleted)');
      return;
    }

    // Postgres can release the job for retry immediately with backoff instead of
    // holding it invisible for the full lease. SQS has no client-side equivalent:
    // not acknowledging is what triggers redelivery there.
    const provider = await getQueueProvider();
    if (provider.name === 'postgres') {
      const pg = provider as { retryMessage?: (r: string, e: string) => Promise<void> };
      await pg.retryMessage?.(receipt, reason);
    }
  }
}

/**
 * Poll a queue and process up to `concurrency` jobs in parallel.
 * Keeps fetching while slots are free so long-running deploys don't block others.
 */
async function pollQueue(name: QueueName, waitSeconds: number, concurrency: number) {
  const inFlight = new Set<Promise<void>>();

  while (running) {
    try {
      // Wait for a free slot before long-polling again.
      while (running && inFlight.size >= concurrency) {
        await Promise.race(inFlight);
      }
      if (!running) break;

      const slots = Math.max(1, concurrency - inFlight.size);
      const jobs = await receiveMessages(name, waitSeconds, slots);
      if (jobs.length === 0) continue;

      for (const raw of jobs) {
        const job = handleJob(name, raw).finally(() => {
          inFlight.delete(job);
        });
        inFlight.add(job);

        // If we filled concurrency mid-batch, stop scheduling more from this receive.
        if (inFlight.size >= concurrency) break;
      }
    } catch (err) {
      console.error(`[worker:${name}] poll error:`, err instanceof Error ? err.message : err);
      await new Promise((r) => setTimeout(r, 5000));
    }
  }

  if (inFlight.size > 0) {
    await Promise.allSettled(inFlight);
  }
}

async function main() {
  const env = serverEnv();
  // Warns on a legacy/derived key, refuses only on a provably fresh install.
  await assertEncryptionKeyUsable();
  const concurrency = Math.max(1, env.WORKER_MAX_CONCURRENCY);
  await loadHandlers();
  console.log(
    `[worker] started; queue driver=${resolveQueueDriver()}; ` +
      `polling: ${QUEUES.join(', ')}; concurrency=${concurrency}`,
  );
  await Promise.all(QUEUES.map((q) => pollQueue(q, env.WORKER_POLL_WAIT_SECONDS, concurrency)));
}

function shutdown() {
  console.log('[worker] shutting down…');
  running = false;
  // Give in-flight jobs a moment to acknowledge before the process exits.
  setTimeout(() => {
    void shutdownQueue().finally(() => process.exit(0));
  }, 1000);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

main().catch((err) => {
  console.error('[worker] fatal:', err);
  process.exit(1);
});
