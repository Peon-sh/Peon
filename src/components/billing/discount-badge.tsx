import { cn } from '@/lib/utils';

/** Highlighted savings chip used on plan pickers and upgrade CTAs. */
export function DiscountBadge({
  percent,
  className,
  size = 'md',
}: {
  percent: number;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}) {
  return (
    <span
      className={cn(
        'bg-phosphor text-background inline-flex items-center rounded font-bold tracking-tight',
        size === 'sm' && 'px-1.5 py-0.5 text-[10px]',
        size === 'md' && 'px-2 py-0.5 text-[11px]',
        size === 'lg' && 'px-2.5 py-1 text-xs',
        className,
      )}
    >
      Save {percent}%
    </span>
  );
}
