'use client';

import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Trash2, ExternalLink } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { rollbackService, listPreviews, deletePreview } from '@/services/api/service';
import { listDeployments, cancelDeployment, type DeploymentListItem } from '@/services/api/deployment';
import { Panel } from '@/components/app/page';
import { DataTable } from '@/components/app/data-table';
import { formatDuration } from '@/lib/datetime';
import { ConfirmButton } from '@/components/app/confirm';
import { StatusBadge } from '@/components/app/status-badge';
import { LocalDateTime } from '@/components/app/local-datetime';
import { invalidateServiceQueries } from '@/lib/queries/service';

export function DeploymentsSection({
  serviceId,
  projectId,
}: {
  serviceId: string;
  projectId: string;
  onDeploy: () => void;
  onForceDeploy: () => void;
}) {
  // Deploy / force rebuild live in the page header (ServiceActions); onDeploy and
  // onForceDeploy stay in the props so the router's call site is unchanged.
  const qc = useQueryClient();
  const {
    data: deployments,
    isPending: deploymentsPending,
    isError: deploymentsIsError,
    error: deploymentsError,
  } = useQuery({
    queryKey: ['deployments', serviceId],
    queryFn: () => listDeployments(serviceId),
    refetchInterval: (query) => {
      const list = query.state.data;
      if (list?.some((d) => d.status === 'QUEUED' || d.status === 'IN_PROGRESS')) return 2000;
      return false;
    },
  });
  const { data: previews } = useQuery({
    queryKey: ['previews', serviceId],
    queryFn: () => listPreviews(serviceId),
  });

  const rollbackMut = useMutation({
    mutationFn: (deploymentId: string) => rollbackService(serviceId, deploymentId),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['deployments', serviceId] });
      toast.success('Rollback queued');
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed'),
  });
  const cancelMut = useMutation({
    mutationFn: (deploymentId: string) => cancelDeployment(deploymentId),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['deployments', serviceId] });
      await invalidateServiceQueries(qc, { serviceId, projectId });
      toast.success('Deployment cancelled');
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed'),
  });
  const delPreviewMut = useMutation({
    mutationFn: (id: string) => deletePreview(serviceId, id),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['previews', serviceId] });
      await qc.invalidateQueries({ queryKey: ['deployments', serviceId] });
      await invalidateServiceQueries(qc, { serviceId, projectId });
      toast.success('Preview deleted');
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed'),
  });

  const previewByPr = new Map((previews ?? []).map((p) => [p.pullRequestId, p]));

  /** Active preview envs: prefer ServicePreview rows; fall back to latest deploy per PR. */
  type PreviewPanelRow = {
    key: string;
    pullRequestId: number;
    fqdn: string | null;
    status: string;
    previewId: string | null;
    latestDeploymentId: string | null;
  };
  const previewPanelRows: PreviewPanelRow[] = (() => {
    const fromApi = (previews ?? []).map((p) => ({
      key: p.id,
      pullRequestId: p.pullRequestId,
      fqdn: p.fqdn,
      status: p.status,
      previewId: p.id,
      latestDeploymentId:
        deployments?.find((d) => d.isPreview && d.pullRequestId === p.pullRequestId)?.id ?? null,
    }));
    if (fromApi.length > 0) return fromApi;

    const byPr = new Map<number, DeploymentListItem>();
    for (const d of deployments ?? []) {
      if (!d.isPreview || d.pullRequestId == null) continue;
      if (!byPr.has(d.pullRequestId)) byPr.set(d.pullRequestId, d);
    }
    return [...byPr.values()].map((d) => ({
      key: `deploy-${d.id}`,
      pullRequestId: d.pullRequestId!,
      fqdn: d.previewUrl,
      status: d.status,
      previewId: null,
      latestDeploymentId: d.id,
    }));
  })();

  const deploymentHref = (d: DeploymentListItem) =>
    `/projects/${projectId}/services/${serviceId}/deployments/${d.id}`;

  return (
    <div className="space-y-4">
      <Panel title="Deployments" padded={false}>
        {deploymentsIsError ? (
          <div className="p-4">
            <Alert variant="destructive">
              <AlertDescription>{deploymentsError instanceof Error ? deploymentsError.message : 'Failed to load deployments'}</AlertDescription>
            </Alert>
          </div>
        ) : (
          <DataTable
            className="rounded-none border-0"
            rows={deployments ?? []}
            rowKey={(d) => d.id}
            rowHref={deploymentHref}
            isLoading={deploymentsPending}
            emptyState={
              <p className="text-muted-foreground p-6 text-center text-base">No deployments yet.</p>
            }
            columns={[
              { key: 'status', header: 'Status', cell: (d) => <StatusBadge status={d.status} /> },
              {
                key: 'commit',
                header: 'Commit',
                className: 'w-full max-w-0',
                cell: (d) => (
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="shrink-0 font-mono">
                      {d.commitSha ? d.commitSha.slice(0, 7) : d.uuid.slice(0, 7)}
                    </span>
                    {d.isPreview && (
                      <Badge variant="outline" className="shrink-0">
                        Preview{d.pullRequestId != null ? ` #${d.pullRequestId}` : ''}
                      </Badge>
                    )}
                    {d.commitMessage && (
                      <span className="text-muted-foreground min-w-0 truncate">{d.commitMessage}</span>
                    )}
                  </span>
                ),
              },
              {
                key: 'trigger',
                header: 'Trigger',
                cell: (d) => (
                  <span className="text-muted-foreground">
                    {[d.triggeredBy, d.forceRebuild && 'force rebuild', d.restartOnly && 'restart only']
                      .filter(Boolean)
                      .join(' · ') || '—'}
                  </span>
                ),
              },
              {
                key: 'started',
                header: 'Started',
                cell: (d) => (
                  <span className="text-muted-foreground">
                    <LocalDateTime value={d.startedAt ?? d.createdAt} />
                  </span>
                ),
              },
              {
                key: 'duration',
                header: 'Duration',
                cell: (d) => (
                  <span className="text-muted-foreground tabular-nums">
                    {formatDuration(d.startedAt, d.finishedAt) ?? '—'}
                  </span>
                ),
              },
              {
                key: 'actions',
                header: <span className="sr-only">Actions</span>,
                align: 'right',
                cell: (d) => {
                  const preview =
                    d.isPreview && d.pullRequestId != null
                      ? previewByPr.get(d.pullRequestId)
                      : undefined;
                  return (
                    <span className="relative z-10 inline-flex items-center justify-end gap-1.5">
                      {d.previewUrl && (
                        <Button asChild size="sm" variant="ghost">
                          <a href={d.previewUrl} target="_blank" rel="noopener noreferrer" title={d.previewUrl}>
                            <ExternalLink className="size-3.5" /> Open
                          </a>
                        </Button>
                      )}
                      <Button asChild size="sm" variant="ghost">
                        <Link href={deploymentHref(d)}>View</Link>
                      </Button>
                      {(d.status === 'QUEUED' || d.status === 'IN_PROGRESS') && (
                        <ConfirmButton
                          title="Cancel this deployment?"
                          description="Stops the in-progress deploy. Partial changes on the server may remain until the next successful deploy."
                          confirmLabel="Cancel deployment"
                          variant="outline"
                          confirmVariant="default"
                          size="sm"
                          disabled={cancelMut.isPending}
                          onConfirm={() => cancelMut.mutate(d.id)}
                        >
                          Cancel
                        </ConfirmButton>
                      )}
                      {!d.isPreview &&
                        (d.status === 'FINISHED' || d.status === 'FAILED') &&
                        d.commitSha && (
                          <ConfirmButton
                            title="Rollback to this deployment?"
                            description="Queues a new deploy using this commit. Current running version will be replaced."
                            confirmLabel="Rollback"
                            variant="outline"
                            confirmVariant="default"
                            size="sm"
                            disabled={rollbackMut.isPending}
                            onConfirm={() => rollbackMut.mutate(d.id)}
                          >
                            Rollback
                          </ConfirmButton>
                        )}
                      {preview && (
                        <ConfirmButton
                          title={`Delete preview for PR #${preview.pullRequestId}?`}
                          description="Stops and removes this preview deployment from the server."
                          confirmLabel="Delete"
                          variant="ghost"
                          size="sm"
                          disabled={delPreviewMut.isPending}
                          onConfirm={() => delPreviewMut.mutate(preview.id)}
                        >
                          <Trash2 className="size-3.5" /> Delete
                        </ConfirmButton>
                      )}
                    </span>
                  );
                },
              },
            ]}
          />
        )}
      </Panel>

      <Panel title="Preview deployments" padded={false}>
        <DataTable
          className="rounded-none border-0"
          rows={previewPanelRows}
          rowKey={(p) => p.key}
          emptyState={
            <p className="text-muted-foreground p-6 text-center text-base">
              No active preview environments. Enable preview deployments in Configuration, then open a
              PR against this service&apos;s branch.
            </p>
          }
          columns={[
            {
              key: 'pr',
              header: 'Pull request',
              cell: (p) => <Badge variant="outline">Preview #{p.pullRequestId}</Badge>,
            },
            {
              key: 'url',
              header: 'URL',
              className: 'w-full max-w-0',
              cell: (p) => {
                const href = p.fqdn
                  ? p.fqdn.startsWith('http')
                    ? p.fqdn
                    : `https://${p.fqdn}`
                  : null;
                return href ? (
                  <a
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary inline-flex max-w-full min-w-0 items-center gap-1 font-mono hover:underline"
                    title={href}
                  >
                    <ExternalLink className="size-3 shrink-0" />
                    <span className="truncate">{href.replace(/^https?:\/\//, '')}</span>
                  </a>
                ) : (
                  <span className="text-muted-foreground">No URL yet</span>
                );
              },
            },
            { key: 'status', header: 'Status', cell: (p) => <StatusBadge status={p.status} /> },
            {
              key: 'actions',
              header: <span className="sr-only">Actions</span>,
              align: 'right',
              cell: (p) => (
                <span className="inline-flex items-center justify-end gap-1.5">
                  {p.latestDeploymentId && (
                    <Button asChild size="sm" variant="ghost">
                      <Link
                        href={`/projects/${projectId}/services/${serviceId}/deployments/${p.latestDeploymentId}`}
                      >
                        View
                      </Link>
                    </Button>
                  )}
                  {p.previewId && (
                    <ConfirmButton
                      title={`Delete preview for PR #${p.pullRequestId}?`}
                      description="Stops and removes this preview deployment from the server."
                      confirmLabel="Delete"
                      variant="ghost"
                      size="sm"
                      disabled={delPreviewMut.isPending}
                      onConfirm={() => delPreviewMut.mutate(p.previewId!)}
                    >
                      <Trash2 className="size-3.5" /> Delete
                    </ConfirmButton>
                  )}
                </span>
              ),
            },
          ]}
        />
      </Panel>
    </div>
  );
}
