import { Badge } from '@/components/ui/badge';
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
    <Badge variant="default" data-size={size} className={cn(size === 'sm' && 'px-1.5', className)}>
      Save {percent}%
    </Badge>
  );
}
