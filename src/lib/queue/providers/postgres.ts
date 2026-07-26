import { prisma } from '@/lib/prisma';
import { type QueueMessage, type QueueName, queueForMessage } from '../messages';
import type { QueueProvider, ReceivedJob } from '../types';

/**
 * Postgres-backed queue. Default for installations without AWS.
 *
 * ## Why not a library
 *
 * Postgres is already a hard dependency, and the surface actually needed here —
 * claim, lease, retry, attempt cap, fail — is small. pg-boss or graphile-worker
 * would each bring a second schema, migration set and polling loop, duplicating
 * the handler registry and shutdown logic that already exist in `worker/`.
 *
 * ## Claiming
 *
 * `SELECT ... FOR UPDATE SKIP LOCKED` inside a transaction. Two workers running
 * the same statement concurrently cannot receive the same row: the first locks
 * it, the second skips past it. This is the standard Postgres queue pattern and
 * the reason no external broker is needed.
 *
 * ## Crash recovery
 *
 * Claiming does not delete the row — it pushes `visibleAt` forward by the lease
 * duration and marks it `PROCESSING`. A worker that dies mid-job never
 * acknowledges, so once the lease expires the row is visible again and another
 * worker picks it up. **A job cannot remain PROCESSING forever.**
 *
 * The trade-off is at-least-once delivery: a job whose worker hangs past the
 * lease may run twice. That matches SQS's visibility-timeout semantics, which
 * the existing handlers were already written against.
 */

/** How long a claimed job stays invisible. Matches the previous SQS setting. */
const LEASE_SECONDS = 900;

/** Poll interval while long-polling for work. */
const POLL_INTERVAL_MS = 1_000;

/** Exponential backoff between retries, capped. */
function backoffSeconds(attempts: number): number {
  return Math.min(2 ** attempts * 5, 300);
}

const workerId = `${process.pid}-${Math.random().toString(36).slice(2, 8)}`;

interface ClaimedRow {
  id: string;
  payload: unknown;
  attempts: number;
}

export class PostgresQueueProvider implements QueueProvider {
  readonly name = 'postgres' as const;

  async enqueue(message: QueueMessage): Promise<void> {
    await prisma.queueJob.create({
      data: {
        queue: queueForMessage(message),
        type: message.type,
        payload: message as unknown as object,
      },
    });
  }

  /**
   * Atomically claim up to `max` due jobs.
   *
   * One statement so the read and the lease write cannot interleave with
   * another worker. `SKIP LOCKED` is what makes concurrent workers safe.
   */
  private async claim(queue: QueueName, max: number): Promise<ClaimedRow[]> {
    const leaseUntil = new Date(Date.now() + LEASE_SECONDS * 1000);

    return prisma.$queryRaw<ClaimedRow[]>`
      UPDATE "QueueJob"
      SET "status"    = 'PROCESSING',
          "visibleAt" = ${leaseUntil},
          "claimedAt" = NOW(),
          "claimedBy" = ${workerId},
          "attempts"  = "QueueJob"."attempts" + 1,
          "updatedAt" = NOW()
      WHERE "id" IN (
        SELECT "id" FROM "QueueJob"
        WHERE "queue" = ${queue}
          AND "status" IN ('PENDING', 'PROCESSING')
          AND "visibleAt" <= NOW()
        ORDER BY "visibleAt" ASC
        LIMIT ${max}
        FOR UPDATE SKIP LOCKED
      )
      RETURNING "id", "payload", "attempts"
    `;
  }

  async receiveMessages(
    queue: QueueName,
    waitSeconds: number,
    max: number,
  ): Promise<ReceivedJob[]> {
    const deadline = Date.now() + Math.max(0, waitSeconds) * 1000;

    for (;;) {
      const rows = await this.claim(queue, Math.max(1, max));

      if (rows.length > 0) {
        const jobs: ReceivedJob[] = [];
        for (const row of rows) {
          const message = row.payload as QueueMessage;
          // A payload that will never parse cannot succeed on retry.
          if (!message || typeof message !== 'object' || typeof message.type !== 'string') {
            await this.markFailed(row.id, 'Malformed job payload');
            continue;
          }
          // Attempt cap is enforced at claim time so a poison job cannot loop
          // forever even if the handler always throws.
          if (row.attempts > (await this.maxAttemptsFor(row.id))) {
            await this.markFailed(row.id, 'Exceeded maximum attempts');
            continue;
          }
          jobs.push({ message, receipt: row.id, attempts: row.attempts });
        }
        if (jobs.length > 0) return jobs;
      }

      if (Date.now() >= deadline) return [];
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    }
  }

  private async maxAttemptsFor(id: string): Promise<number> {
    const row = await prisma.queueJob.findUnique({
      where: { id },
      select: { maxAttempts: true },
    });
    return row?.maxAttempts ?? 5;
  }

  private async markFailed(id: string, error: string): Promise<void> {
    await prisma.queueJob
      .update({
        where: { id },
        data: { status: 'FAILED', lastError: error.slice(0, 2000), completedAt: new Date() },
      })
      .catch(() => undefined);
  }

  /** Acknowledge success. */
  async deleteMessage(_queue: QueueName, receipt: string): Promise<void> {
    await prisma.queueJob
      .update({
        where: { id: receipt },
        data: { status: 'COMPLETED', completedAt: new Date(), lastError: null },
      })
      .catch(() => undefined);
  }

  /** Terminal failure — do not retry. */
  async failMessage(_queue: QueueName, receipt: string, error: string): Promise<void> {
    await this.markFailed(receipt, error);
  }

  /**
   * Release a job for retry sooner than the lease would, with backoff. Called by
   * the worker when a handler throws, so a transient failure does not hold the
   * job invisible for the full lease.
   */
  async retryMessage(receipt: string, error: string): Promise<void> {
    const row = await prisma.queueJob.findUnique({
      where: { id: receipt },
      select: { attempts: true, maxAttempts: true },
    });
    if (!row) return;

    if (row.attempts >= row.maxAttempts) {
      await this.markFailed(receipt, `${error} (gave up after ${row.attempts} attempts)`);
      return;
    }

    await prisma.queueJob
      .update({
        where: { id: receipt },
        data: {
          status: 'PENDING',
          visibleAt: new Date(Date.now() + backoffSeconds(row.attempts) * 1000),
          lastError: error.slice(0, 2000),
          claimedBy: null,
          claimedAt: null,
        },
      })
      .catch(() => undefined);
  }

  /** Delete completed jobs older than `olderThanDays`. */
  async purgeCompleted(olderThanDays = 7): Promise<number> {
    const cutoff = new Date(Date.now() - olderThanDays * 86_400_000);
    const res = await prisma.queueJob.deleteMany({
      where: { status: 'COMPLETED', completedAt: { lt: cutoff } },
    });
    return res.count;
  }
}
