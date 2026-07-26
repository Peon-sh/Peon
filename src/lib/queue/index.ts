import { isE2eMode } from '@/lib/e2e';
import { serverEnv } from '@/lib/env';
import type { QueueMessage, QueueName } from './messages';
import type { QueueProvider, ReceivedJob } from './types';
import { isSqsConfigured } from './providers/sqs';

export type { QueueProvider, ReceivedJob } from './types';
export type { QueueMessage, QueueName } from './messages';

let provider: QueueProvider | null = null;
let loading: Promise<QueueProvider> | null = null;

/**
 * Pick a transport.
 *
 * Backwards compatibility is the priority: an existing installation that has
 * SQS URLs configured and no `QUEUE_DRIVER` must keep using SQS. It must never
 * be silently switched to the Postgres queue, which would strand in-flight jobs
 * in SQS with nothing polling for them.
 *
 * New installations default to `postgres`, which needs no AWS account.
 */
export function resolveQueueDriver(): 'sqs' | 'postgres' {
  const explicit = serverEnv().QUEUE_DRIVER;
  if (explicit === 'sqs' || explicit === 'postgres') return explicit;
  return isSqsConfigured() ? 'sqs' : 'postgres';
}

/**
 * Resolve the provider. Async so each implementation is imported only when
 * selected — the SQS path never pulls in Prisma, and the Postgres path never
 * pulls in the AWS SDK.
 */
export function getQueueProvider(): Promise<QueueProvider> {
  if (provider) return Promise.resolve(provider);
  if (loading) return loading;

  loading = (async () => {
    if (resolveQueueDriver() === 'sqs') {
      const { SqsQueueProvider } = await import('./providers/sqs');
      provider = new SqsQueueProvider();
    } else {
      const { PostgresQueueProvider } = await import('./providers/postgres');
      provider = new PostgresQueueProvider();
    }
    return provider;
  })();

  return loading;
}

/** Replace or clear the provider (tests). */
export function setQueueProvider(next: QueueProvider | null): void {
  provider = next;
  loading = null;
}

/** Enqueue a job. Routing to the correct queue is automatic. */
export async function enqueue(message: QueueMessage): Promise<void> {
  if (isE2eMode()) return;
  const p = await getQueueProvider();
  await p.enqueue(message);
}

export async function receiveMessages(
  queue: QueueName,
  waitSeconds: number,
  max = 1,
): Promise<ReceivedJob[]> {
  const p = await getQueueProvider();
  return p.receiveMessages(queue, waitSeconds, max);
}

export async function deleteMessage(queue: QueueName, receipt: string): Promise<void> {
  const p = await getQueueProvider();
  await p.deleteMessage(queue, receipt);
}

export async function failMessage(
  queue: QueueName,
  receipt: string,
  error: string,
): Promise<void> {
  const p = await getQueueProvider();
  if (p.failMessage) await p.failMessage(queue, receipt, error);
  else await p.deleteMessage(queue, receipt);
}

export async function shutdownQueue(): Promise<void> {
  await provider?.shutdown?.();
}
