'use client';

import { KeyValueList, Panel } from '@/components/app/page';
import { formatUsdFromCents } from '@/lib/billing/pricing';
import type { IntervalChangePreview, QuantityChangePreview } from '@/services/api/billing';

export function ChargePreviewBlock({
  title,
  amountCents,
  subtitle,
  lines,
}: {
  title: string;
  amountCents: number;
  subtitle?: string;
  lines?: Array<{ description: string; amountCents: number }>;
}) {
  return (
    <Panel contentClassName="space-y-2 px-4 py-2">
      <KeyValueList
        items={[
          {
            label: <span className="text-foreground font-medium">{title}</span>,
            value: (
              <span className="text-foreground text-md font-semibold tabular-nums">
                {formatUsdFromCents(amountCents)}
              </span>
            ),
          },
          ...(lines ?? []).slice(0, 4).map((line) => ({
            label: <span className="line-clamp-2 text-sm">{line.description}</span>,
            value: (
              <span className="text-foreground text-sm tabular-nums">
                {formatUsdFromCents(line.amountCents)}
              </span>
            ),
          })),
        ]}
      />
      {subtitle ? <p className="text-muted-foreground pb-2 text-sm">{subtitle}</p> : null}
    </Panel>
  );
}

export function quantityConfirmCopy(preview: QuantityChangePreview | undefined) {
  if (!preview || preview.direction === 'unchanged') {
    return {
      title: 'Update projects?',
      amountCents: 0,
      subtitle: 'No billing change.',
    };
  }
  if (preview.direction === 'increase') {
    return {
      title: 'Charge due now',
      amountCents: preview.immediateChargeCents ?? 0,
      subtitle: `Increase from ${preview.currentQuantity} → ${preview.newQuantity} projects. Prorated for the rest of this billing period.`,
      lines: preview.lines,
    };
  }
  const over =
    preview.overProjectLimit || preview.projectCount > preview.newQuantity
      ? ` You currently have ${preview.projectCount} projects — writes and deployments stay locked until you delete down to ${preview.newQuantity} (or add capacity).`
      : '';
  return {
    title: 'Next invoice',
    amountCents: preview.nextInvoiceCents ?? 0,
    subtitle: `Decrease from ${preview.currentQuantity} → ${preview.newQuantity} projects. You keep the paid capacity until this period ends; the next invoice uses the new count.${over}`,
    lines: preview.lines,
  };
}

export function intervalConfirmCopy(preview: IntervalChangePreview | undefined, projects: number) {
  return {
    title: 'Charge due now',
    amountCents: preview?.immediateChargeCents ?? 0,
    subtitle: `Switch ${projects} project${projects === 1 ? '' : 's'} to yearly billing. Unused monthly time is credited against the yearly plan; the balance is charged immediately.`,
    lines: preview?.lines,
  };
}
