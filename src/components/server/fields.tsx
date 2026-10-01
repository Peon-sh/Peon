'use client';

import { ChevronRight, type LucideIcon } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { FormField } from '@/components/app/page';
import { cn } from '@/lib/utils';

const CONNECTION_TONE = {
  success: 'text-success',
  warning: 'text-warning',
  destructive: 'text-destructive',
  muted: 'text-muted-foreground',
} as const;

/** One step of the SSH → setup → agent chain. Only the icon and status carry the tone. */
export function ConnectionStep({
  icon: Icon,
  label,
  status,
  about,
  tone,
}: {
  icon: LucideIcon;
  label: string;
  status: string;
  about: string;
  tone: keyof typeof CONNECTION_TONE;
}) {
  return (
    <div className="border-border flex min-w-0 flex-1 items-start gap-2.5 rounded-md border px-3 py-2.5">
      <Icon className={cn('mt-0.5 size-4 shrink-0', CONNECTION_TONE[tone])} />
      <div className="min-w-0">
        <div className="text-muted-foreground text-sm">{label}</div>
        <div className={cn('text-base font-medium', CONNECTION_TONE[tone])}>{status}</div>
        <p className="text-muted-foreground mt-0.5 text-sm">{about}</p>
      </div>
    </div>
  );
}

export function ConnectionStepConnector() {
  return (
    <div className="text-muted-foreground hidden shrink-0 items-center sm:flex" aria-hidden>
      <ChevronRight className="size-4" />
    </div>
  );
}

/** A FormField row whose control is a switch. */
export function ToggleRow({
  label,
  description,
  checked,
  onCheckedChange,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <FormField label={label} description={description}>
      <Switch checked={checked} onCheckedChange={onCheckedChange} aria-label={label} />
    </FormField>
  );
}

/** A FormField row with a number input. */
export function NumberField({
  label,
  description,
  value,
  onChange,
}: {
  label: string;
  description?: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const id = label.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  return (
    <FormField label={label} htmlFor={id} description={description}>
      <Input id={id} type="number" value={value} onChange={(e) => onChange(e.target.value)} />
    </FormField>
  );
}
