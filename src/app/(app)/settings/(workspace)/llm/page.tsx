'use client';

import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Brain, Check, KeyRound, Trash2 } from 'lucide-react';
import { ConfirmButton } from '@/components/app/confirm';
import { Panel, Section } from '@/components/app/page';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  useDeleteLlmCredential,
  useLlmCredentials,
  useLlmModels,
  useUpsertLlmCredential,
} from '@/lib/queries/llm';
import { useAuthStore, currentWorkspace } from '@/store/auth';
import type { LlmProviderId } from '@/services/api/llm';

const PROVIDERS: Array<{ id: LlmProviderId; label: string; hint: string }> = [
  {
    id: 'openai',
    label: 'OpenAI',
    hint: 'API key from platform.openai.com',
  },
  {
    id: 'anthropic',
    label: 'Anthropic',
    hint: 'API key from platform.claude.com',
  },
];

export default function LlmSettingsPage() {
  const workspaceId = useAuthStore((state) => state.currentWorkspaceId);
  const workspace = currentWorkspace();
  const canManage = workspace?.role === 'OWNER' || workspace?.role === 'ADMIN';
  const wsId = workspaceId ?? '';

  const { data: credentials = [], isLoading: loadingCreds } = useLlmCredentials(workspaceId);
  const { data: models = [], isLoading: loadingModels } = useLlmModels(workspaceId);
  const upsert = useUpsertLlmCredential(wsId);
  const remove = useDeleteLlmCredential(wsId);
  const [draftKeys, setDraftKeys] = useState<Record<LlmProviderId, string>>({
    openai: '',
    anthropic: '',
  });

  const statusByProvider = useMemo(() => {
    return Object.fromEntries(credentials.map((item) => [item.provider, item])) as Record<
      LlmProviderId,
      (typeof credentials)[number] | undefined
    >;
  }, [credentials]);

  async function save(provider: LlmProviderId) {
    const apiKey = draftKeys[provider]?.trim();
    if (!apiKey) {
      toast.error('Enter an API key');
      return;
    }
    try {
      await upsert.mutateAsync({ provider, apiKey });
      setDraftKeys((prev) => ({ ...prev, [provider]: '' }));
      toast.success(`${provider === 'openai' ? 'OpenAI' : 'Anthropic'} key saved`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not save key');
    }
  }

  async function clear(provider: LlmProviderId) {
    try {
      await remove.mutateAsync(provider);
      toast.success('API key removed');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not remove key');
    }
  }

  return (
    <Section
        title="LLMs"
        description="Workspace API keys for chat. Members can use configured providers; only owners and admins can change keys."
      >
        {!canManage && (
          <Panel contentClassName="text-muted-foreground p-4 text-sm">
            You can view configuration status. Ask a workspace admin to add or update API keys.
          </Panel>
        )}

        <div className="space-y-4">
          {PROVIDERS.map((provider) => {
            const status = statusByProvider[provider.id];
            const providerModels = models.filter((model) => model.provider === provider.id);
            return (
              <Panel
                key={provider.id}
                contentClassName="space-y-4 p-4"
                footer={
                  canManage ? (
                    <>
                      <Button
                        size="sm"
                        onClick={() => void save(provider.id)}
                        disabled={upsert.isPending || !draftKeys[provider.id]?.trim()}
                      >
                        <Check className="size-3.5" />
                        Save
                      </Button>
                      {status?.configured ? (
                        <ConfirmButton
                          title="Remove?"
                          description={`${provider.label} chat will stop working until a key is added again.`}
                          confirmLabel="Remove"
                          disabled={remove.isPending}
                          onConfirm={() => void clear(provider.id)}
                        >
                          <Trash2 className="size-3.5" />
                          Remove
                        </ConfirmButton>
                      ) : null}
                    </>
                  ) : undefined
                }
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="flex items-center gap-2 text-sm font-semibold">
                      <Brain className="text-phosphor size-4" />
                      {provider.label}
                    </h2>
                    <p className="text-muted-foreground mt-1 text-xs">{provider.hint}</p>
                  </div>
                  <span
                    className={
                      status?.configured
                        ? 'text-phosphor bg-phosphor/10 rounded-full px-2 py-0.5 text-[10px] font-medium'
                        : 'text-muted-foreground bg-muted rounded-full px-2 py-0.5 text-[10px] font-medium'
                    }
                  >
                    {loadingCreds
                      ? '…'
                      : status?.configured
                        ? `Configured ${status.keyHint ?? ''}`.trim()
                        : 'Not configured'}
                  </span>
                </div>

                <div>
                  <p className="text-muted-foreground mb-2 text-[11px] font-medium tracking-wide uppercase">
                    Supported models
                  </p>
                  {loadingModels ? (
                    <p className="text-muted-foreground text-xs">Loading models…</p>
                  ) : providerModels.length === 0 ? (
                    <p className="text-muted-foreground text-xs">No models seeded for this provider.</p>
                  ) : (
                    <ul className="flex flex-wrap gap-1.5">
                      {providerModels.map((model) => (
                        <li
                          key={`${model.provider}-${model.modelId}`}
                          className="bg-muted rounded-md px-2 py-1 text-[11px]"
                          title={model.modelId}
                        >
                          {model.displayName}
                          {model.supportsReasoning ? ' · reasoning' : ''}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                {canManage && (
                  <div className="space-y-2">
                    <Label htmlFor={`key-${provider.id}`}>API key</Label>
                    <Input
                      id={`key-${provider.id}`}
                      type="password"
                      autoComplete="off"
                      placeholder={
                        status?.configured
                          ? 'Enter a new key to replace the saved one'
                          : 'sk-…'
                      }
                      value={draftKeys[provider.id]}
                      onChange={(event) =>
                        setDraftKeys((prev) => ({
                          ...prev,
                          [provider.id]: event.target.value,
                        }))
                      }
                    />
                  </div>
                )}
              </Panel>
            );
          })}
        </div>

        <Panel contentClassName="text-muted-foreground flex items-start gap-2 p-4 text-xs">
          <KeyRound className="mt-0.5 size-3.5 shrink-0" />
          Keys are encrypted at rest for this workspace only.
        </Panel>
      </Section>
  );
}
