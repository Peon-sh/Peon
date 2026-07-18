import { cn } from '@/lib/utils';

/** Tiny labelled progress meter (cpu / mem / disk). Turns amber when hot. */
export function Meter({
  label,
  percent,
  hotAt = 75,
  className,
}: {
  label: string;
  percent: number;
  /** Threshold above which the fill turns amber. */
  hotAt?: number;
  className?: string;
}) {
  const clamped = Math.max(0, Math.min(100, Math.round(percent)));
  return (
    <div className={cn('min-w-0', className)}>
      <div className="text-muted-foreground mb-1 flex justify-between text-[10px]">
        <span>{label}</span>
        <span>{clamped}%</span>
      </div>
      <div className="bg-accent h-1 overflow-hidden rounded-full">
        <div
          className={cn('h-full rounded-full', clamped >= hotAt ? 'bg-warning' : 'bg-phosphor')}
          style={{ width: `${clamped}%` }}
        />
      </div>
    </div>
  );
}
