import 'dotenv/config';
import { serverEnv } from '../src/lib/env';
import { receiveMessages, deleteMessage } from '../src/lib/queue/sqs';
import type { QueueMessage, QueueName } from '../src/lib/queue/messages';
import { dispatch, loadHandlers } from './handlers';
import { NotFoundError } from '../src/lib/errors';
import type { Message } from '@aws-sdk/client-sqs';

const QUEUES: QueueName[] = ['deployments', 'tasks'];

/** SQS ReceiveMessage allows at most 10 messages per call. */
const SQS_RECEIVE_MAX = 10;

let running = true;

async function handleMessage(name: QueueName, raw: Message): Promise<void> {
  if (!raw.Body || !raw.ReceiptHandle) return;

  let parsed: QueueMessage;
  try {
    parsed = JSON.parse(raw.Body) as QueueMessage;
  } catch {
    console.error(`[worker:${name}] invalid message body, deleting`);
    await deleteMessage(name, raw.ReceiptHandle);
    return;
  }

  const log = (m: string) => console.log(`[worker:${name}:${parsed.type}] ${m}`);
  try {
    await dispatch(parsed, { log });
    await deleteMessage(name, raw.ReceiptHandle);
    log('done');
  } catch (err) {
    console.error(`[worker:${name}:${parsed.type}] failed:`, err instanceof Error ? err.message : err);
    if (err instanceof NotFoundError) {
      // The referenced record no longer exists (stale message) —
      // retrying can never succeed, so drop it instead of redelivering.
      await deleteMessage(name, raw.ReceiptHandle);
      log('dropped stale message (target record deleted)');
    }
    // Other errors: leave for redelivery after the visibility timeout.
  }
}

/**
 * Poll a queue and process up to `concurrency` messages in parallel.
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
      const messages = await receiveMessages(name, waitSeconds, Math.min(SQS_RECEIVE_MAX, slots));
      if (messages.length === 0) continue;

      for (const raw of messages) {
        const job = handleMessage(name, raw).finally(() => {
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
  const concurrency = Math.max(1, env.WORKER_MAX_CONCURRENCY);
  await loadHandlers();
  console.log(
    `[worker] started; polling queues: ${QUEUES.join(', ')}; concurrency=${concurrency}`,
  );
  await Promise.all(QUEUES.map((q) => pollQueue(q, env.WORKER_POLL_WAIT_SECONDS, concurrency)));
}

function shutdown() {
  console.log('[worker] shutting down…');
  running = false;
  setTimeout(() => process.exit(0), 1000);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

main().catch((err) => {
  console.error('[worker] fatal:', err);
  process.exit(1);
});
