'use client';

import * as React from 'react';
import { ChevronDownIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';

export type SearchableSelectOption = {
  value: string;
  label: string;
  /** Extra text included in search matching (e.g. email, IP). */
  keywords?: string;
  disabled?: boolean;
};

type SearchableSelectProps = {
  value?: string | null;
  onValueChange: (value: string) => void;
  options: SearchableSelectOption[];
  /** Shown when nothing is selected — e.g. "Select server". */
  placeholder: string;
  searchPlaceholder?: string;
  emptyText?: string;
  disabled?: boolean;
  className?: string;
  contentClassName?: string;
  size?: 'default' | 'sm';
};

/**
 * Searchable single-select with a real placeholder (not a fake option).
 * Empty / unknown values show `placeholder` in muted text until the user picks.
 * Trigger always stretches to the width of its container.
 */
export function SearchableSelect({
  value,
  onValueChange,
  options,
  placeholder,
  searchPlaceholder = 'Search…',
  emptyText = 'No results',
  disabled = false,
  className,
  contentClassName,
  size = 'default',
}: SearchableSelectProps) {
  const [open, setOpen] = React.useState(false);
  const selected = value ? options.find((o) => o.value === value) : undefined;
  const showPlaceholder = !selected;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          data-size={size}
          className={cn(
            'w-full justify-between font-normal',
            size === 'sm' ? 'h-8' : 'h-7',
            showPlaceholder && 'text-muted-foreground',
            className,
          )}
        >
          <span className="truncate">{selected?.label ?? placeholder}</span>
          <ChevronDownIcon className="size-3.5 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className={cn('w-[var(--radix-popover-trigger-width)] p-0', contentClassName)}
      >
        <Command
          filter={(itemValue, search) => {
            const q = search.trim().toLowerCase();
            if (!q) return 1;
            return itemValue.toLowerCase().includes(q) ? 1 : 0;
          }}
        >
          <CommandInput placeholder={searchPlaceholder} />
          <CommandList>
            <CommandEmpty>{emptyText}</CommandEmpty>
            <CommandGroup>
              {options.map((option) => {
                const checked = option.value === value;
                return (
                  <CommandItem
                    key={option.value}
                    value={`${option.label} ${option.value} ${option.keywords ?? ''}`}
                    disabled={option.disabled}
                    data-checked={checked ? true : undefined}
                    onSelect={() => {
                      onValueChange(option.value);
                      setOpen(false);
                    }}
                  >
                    <span className="truncate">{option.label}</span>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
