'use client';

import { KeyValueList, Panel } from '@/components/app/page';
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
    return <p className="text-muted-foreground text-sm">Calculating proration…</p>;
  }
  if (!preview || preview.direction === 'unchanged') return null;

  if (preview.direction === 'increase') {
    return (
      <Panel contentClassName="space-y-2 px-4 py-2">
        <KeyValueList
          items={[
            {
              label: 'Charge now (prorated)',
              value: (
                <span className="text-foreground font-medium tabular-nums">
                  {formatUsdFromCents(preview.immediateChargeCents ?? 0)}
                </span>
              ),
            },
          ]}
        />
        <p className="text-muted-foreground pb-2 text-sm">
          Billed immediately for the remaining days in this period. Full project count renews on the
          next cycle.
        </p>
      </Panel>
    );
  }

  return (
    <Panel contentClassName="space-y-2 px-4 py-2">
      <KeyValueList
        items={[
          {
            label: 'Next invoice',
            value: (
              <span className="text-foreground font-medium tabular-nums">
                {formatUsdFromCents(preview.nextInvoiceCents ?? 0)}
              </span>
            ),
          },
          ...(preview.nextInvoiceAt
            ? [{ label: 'Invoice date', value: new Date(preview.nextInvoiceAt).toLocaleDateString() }]
            : []),
        ]}
      />
      <p className="text-muted-foreground pb-2 text-sm">
        Your paid project count stays until this period ends; the next invoice bills the updated
        count
        {preview.overProjectLimit
          ? `. Writes and deployments lock until projects ≤ ${preview.newQuantity}.`
          : '.'}
      </p>
    </Panel>
  );
}
