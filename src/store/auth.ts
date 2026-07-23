import { create } from 'zustand';

export interface SessionUser {
  id: string;
  email: string;
  name: string | null;
  profilePicture: string | null;
  hasPassword?: boolean;
  isInstanceAdmin: boolean;
  isInstanceOwner: boolean;
  isOnboarded: boolean;
}

/** Billing snapshot from `/api/auth/me` (local DB; refresh via me refetch after plan changes). */
export interface WorkspaceBillingSnapshot {
  enabled: boolean;
  status: string;
  quantity: number;
  periodPaidQuantity: number | null;
  cancelAtPeriodEnd: boolean;
  currentPeriodEnd: string | null;
  projectCount: number;
}

export interface WorkspaceSummary {
  id: string;
  name: string;
  slug: string;
  role: 'OWNER' | 'BILLING_ADMIN' | 'ADMIN' | 'MEMBER';
  personal: boolean;
  billing: WorkspaceBillingSnapshot;
}

interface AuthState {
  user: SessionUser | null;
  workspaces: WorkspaceSummary[];
  currentWorkspaceId: string | null;
  setSession: (user: SessionUser, workspaces: WorkspaceSummary[]) => void;
  /** Patch billing on one workspace after subscribe / seat changes (then optionally refetch /me). */
  patchWorkspaceBilling: (
    workspaceId: string,
    billing: Partial<WorkspaceBillingSnapshot>,
  ) => void;
  setCurrentWorkspace: (id: string) => void;
  clear: () => void;
}

const CURRENT_WS_KEY = 'peon.currentWorkspaceId';

const INACTIVE_BILLING: WorkspaceBillingSnapshot = {
  enabled: false,
  status: 'inactive',
  quantity: 0,
  periodPaidQuantity: null,
  cancelAtPeriodEnd: false,
  currentPeriodEnd: null,
  projectCount: 0,
};

function normalizeWorkspace(ws: WorkspaceSummary): WorkspaceSummary {
  return {
    ...ws,
    billing: { ...INACTIVE_BILLING, ...ws.billing },
  };
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  workspaces: [],
  currentWorkspaceId:
    typeof window !== 'undefined' ? localStorage.getItem(CURRENT_WS_KEY) : null,

  setSession: (user, workspaces) => {
    const normalized = workspaces.map(normalizeWorkspace);
    const stored = get().currentWorkspaceId;
    const valid = normalized.find((w) => w.id === stored);
    const currentWorkspaceId = valid?.id ?? normalized[0]?.id ?? null;
    if (typeof window !== 'undefined' && currentWorkspaceId) {
      localStorage.setItem(CURRENT_WS_KEY, currentWorkspaceId);
    }
    set({ user, workspaces: normalized, currentWorkspaceId });
  },

  patchWorkspaceBilling: (workspaceId, billing) => {
    set((state) => ({
      workspaces: state.workspaces.map((w) =>
        w.id === workspaceId
          ? { ...w, billing: { ...w.billing, ...billing } }
          : w,
      ),
    }));
  },

  setCurrentWorkspace: (id) => {
    if (typeof window !== 'undefined') localStorage.setItem(CURRENT_WS_KEY, id);
    set({ currentWorkspaceId: id });
  },

  clear: () => {
    if (typeof window !== 'undefined') localStorage.removeItem(CURRENT_WS_KEY);
    set({ user: null, workspaces: [], currentWorkspaceId: null });
  },
}));

export function currentWorkspace(): WorkspaceSummary | null {
  const { workspaces, currentWorkspaceId } = useAuthStore.getState();
  return workspaces.find((w) => w.id === currentWorkspaceId) ?? null;
}
