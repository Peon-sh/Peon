'use client';

import Link from 'next/link';
import { Brain, MessageSquareText } from 'lucide-react';
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
      <div className="flex flex-1 items-center justify-center p-6">
        <div className="w-full max-w-lg text-center">
          <div className="bg-muted mx-auto mb-4 flex size-10 items-center justify-center rounded-lg border">
            <Brain className="text-phosphor size-5" />
          </div>
          <h1 className="text-lg font-semibold">Configure an LLM to start chatting</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            This workspace needs an OpenAI or Anthropic API key before the assistant can run.
          </p>
          {canConfigureLlms ? (
            <Button asChild className="mt-6">
              <Link href="/settings/llm">Open LLM settings</Link>
            </Button>
          ) : (
            <p className="text-muted-foreground mt-6 text-sm">
              Ask a workspace owner or admin to add an API key under Settings → LLMs.
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <div className="w-full max-w-lg text-center">
        <div className="bg-muted mx-auto mb-4 flex size-10 items-center justify-center rounded-lg border">
          <MessageSquareText className="text-phosphor size-5" />
        </div>
        <h1 className="text-lg font-semibold">Ask Peon about your workspace</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Investigate deployments, inspect service health, and manage infrastructure.
        </p>
        <div className="mt-6 grid gap-2 sm:grid-cols-3">
          {PROMPTS.map((prompt) => (
            <Button
              key={prompt}
              variant="outline"
              className="h-auto min-h-14 justify-start px-3 py-2 text-left whitespace-normal"
              onClick={() => onPrompt(prompt)}
            >
              {prompt}
            </Button>
          ))}
        </div>
      </div>
    </div>
  );
}
