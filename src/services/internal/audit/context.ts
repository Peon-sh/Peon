import { AsyncLocalStorage } from 'node:async_hooks';
import type { AuditActorType, WorkspaceRole } from '@/lib/prisma';

export type AuditActorContext = {
  userId?: string | null;
  actorType: AuditActorType;
  actorRole?: WorkspaceRole | null;
};

const storage = new AsyncLocalStorage<AuditActorContext>();

/** Bind actor for the remainder of the current async call chain (routes / MCP). */
export function setAuditActor(actor: AuditActorContext): void {
  storage.enterWith(actor);
}

export function getAuditActor(): AuditActorContext | undefined {
  return storage.getStore();
}

export function runWithAuditActor<T>(actor: AuditActorContext, fn: () => Promise<T>): Promise<T> {
  return storage.run(actor, fn);
}
