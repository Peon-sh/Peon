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

export interface WorkspaceSummary {
  id: string;
  name: string;
  slug: string;
  role: 'OWNER' | 'BILLING_ADMIN' | 'ADMIN' | 'MEMBER';
  personal: boolean;
}

interface AuthState {
  user: SessionUser | null;
  workspaces: WorkspaceSummary[];
  currentWorkspaceId: string | null;
  setSession: (user: SessionUser, workspaces: WorkspaceSummary[]) => void;
  setCurrentWorkspace: (id: string) => void;
  clear: () => void;
}

const CURRENT_WS_KEY = 'peon.currentWorkspaceId';

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  workspaces: [],
  currentWorkspaceId:
    typeof window !== 'undefined' ? localStorage.getItem(CURRENT_WS_KEY) : null,

  setSession: (user, workspaces) => {
    const stored = get().currentWorkspaceId;
    const valid = workspaces.find((w) => w.id === stored);
    const currentWorkspaceId = valid?.id ?? workspaces[0]?.id ?? null;
    if (typeof window !== 'undefined' && currentWorkspaceId) {
      localStorage.setItem(CURRENT_WS_KEY, currentWorkspaceId);
    }
    set({ user, workspaces, currentWorkspaceId });
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
