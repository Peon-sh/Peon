/** Pure helpers for per-server deploy gating (testable without Prisma). */

export function shouldRejectQueue(queuedCount: number, limit: number): boolean {
  return queuedCount >= limit;
}

export function availableSlots(concurrentBuilds: number, inProgress: number): number {
  return Math.max(0, concurrentBuilds - inProgress);
}
