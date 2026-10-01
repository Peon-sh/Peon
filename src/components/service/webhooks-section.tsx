'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Trash2, Copy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { Callout, CalloutBullets } from '@/components/app/callout';
import { listWebhooks, createWebhook, deleteWebhook } from '@/services/api/service';
import { Panel } from '@/components/app/page';
import { DataTable } from '@/components/app/data-table';
import { ConfirmButton } from '@/components/app/confirm';
import { publicEnv } from '@/lib/env';

const PROVIDER_LABELS: Record<string, string> = {
  generic: 'Generic',
  github: 'GitHub',
  gitlab: 'GitLab',
};

export function WebhooksSection({
  serviceId,
  gitBranch,
}: {
  serviceId: string;
  gitBranch: string | null;
}) {
  const qc = useQueryClient();
  const [provider, setProvider] = useState<'generic' | 'github' | 'gitlab'>('generic');
  const { data: webhooks } = useQuery({
    queryKey: ['webhooks', serviceId],
    queryFn: () => listWebhooks(serviceId),
  });
  const invalidate = () => qc.invalidateQueries({ queryKey: ['webhooks', serviceId] });

  const createMut = useMutation({
    mutationFn: () => createWebhook(serviceId, provider),
    onSuccess: async () => {
      await invalidate();
      toast.success('Webhook created');
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed'),
  });
  const delMut = useMutation({
    mutationFn: (id: string) => deleteWebhook(serviceId, id),
    onSuccess: invalidate,
  });

  function webhookUrl(token: string) {
    return `${publicEnv.appUrl.replace(/\/$/, '')}/api/webhooks/${token}`;
  }

  async function copyUrl(token: string) {
    try {
      await navigator.clipboard.writeText(webhookUrl(token));
      toast.success('Webhook URL copied');
    } catch {
      toast.error('Could not copy URL');
    }
  }

  return (
    <div className="space-y-4">
      <Callout tone="info" title="Independent deploy webhooks" defaultOpen>
        <p>
          These are standalone URLs for this service only. Create one, copy the URL, and call it from
          GitHub, GitLab, CI, or any HTTP client. A matching push queues a deployment
          {gitBranch ? (
            <>
              {' '}
              for branch <span className="text-foreground font-mono">{gitBranch}</span>
            </>
          ) : null}
          .
        </p>
        <CalloutBullets>
          <li>
            <b>Generic</b> — <span className="font-mono">POST</span> JSON to the URL. The path token
            authenticates the request. Include <span className="font-mono">ref</span> /{' '}
            <span className="font-mono">after</span> like a GitHub push payload if you want branch
            filtering and commit metadata.
          </li>
          <li>
            <b>GitHub</b> — Repo Settings → Webhooks → Add webhook. Content type{' '}
            <span className="font-mono">application/json</span>. Set the webhook Secret to the same
            token as in the URL (Peon verifies <span className="font-mono">X-Hub-Signature-256</span>
            ). Events: Push.
          </li>
          <li>
            <b>GitLab</b> — Project → Settings → Webhooks. Paste the URL and set Secret token to the
            path token (sent as <span className="font-mono">X-Gitlab-Token</span>). Trigger on Push
            events.
          </li>
          <li>
            Auto-deploy must be enabled on the service. GitHub ping events are acknowledged without
            deploying.
          </li>
        </CalloutBullets>
      </Callout>

      <Panel
        title="Deploy webhooks"
        padded={false}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <div className="w-36">
              <SearchableSelect
                value={provider}
                onValueChange={(v) => setProvider(v as 'generic' | 'github' | 'gitlab')}
                placeholder="Select provider"
                size="sm"
                options={[
                  { value: 'generic', label: 'Generic' },
                  { value: 'github', label: 'GitHub' },
                  { value: 'gitlab', label: 'GitLab' },
                ]}
              />
            </div>
            <Button size="sm" onClick={() => createMut.mutate()} disabled={createMut.isPending}>
              New webhook
            </Button>
          </div>
        }
      >
        <DataTable
          className="rounded-none border-0"
          rows={webhooks ?? []}
          rowKey={(w) => w.id}
          emptyState={
            <p className="text-muted-foreground p-6 text-center text-base">
              No webhooks yet. Create one to get a deploy URL.
            </p>
          }
          columns={[
            {
              key: 'url',
              header: 'URL',
              className: 'w-full max-w-0 whitespace-normal',
              cell: (w) => (
                <span className="block min-w-0 font-mono break-all">{webhookUrl(w.token)}</span>
              ),
            },
            {
              key: 'provider',
              header: 'Provider',
              cell: (w) => (
                <span
                  className="text-muted-foreground"
                  title={w.provider !== 'generic' ? 'Use the path token as the webhook secret' : undefined}
                >
                  {PROVIDER_LABELS[w.provider] ?? w.provider}
                </span>
              ),
            },
            {
              key: 'actions',
              header: <span className="sr-only">Actions</span>,
              align: 'right',
              cell: (w) => (
                <span className="inline-flex items-center justify-end gap-1.5">
                  <Button
                    type="button"
                    size="icon-sm"
                    variant="outline"
                    onClick={() => void copyUrl(w.token)}
                    title="Copy URL"
                    aria-label="Copy URL"
                  >
                    <Copy className="size-3.5" />
                  </Button>
                  <ConfirmButton
                    size="sm"
                    onConfirm={() => delMut.mutate(w.id)}
                    title="Delete webhook?"
                    description="External systems calling this webhook URL will stop triggering deployments."
                  >
                    <Trash2 className="size-3.5" /> Delete
                  </ConfirmButton>
                </span>
              ),
            },
          ]}
        />
      </Panel>
      {webhooks?.some((w) => w.provider !== 'generic') ? (
        <p className="text-muted-foreground text-sm">
          For GitHub and GitLab webhooks, use the path token as the webhook secret.
        </p>
      ) : null}
    </div>
  );
}
