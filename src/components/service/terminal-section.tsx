'use client';

import { SshTerminal } from '@/components/terminal/ssh-terminal';

export function TerminalSection({ serviceId }: { serviceId: string }) {
  return (
    <div className="border-border bg-card flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border p-3">
      <SshTerminal serviceId={serviceId} className="min-h-0 flex-1" />
    </div>
  );
}
