import { cn } from '@/lib/utils';

/**
 * Peon logo mark: terminal prompt chevron + cursor in a rounded tile.
 * Uses currentColor-independent brand colors so it reads on any background.
 */
export function LogoMark({ className, size = 28 }: { className?: string; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn('shrink-0', className)}
      aria-hidden="true"
    >
      <rect width="64" height="64" rx="14" className="fill-[#050807]" />
      <rect x="1" y="1" width="62" height="62" rx="13" className="stroke-[#1B2822]" strokeWidth="2" />
      <path
        d="M18 22 L30 32 L18 42"
        stroke="#3ECF8E"
        strokeWidth="5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <rect x="34" y="39" width="14" height="5" rx="2.5" fill="#3ECF8E" />
    </svg>
  );
}

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-2', className)}>
      <LogoMark />
      <span className="font-heading text-base font-800 tracking-tight">
        <span className="text-phosphor">peon</span>
      </span>
    </span>
  );
}
