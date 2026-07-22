'use client';

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
    <div className="bg-secondary/50 space-y-2 rounded-md border px-3 py-2.5">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-foreground text-sm font-medium">{title}</span>
        <span className="font-heading text-lg font-bold tracking-tight">
          {formatUsdFromCents(amountCents)}
        </span>
      </div>
      {subtitle ? <p className="text-muted-foreground text-xs leading-snug">{subtitle}</p> : null}
      {lines && lines.length > 0 ? (
        <ul className="border-border/60 space-y-1 border-t pt-2">
          {lines.slice(0, 4).map((line, i) => (
            <li key={`${line.description}-${i}`} className="flex justify-between gap-3 text-[11px]">
              <span className="text-muted-foreground line-clamp-2">{line.description}</span>
              <span className="text-foreground shrink-0 tabular-nums">
                {formatUsdFromCents(line.amountCents)}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
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
