import { cn } from '@/lib/utils';

type Tone = 'success' | 'warning' | 'destructive' | 'info' | 'muted';

const TONE_TEXT: Record<Tone, string> = {
  success: 'text-success',
  warning: 'text-warning',
  destructive: 'text-destructive',
  info: 'text-info',
  muted: 'text-muted-foreground',
};

const TONE_DOT: Record<Tone, string> = {
  success: 'bg-success animate-status-pulse',
  warning: 'bg-warning animate-status-pulse-fast',
  destructive: 'bg-destructive',
  info: 'bg-info',
  muted: 'bg-faint',
};

/** Maps common resource statuses to a tone. */
export function statusTone(status?: string | null): Tone {
  const s = (status ?? '').toUpperCase();
  if (['RUNNING', 'FINISHED', 'SUCCESS', 'HEALTHY', 'REACHABLE', 'ONLINE', 'ACTIVE', 'CONNECTED'].some((x) => s.includes(x)))
    return 'success';
  if (['STARTING', 'QUEUED', 'IN_PROGRESS', 'BUILDING', 'RESTARTING', 'PENDING'].some((x) => s.includes(x)))
    return 'warning';
  if (['FAILED', 'ERROR', 'DEGRADED', 'UNHEALTHY', 'UNREACHABLE'].some((x) => s.includes(x)))
    return 'destructive';
  if (['CANCELLED', 'CANCELED', 'STOPPED', 'EXITED', 'SUSPENDED'].some((x) => s.includes(x)))
    return 'muted';
  return 'muted';
}

/** Terminal-style status: colored pulsing dot + colored lowercase label. */
export function StatusBadge({
  status,
  tone,
  className,
}: {
  status: string;
  tone?: Tone;
  className?: string;
}) {
  const resolved = tone ?? statusTone(status);
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 text-xs font-semibold',
        TONE_TEXT[resolved],
        className,
      )}
    >
      <span className={cn('size-[7px] shrink-0 rounded-full', TONE_DOT[resolved])} />
      <span className="lowercase">{status.toLowerCase().replace(/_/g, ' ')}</span>
    </span>
  );
}
