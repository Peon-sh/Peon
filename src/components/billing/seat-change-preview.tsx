'use client';

import { formatUsdFromCents } from '@/lib/billing/pricing';
import type { QuantityChangePreview } from '@/services/api/billing';

export function SeatChangePreview({
  preview,
  isLoading,
}: {
  preview: QuantityChangePreview | undefined;
  isLoading?: boolean;
}) {
  if (isLoading) {
    return <p className="text-muted-foreground text-xs">Calculating proration…</p>;
  }
  if (!preview || preview.direction === 'unchanged') return null;

  if (preview.direction === 'increase') {
    return (
      <div className="bg-secondary/60 space-y-1 rounded-md border px-3 py-2 text-sm">
        <p>
          Charge now (prorated):{' '}
          <strong className="text-foreground">
            {formatUsdFromCents(preview.immediateChargeCents ?? 0)}
          </strong>
        </p>
        <p className="text-muted-foreground text-xs">
          Billed immediately for the remaining days in this period. Full project count renews on the
          next cycle.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-secondary/60 space-y-1 rounded-md border px-3 py-2 text-sm">
      <p>
        Next invoice:{' '}
        <strong className="text-foreground">
          {formatUsdFromCents(preview.nextInvoiceCents ?? 0)}
        </strong>
        {preview.nextInvoiceAt ? (
          <span className="text-muted-foreground">
            {' '}
            on {new Date(preview.nextInvoiceAt).toLocaleDateString()}
          </span>
        ) : null}
      </p>
      <p className="text-muted-foreground text-xs">
        Your paid project count stays until this period ends; the next invoice bills the updated
        count
        {preview.overProjectLimit
          ? `. Writes and deployments lock until projects ≤ ${preview.newQuantity}.`
          : '.'}
      </p>
    </div>
  );
}
