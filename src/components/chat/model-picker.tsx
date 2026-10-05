'use client';

import { useMemo, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import type { LlmProviderId, SupportedChatModel } from '@/services/api/llm';

export type ModelSelection = {
  provider: LlmProviderId;
  modelId: string;
};

function selectionKey(selection: ModelSelection): string {
  return `${selection.provider}:${selection.modelId}`;
}

function providerLabel(provider: LlmProviderId): string {
  return provider === 'openai' ? 'OpenAI' : 'Anthropic';
}

export function ModelPicker({
  models,
  value,
  onChange,
  disabled,
  className,
}: {
  models: SupportedChatModel[];
  value: ModelSelection | null;
  onChange: (next: ModelSelection) => void;
  disabled?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);

  const selected = useMemo(() => {
    if (!value) return null;
    return (
      models.find(
        (model) => model.provider === value.provider && model.modelId === value.modelId,
      ) ?? null
    );
  }, [models, value]);

  const openai = models.filter((model) => model.provider === 'openai');
  const anthropic = models.filter((model) => model.provider === 'anthropic');

  function renderModelItem(model: SupportedChatModel) {
    const key = selectionKey(model);
    const checked =
      value?.provider === model.provider && value.modelId === model.modelId;
    return (
      <CommandItem
        key={key}
        value={`${model.displayName} ${model.modelId} ${model.provider}`}
        data-checked={checked ? true : undefined}
        onSelect={() => {
          onChange({ provider: model.provider, modelId: model.modelId });
          setOpen(false);
        }}
        className="items-start py-2"
      >
        <div className="min-w-0 flex-1">
          <div className="text-foreground truncate text-base font-medium">
            {model.displayName}
          </div>
          <div className="text-muted-foreground truncate text-xs">
            {providerLabel(model.provider)}
            {model.supportsReasoning ? ' · Reasoning' : ''}
          </div>
        </div>
      </CommandItem>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          role="combobox"
          aria-expanded={open}
          disabled={disabled || models.length === 0}
          className={cn(
            'text-muted-foreground hover:text-foreground gap-1 px-2 font-normal',
            open && 'bg-secondary text-foreground',
            className,
          )}
        >
          <span className="max-w-[180px] truncate text-sm">
            {selected?.displayName ?? 'Select model'}
          </span>
          <ChevronDown className="size-3.5 opacity-60" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" side="top" sideOffset={8} className="w-72 gap-0 p-0">
        <Command>
          <CommandInput placeholder="Search models" />
          <CommandList className="max-h-64">
            <CommandEmpty>No models found</CommandEmpty>
            {openai.length > 0 && (
              <CommandGroup heading="OpenAI">{openai.map(renderModelItem)}</CommandGroup>
            )}
            {anthropic.length > 0 && (
              <CommandGroup heading="Anthropic">{anthropic.map(renderModelItem)}</CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
