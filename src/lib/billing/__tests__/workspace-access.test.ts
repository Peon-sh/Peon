import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import {
  getWriteBlockReason,
  isWorkspaceEntitled,
  isWorkspaceWritable,
} from '@/lib/billing/workspace-access';
import type { WorkspaceSummary } from '@/store/auth';

vi.mock('@/lib/env', () => ({
  publicEnv: { billingEnabled: true },
}));

function ws(
  overrides: Partial<Omit<WorkspaceSummary, 'billing'>> & {
    billing?: Partial<WorkspaceSummary['billing']>;
  } = {},
): WorkspaceSummary {
  const { billing, ...rest } = overrides;
  return {
    id: 'ws_1',
    name: 'Team',
    slug: 'team',
    role: 'OWNER',
    personal: false,
    billing: {
      enabled: true,
      status: 'active',
      quantity: 2,
      periodPaidQuantity: null,
      cancelAtPeriodEnd: false,
      currentPeriodEnd: null,
      projectCount: 1,
      ...billing,
    },
    ...rest,
  };
}

describe('workspace-access', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('treats entitled workspace under seat limit as writable', () => {
    expect(isWorkspaceWritable(ws())).toBe(true);
    expect(isWorkspaceEntitled(ws())).toBe(true);
    expect(getWriteBlockReason(ws())).toBeNull();
  });

  it('blocks when subscription is inactive', () => {
    const inactive = ws({ billing: { status: 'inactive', quantity: 0 } });
    expect(isWorkspaceWritable(inactive)).toBe(false);
    expect(getWriteBlockReason(inactive)).toBe('billing');
  });

  it('blocks when over project limit', () => {
    const over = ws({ billing: { quantity: 1, projectCount: 2 } });
    expect(isWorkspaceWritable(over)).toBe(false);
    expect(getWriteBlockReason(over)).toBe('over_limit');
  });

  it('blocks project writes when projectCanManage is false', () => {
    expect(getWriteBlockReason(ws(), { projectCanManage: false })).toBe('role');
  });

  it('blocks workspace-admin actions for members', () => {
    expect(
      getWriteBlockReason(ws({ role: 'MEMBER' }), { requireWorkspaceAdmin: true }),
    ).toBe('role');
  });
});
