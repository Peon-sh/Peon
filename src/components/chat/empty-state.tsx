'use client';

import Link from 'next/link';
import { Brain, MessageSquareText } from 'lucide-react';
import { EmptyState as AppEmptyState } from '@/components/app/empty-state';
import { Button } from '@/components/ui/button';

const PROMPTS = [
  'Why did the last deploy fail?',
  'Show unhealthy services',
  'List active deployments',
];

export function EmptyState({
  onPrompt,
  chatReady = true,
  canConfigureLlms = false,
}: {
  onPrompt: (prompt: string) => void;
  chatReady?: boolean;
  canConfigureLlms?: boolean;
}) {
  if (!chatReady) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center overflow-y-auto p-6">
        <AppEmptyState
          icon={Brain}
          title="Configure an LLM to start chatting"
          description={
            canConfigureLlms
              ? 'This workspace needs an OpenAI or Anthropic API key before the assistant can run.'
              : 'This workspace needs an OpenAI or Anthropic API key before the assistant can run. Ask a workspace owner or admin to add one under Settings → LLMs.'
          }
          action={
            canConfigureLlms ? (
              <Button asChild>
                <Link href="/settings/llm">Open LLM settings</Link>
              </Button>
            ) : undefined
          }
          className="max-w-[720px]"
        />
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 items-center justify-center overflow-y-auto p-6">
      <AppEmptyState
        icon={MessageSquareText}
        title="Ask Peon about your workspace"
        description="Investigate deployments, inspect service health, and manage infrastructure."
        action={
          <div className="grid w-full max-w-lg gap-2 sm:grid-cols-3">
            {PROMPTS.map((prompt) => (
              <Button
                key={prompt}
                variant="outline"
                className="h-auto min-h-12 justify-start px-3 py-2 text-left whitespace-normal"
                onClick={() => onPrompt(prompt)}
              >
                {prompt}
              </Button>
            ))}
          </div>
        }
        className="max-w-[720px]"
      />
    </div>
  );
}
