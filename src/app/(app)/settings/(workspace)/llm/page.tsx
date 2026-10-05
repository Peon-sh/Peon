'use client';

import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Check, KeyRound, Trash2 } from 'lucide-react';
import { ConfirmButton } from '@/components/app/confirm';
import { FormField, FormSection } from '@/components/app/page';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
    <>
      <p className="text-muted-foreground text-sm">
        Workspace API keys for chat. Members can use configured providers; only owners and admins can change keys.
      </p>

      {!canManage && (
        <Alert variant="info">
          <AlertDescription>
            You can view configuration status. Ask a workspace admin to add or update API keys.
          </AlertDescription>
        </Alert>
      )}

      {PROVIDERS.map((provider) => {
        const status = statusByProvider[provider.id];
        const providerModels = models.filter((model) => model.provider === provider.id);
        return (
          <FormSection
            key={provider.id}
            title={provider.label}
            description={provider.hint}
            footer={
              canManage ? (
                <>
                  {status?.configured ? (
                    <ConfirmButton
                      title={`Remove ${provider.label} key?`}
                      description={`${provider.label} chat will stop working until a key is added again.`}
                      confirmLabel="Remove"
                      disabled={remove.isPending}
                      onConfirm={() => void clear(provider.id)}
                    >
                      <Trash2 className="size-4" />
                      Remove
                    </ConfirmButton>
                  ) : null}
                  <Button
                    onClick={() => void save(provider.id)}
                    disabled={upsert.isPending || !draftKeys[provider.id]?.trim()}
                  >
                    <Check className="size-4" />
                    Save
                  </Button>
                </>
              ) : undefined
            }
          >
            <FormField label="Status">
              {loadingCreds ? (
                <span className="text-muted-foreground text-base">…</span>
              ) : (
                <Badge variant={status?.configured ? 'default' : 'secondary'}>
                  {status?.configured
                    ? `Configured ${status.keyHint ?? ''}`.trim()
                    : 'Not configured'}
                </Badge>
              )}
            </FormField>

            <FormField label="Supported models">
              {loadingModels ? (
                <p className="text-muted-foreground text-sm">Loading models…</p>
              ) : providerModels.length === 0 ? (
                <p className="text-muted-foreground text-sm">No models seeded for this provider.</p>
              ) : (
                <ul className="flex flex-wrap gap-1.5">
                  {providerModels.map((model) => (
                    <li
                      key={`${model.provider}-${model.modelId}`}
                      className="bg-secondary rounded-md px-2 py-0.5 text-xs"
                      title={model.modelId}
                    >
                      {model.displayName}
                      {model.supportsReasoning ? ' · reasoning' : ''}
                    </li>
                  ))}
                </ul>
              )}
            </FormField>

            {canManage && (
              <FormField label="API key" htmlFor={`key-${provider.id}`}>
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
              </FormField>
            )}
          </FormSection>
        );
      })}

      <p className="text-muted-foreground flex items-center gap-2 text-sm">
        <KeyRound className="size-3.5 shrink-0" />
        Keys are encrypted at rest for this workspace only.
      </p>
    </>
  );
}
