'use client';

import { useEffect } from 'react';
import { Rocket, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useRedeployNoticeStore } from '@/store/redeploy-notice';

const AUTO_DISMISS_MS = 30_000;

/**
 * Non-blocking bottom-right notice after config changes that need a redeploy.
 * Driven by `useRedeployNoticeStore` so it stacks with other app notices.
 */
export function RedeployPrompt() {
  const open = useRedeployNoticeStore((s) => s.open);
  const busy = useRedeployNoticeStore((s) => s.busy);
  const resetKey = useRedeployNoticeStore((s) => s.resetKey);
  const onRedeploy = useRedeployNoticeStore((s) => s.onRedeploy);
  const hide = useRedeployNoticeStore((s) => s.hide);

  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => hide(), AUTO_DISMISS_MS);
    return () => window.clearTimeout(t);
  }, [open, resetKey, hide]);

  if (!open) return null;

  return (
    <div
      className={cn(
        'pointer-events-auto w-full max-w-sm rounded-lg border bg-card shadow-lg',
        'animate-in slide-in-from-bottom-4 fade-in duration-200',
      )}
      role="status"
    >
      <div className="flex items-start gap-3 p-4">
        <div className="bg-phosphor/15 text-phosphor mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md">
          <Rocket className="size-4" />
        </div>
        <div className="min-w-0 flex-1 space-y-1">
          <p className="text-[13px] font-semibold">Redeploy to apply changes</p>
          <p className="text-muted-foreground text-[12px] leading-relaxed">
            Settings were saved. Redeploy for them to take effect on the running service.
          </p>
          <div className="flex items-center gap-2 pt-2">
            <Button
              type="button"
              size="sm"
              onClick={() => {
                onRedeploy?.();
                hide();
              }}
              disabled={busy}
            >
              Redeploy now
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => hide()}>
              Dismiss
            </Button>
          </div>
        </div>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="text-muted-foreground -mt-1 -mr-1 size-7 shrink-0 p-0"
          onClick={() => hide()}
          aria-label="Dismiss"
        >
          <X className="size-3.5" />
        </Button>
      </div>
    </div>
  );
}
