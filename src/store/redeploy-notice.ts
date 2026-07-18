import { create } from 'zustand';

interface RedeployNoticeState {
  open: boolean;
  busy: boolean;
  resetKey: number;
  onRedeploy: (() => void) | null;
  show: (opts: { onRedeploy: () => void; busy?: boolean }) => void;
  setBusy: (busy: boolean) => void;
  hide: () => void;
}

/** Global redeploy CTA — rendered in the app bottom-right stack. */
export const useRedeployNoticeStore = create<RedeployNoticeState>((set) => ({
  open: false,
  busy: false,
  resetKey: 0,
  onRedeploy: null,
  show: ({ onRedeploy, busy = false }) =>
    set((s) => ({
      open: true,
      busy,
      onRedeploy,
      resetKey: s.resetKey + 1,
    })),
  setBusy: (busy) => set({ busy }),
  hide: () => set({ open: false, onRedeploy: null, busy: false }),
}));
