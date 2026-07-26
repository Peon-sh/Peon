'use client';

import { isUiFixtureMode } from '@/lib/dev-fixtures';

/**
 * Unobtrusive marker that the screen is showing fixture data, not a real
 * backend. Renders nothing at all outside UI fixture mode, and
 * `isUiFixtureMode()` is false in production unconditionally.
 */
export function UiModeBadge() {
  if (!isUiFixtureMode()) return null;

  return (
    <div
      // Bottom-left keeps it clear of toasts (bottom-right) and the header.
      className="pointer-events-none fixed bottom-3 left-3 z-50 select-none rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-[10px] font-medium uppercase tracking-wider text-amber-600 backdrop-blur-sm dark:text-amber-400"
      title="Serving fixture data from src/lib/dev-fixtures. Append ?__fixture=loading|empty|error to force a state."
    >
      UI development mode
    </div>
  );
}
