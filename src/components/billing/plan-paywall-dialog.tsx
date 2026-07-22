'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Modal,
  ModalBody,
  ModalContent,
  ModalHeader,
  ModalTitle,
  ModalDescription,
} from '@/components/app/modal';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ConfirmButton } from '@/components/app/confirm';
import { InAppSubscribeForm } from '@/components/billing/in-app-subscribe-form';
import { SeatChangePreview } from '@/components/billing/seat-change-preview';
import {
  ChargePreviewBlock,
  quantityConfirmCopy,
} from '@/components/billing/charge-preview-block';
import {
  getBillingSummary,
  previewBillingQuantity,
  updateBillingQuantity,
} from '@/services/api/billing';
import { formatUsdFromCents, yearlyDiscountPercent } from '@/lib/billing/pricing';

function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(id);
  }, [value, delayMs]);
  return debounced;
}

export function PlanPaywallDialog({
  open,
  onOpenChange,
  workspaceId,
  reason = 'subscribe',
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspaceId: string;
  reason?: 'subscribe' | 'seats';
}) {
  const discount = yearlyDiscountPercent();
  const qc = useQueryClient();
  const [seats, setSeats] = useState(1);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const debouncedSeats = useDebouncedValue(seats, 400);

  const { data: billing } = useQuery({
    queryKey: ['billing', workspaceId],
    queryFn: () => getBillingSummary(workspaceId),
    enabled: open && !!workspaceId,
  });

  const entitled = !!billing?.entitled;
  const showSeats = reason === 'seats' || entitled;

  useEffect(() => {
    if (!billing) return;
    setSeats(Math.max((billing.projectCount ?? 0) + 1, (billing.seats ?? 0) + 1));
  }, [billing]);

  const seatPreviewEnabled =
    open &&
    showSeats &&
    entitled &&
    debouncedSeats !== (billing?.seats ?? 0) &&
    debouncedSeats > (billing?.seats ?? 0);

  const { data: seatPreview, isFetching: seatPreviewLoading } = useQuery({
    queryKey: ['billing-quantity-preview', workspaceId, debouncedSeats],
    queryFn: () => previewBillingQuantity(workspaceId, debouncedSeats),
    enabled: seatPreviewEnabled,
    staleTime: 15_000,
  });

  const qtyMut = useMutation({
    mutationFn: () => updateBillingQuantity(workspaceId, seats),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['billing', workspaceId] });
      await qc.invalidateQueries({ queryKey: ['billing-quantity-preview', workspaceId] });
      toast.success('Seats updated');
      setConfirmOpen(false);
      onOpenChange(false);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed'),
  });

  const seatConfirm = quantityConfirmCopy(seatPreview);

  return (
    <Modal open={open} onOpenChange={onOpenChange}>
      <ModalContent size="lg">
        <ModalHeader>
          <ModalTitle>
            {showSeats && entitled ? 'Add Peon Pro seats' : 'Subscribe to Peon Pro'}
          </ModalTitle>
          <ModalDescription>
            {showSeats && entitled ? (
              'Increase project seats. New seats are prorated for the rest of the billing period.'
            ) : (
              <>
                Project creation requires Peon Pro.
                <br />
                $3/project/month or $30/year (save ~{discount}%).
              </>
            )}
          </ModalDescription>
        </ModalHeader>
        <ModalBody>
          {showSeats && entitled ? (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="paywall-seats">Total seats</Label>
                <Input
                  id="paywall-seats"
                  type="number"
                  min={(billing?.projectCount ?? 0) + 1}
                  value={seats}
                  onChange={(e) => setSeats(Math.max(1, Number(e.target.value) || 1))}
                />
                <p className="text-muted-foreground text-xs">
                  Currently {billing?.projectCount ?? 0} projects / {billing?.seats ?? 0} seats.
                </p>
              </div>
              <SeatChangePreview preview={seatPreview} isLoading={seatPreviewLoading} />
              <ConfirmButton
                className="w-full"
                variant="default"
                size="default"
                confirmVariant="default"
                title="Confirm seat purchase?"
                confirmLabel={
                  qtyMut.isPending
                    ? 'Updating…'
                    : `Charge ${formatUsdFromCents(seatConfirm.amountCents)} now`
                }
                disabled={qtyMut.isPending || seats <= (billing?.seats ?? 0)}
                confirmDisabled={
                  qtyMut.isPending ||
                  seatPreviewLoading ||
                  seatPreview?.immediateChargeCents == null
                }
                open={confirmOpen}
                onOpenChange={setConfirmOpen}
                description={
                  <>
                    <p>
                      Increase from {billing?.seats ?? 0} → {seats} seats. Prorated amount is
                      charged immediately.
                    </p>
                    {seatPreviewLoading ? (
                      <p className="text-xs">Calculating…</p>
                    ) : (
                      <ChargePreviewBlock
                        title={seatConfirm.title}
                        amountCents={seatConfirm.amountCents}
                        subtitle={seatConfirm.subtitle}
                        lines={seatConfirm.lines}
                      />
                    )}
                  </>
                }
                onConfirm={() => qtyMut.mutate()}
              >
                {seatPreview?.immediateChargeCents != null
                  ? `Add seats — ${formatUsdFromCents(seatPreview.immediateChargeCents)} now`
                  : 'Add seats (prorated)'}
              </ConfirmButton>
            </div>
          ) : (
            <InAppSubscribeForm
              workspaceId={workspaceId}
              returnPath="/projects"
              onSuccess={() => {
                window.setTimeout(() => onOpenChange(false), 1600);
              }}
            />
          )}
        </ModalBody>
      </ModalContent>
    </Modal>
  );
}
