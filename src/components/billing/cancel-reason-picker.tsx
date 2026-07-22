'use client';

import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  CANCEL_REASON_OPTIONS,
  type CancelSubscriptionReason,
} from '@/schemas/billing.schema';
import { cn } from '@/lib/utils';

export function CancelReasonPicker({
  reason,
  reasonDetail,
  onReasonChange,
  onDetailChange,
}: {
  reason: CancelSubscriptionReason | null;
  reasonDetail: string;
  onReasonChange: (reason: CancelSubscriptionReason) => void;
  onDetailChange: (detail: string) => void;
}) {
  return (
    <div className="space-y-3">
      <p className="text-foreground text-sm font-medium">Why are you canceling?</p>
      <div className="space-y-1.5">
        {CANCEL_REASON_OPTIONS.map((opt) => {
          const selected = reason === opt.value;
          return (
            <label
              key={opt.value}
              className={cn(
                'border-border flex cursor-pointer items-start gap-2.5 rounded-md border px-3 py-2 text-sm transition-colors',
                selected
                  ? 'border-phosphor/50 bg-phosphor/10'
                  : 'hover:border-border-bright hover:bg-secondary/60',
              )}
            >
              <input
                type="radio"
                name="cancel-reason"
                className="border-border text-phosphor mt-0.5 size-3.5"
                checked={selected}
                onChange={() => onReasonChange(opt.value)}
              />
              <span className="text-foreground leading-snug">{opt.label}</span>
            </label>
          );
        })}
      </div>
      {reason === 'other' && (
        <div className="space-y-1.5">
          <Label htmlFor="cancel-reason-detail">Tell us more (optional)</Label>
          <Input
            id="cancel-reason-detail"
            value={reasonDetail}
            onChange={(e) => onDetailChange(e.target.value)}
            placeholder="What could we improve?"
            maxLength={500}
          />
        </div>
      )}
    </div>
  );
}

export function useCancelReasonState() {
  const [reason, setReason] = useState<CancelSubscriptionReason | null>(null);
  const [reasonDetail, setReasonDetail] = useState('');
  const reset = () => {
    setReason(null);
    setReasonDetail('');
  };
  return { reason, setReason, reasonDetail, setReasonDetail, reset, ready: !!reason };
}
