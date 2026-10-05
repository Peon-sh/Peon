import { cn } from '@/lib/utils';

/** Back-to-front layer offsets and colors: cyan, pink, indigo. */
const LAYERS: ReadonlyArray<readonly [number, number, string]> = [
  [4, 4, '#22D3EE'],
  [2, 2, '#F472B6'],
  [0, 0, '#7170FF'],
];

/** Letterform scale inside the 64×64 tile; offsets place the layered glyph centered. */
const SCALE = 1.1;
const OFFSET_X = 17.9;
const OFFSET_Y = 8.55;

/**
 * Peon logo mark: three layered lowercase "p" strokes (cyan, pink, indigo)
 * offset diagonally on a rounded near-black tile. Same letterform as the
 * wordmark. Self-contained brand colors so it reads on any background.
 * Source of truth for public/favicon.svg and the other exported assets.
 */
export function LogoMark({ className, size = 28 }: { className?: string; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      xmlns="http://www.w3.org/2000/svg"
      className={cn('shrink-0', className)}
      aria-hidden="true"
    >
      <rect width="64" height="64" rx="14" fill="#0A0A0A" />
      <g transform={`translate(${OFFSET_X} ${OFFSET_Y}) scale(${SCALE})`}>
        {LAYERS.map(([dx, dy, stroke]) => (
          <g
            key={stroke}
            transform={`translate(${dx / SCALE} ${dy / SCALE})`}
            fill="none"
            stroke={stroke}
            strokeWidth="9"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M0 0 V39" />
            <circle cx="11" cy="11" r="11" />
          </g>
        ))}
      </g>
    </svg>
  );
}

/**
 * Peon horizontal logo: lowercase "peon" drawn as rounded strokes in the same
 * three layers as the mark. Transparent; sized by height (aspect 160:72).
 * Same artwork as the brand set under peon-website/public/logos/brand.
 */
export function LogoWordmark({ className, height = 36 }: { className?: string; height?: number }) {
  const width = Math.round((height * 160) / 72);
  return (
    <svg
      width={width}
      height={height}
      viewBox="0 0 160 72"
      xmlns="http://www.w3.org/2000/svg"
      className={cn('shrink-0', className)}
      role="img"
      aria-label="Peon"
    >
      <g transform="translate(-4 2)">
        {LAYERS.map(([dx, dy, stroke]) => (
          <g
            key={stroke}
            transform={`translate(${dx} ${dy})`}
            fill="none"
            stroke={stroke}
            strokeWidth="8"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M16 19 V58" />
            <circle cx="27" cy="30" r="11" />
            <path d="M52 30 H74" />
            <path d="M74 30 A11 11 0 1 0 70.78 37.78" />
            <circle cx="99" cy="30" r="11" />
            <path d="M124 41 V19" />
            <path d="M124 30 A10 10 0 0 1 144 30 V41" />
          </g>
        ))}
      </g>
    </svg>
  );
}
