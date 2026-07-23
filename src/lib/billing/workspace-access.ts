import {
  isBillingEntitled,
  isOverProjectLimit,
} from '@/lib/billing/entitlement';
import type { WorkspaceSummary } from '@/store/auth';
import { currentWorkspace, useAuthStore } from '@/store/auth';
import { publicEnv } from '@/lib/env';

export function workspaceBilling(ws: WorkspaceSummary | null | undefined) {
  return ws?.billing ?? null;
}

/** True when the workspace may write/deploy (active plan and within project limit). */
export function isWorkspaceWritable(ws: WorkspaceSummary | null | undefined): boolean {
  if (!publicEnv.billingEnabled) return true;
  const billing = workspaceBilling(ws);
  if (!billing?.enabled) return true;
  if (!isBillingEntitled(billing)) return false;
  return !isOverProjectLimit(billing, billing.projectCount);
}

export function isWorkspaceEntitled(ws: WorkspaceSummary | null | undefined): boolean {
  if (!publicEnv.billingEnabled) return true;
  const billing = workspaceBilling(ws);
  if (!billing?.enabled) return true;
  return isBillingEntitled(billing);
}

/** OWNER / ADMIN — infra + project manage at workspace scope. */
export function canManageWorkspace(ws: WorkspaceSummary | null | undefined): boolean {
  return ws?.role === 'OWNER' || ws?.role === 'ADMIN';
}

export type AccessBlockReason = 'role' | 'billing' | 'over_limit' | null;

/**
 * Why a manage/write action is blocked on the client.
 * Project-level `canManage` still comes from the project API when needed.
 */
export function getWriteBlockReason(
  ws: WorkspaceSummary | null | undefined,
  opts?: { requireWorkspaceAdmin?: boolean; projectCanManage?: boolean },
): AccessBlockReason {
  if (opts?.requireWorkspaceAdmin && !canManageWorkspace(ws)) return 'role';
  if (opts?.projectCanManage === false) return 'role';
  if (!publicEnv.billingEnabled) return null;
  const billing = workspaceBilling(ws);
  if (!billing?.enabled) return null;
  if (!isBillingEntitled(billing)) return 'billing';
  if (isOverProjectLimit(billing, billing.projectCount)) return 'over_limit';
  return null;
}

export function useCurrentWorkspaceAccess(opts?: {
  requireWorkspaceAdmin?: boolean;
  projectCanManage?: boolean;
}) {
  const ws = useAuthStore((s) => {
    const id = s.currentWorkspaceId;
    return s.workspaces.find((w) => w.id === id) ?? null;
  });
  const block = getWriteBlockReason(ws, opts);
  return {
    workspace: ws,
    billing: workspaceBilling(ws),
    entitled: isWorkspaceEntitled(ws),
    writable: isWorkspaceWritable(ws),
    canManageWorkspace: canManageWorkspace(ws),
    block,
    blocked: block != null,
  };
}

export function accessBlockMessage(reason: AccessBlockReason): string {
  switch (reason) {
    case 'role':
      return 'You need owner or admin access to change this.';
    case 'billing':
      return 'Peon Pro is required for this action. Subscribe from Settings → Subscription or Upgrade.';
    case 'over_limit':
      return 'Project count exceeds your plan. Delete projects or add capacity before making changes.';
    default:
      return '';
  }
}

/** Convenience for non-hook call sites. */
export function currentWorkspaceAccess(opts?: {
  requireWorkspaceAdmin?: boolean;
  projectCanManage?: boolean;
}) {
  return getWriteBlockReason(currentWorkspace(), opts);
}
