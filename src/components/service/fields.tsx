'use client';

import { type ReactNode } from 'react';
import { CircleHelp } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { FormField } from '@/components/app/page';

function FieldLabel({ label, tooltip }: { label: string; tooltip?: string }) {
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5">
      <span className="truncate">{label}</span>
      {tooltip ? (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                className="text-muted-foreground hover:text-foreground shrink-0"
                aria-label={`About ${label}`}
              >
                <CircleHelp className="size-3.5" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-xs text-left leading-relaxed">
              {tooltip}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      ) : null}
    </span>
  );
}

/** A labelled form row (FormField) with an optional help tooltip next to the label. */
export function Field({
  label,
  tooltip,
  description,
  children,
}: {
  label: string;
  tooltip?: string;
  description?: ReactNode;
  children: ReactNode;
}) {
  return (
    <FormField label={<FieldLabel label={label} tooltip={tooltip} />} description={description}>
      <div className="space-y-1.5">{children}</div>
    </FormField>
  );
}

/** A FormField row whose control is a switch. */
export function ToggleField({
  label,
  tooltip,
  checked,
  onCheckedChange,
}: {
  label: string;
  tooltip?: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <FormField label={<FieldLabel label={label} tooltip={tooltip} />}>
      <Switch
        className="shrink-0"
        checked={checked}
        onCheckedChange={onCheckedChange}
        aria-label={label}
      />
    </FormField>
  );
}
