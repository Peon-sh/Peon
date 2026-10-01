import { cn } from '@/lib/utils';

export type Tone = 'success' | 'warning' | 'destructive' | 'info' | 'muted';

const TONE_CLASS: Record<Tone, string> = {
  success: 'bg-success/10 text-success',
  warning: 'bg-warning/10 text-warning',
  destructive: 'bg-destructive/10 text-destructive',
  info: 'bg-info/10 text-info',
  muted: 'bg-secondary text-muted-foreground',
};

const TONE_DOT: Record<Tone, string> = {
  success: 'bg-success animate-status-pulse',
  warning: 'bg-warning animate-status-pulse-fast',
  destructive: 'bg-destructive',
  info: 'bg-info',
  muted: 'bg-muted-foreground',
};

export function statusTone(status?: string | null): Tone {
  const s = (status ?? '').toUpperCase();
  // Destructive first: 'DISCONNECTED' contains 'CONNECTED', 'UNREACHABLE' contains 'REACHABLE'.
  if (['FAILED', 'ERROR', 'DEGRADED', 'UNHEALTHY', 'UNREACHABLE', 'DISCONNECTED', 'EXITED'].some((x) => s.includes(x))) return 'destructive';
  if (['RUNNING', 'FINISHED', 'SUCCESS', 'HEALTHY', 'REACHABLE', 'ONLINE', 'ACTIVE', 'CONNECTED'].some((x) => s.includes(x))) return 'success';
  if (['STARTING', 'QUEUED', 'IN_PROGRESS', 'BUILDING', 'RESTARTING', 'PENDING'].some((x) => s.includes(x))) return 'warning';
  return 'muted';
}

/** "NEEDS_SETUP" -> "Needs setup"; "Needs setup" stays as is. */
export function statusLabel(status: string): string {
  const words = status.replace(/_/g, ' ').trim();
  if (words === words.toUpperCase()) {
    const lower = words.toLowerCase();
    return lower.charAt(0).toUpperCase() + lower.slice(1);
  }
  return words;
}

export function StatusBadge({ status, tone, className }: { status: string; tone?: Tone; className?: string }) {
  const resolved = tone ?? statusTone(status);
  return (
    <span
      data-tone={resolved}
      className={cn('inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium', TONE_CLASS[resolved], className)}
    >
      <span className={cn('size-1.5 shrink-0 rounded-full', TONE_DOT[resolved])} />
      <span>{statusLabel(status)}</span>
    </span>
  );
}
