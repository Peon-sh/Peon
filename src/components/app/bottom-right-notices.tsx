'use client';

import { ActiveDeploymentsToast } from '@/components/app/active-deployments-toast';
import { RedeployPrompt } from '@/components/app/redeploy-prompt';

/** Shared bottom-right notice stack for the authenticated app shell. */
export function BottomRightNotices() {
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex flex-col items-end gap-3 p-4 sm:p-6">
      <RedeployPrompt />
      <ActiveDeploymentsToast />
    </div>
  );
}
