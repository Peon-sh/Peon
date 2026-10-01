'use client';

import Link from 'next/link';
import { use, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  ArrowLeft,
  Ban,
  Download,
  ExternalLink,
  GitCommitHorizontal,
  RefreshCw,
  RotateCcw,
  Rocket,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { KeyValueList, PageContainer, PageHeader, Panel } from '@/components/app/page';
import { StatusBadge } from '@/components/app/status-badge';
import { ConfirmButton } from '@/components/app/confirm';
import { cancelDeployment, getDeployment } from '@/services/api/deployment';
import { deployService, rollbackService } from '@/services/api/service';
import { invalidateServiceQueries } from '@/lib/queries/service';
import { buildLogsDownloadFilename, buildLogsDownloadText } from '@/lib/deployment-logs';
import { LocalDateTime } from '@/components/app/local-datetime';
import { formatDuration } from '@/lib/datetime';

function downloadBuildLogs(opts: { uuid: string; logs: Parameters<typeof buildLogsDownloadText>[0] }) {
  const blob = new Blob([buildLogsDownloadText(opts.logs)], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = buildLogsDownloadFilename(opts.uuid);
  a.click();
  URL.revokeObjectURL(url);
}

export default function DeploymentDetailPage({
  params,
}: {
  params: Promise<{ projectId: string; serviceId: string; deploymentId: string }>;
}) {
  const { projectId, serviceId, deploymentId } = use(params);
  const router = useRouter();
  const qc = useQueryClient();
  const logRef = useRef<HTMLPreElement>(null);

  const { data: d } = useQuery({
    queryKey: ['deployment', deploymentId],
    queryFn: () => getDeployment(deploymentId),
    refetchInterval: (query) => {
      const s = query.state.data?.status;
      return s === 'IN_PROGRESS' || s === 'QUEUED' ? 2000 : false;
    },
  });

  const running = d?.status === 'IN_PROGRESS' || d?.status === 'QUEUED';

  useEffect(() => {
    if (running && logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [d?.logs.length, running]);

  useEffect(() => {
    if (!d) return;
    if (d.status === 'FINISHED' || d.status === 'FAILED' || d.status === 'CANCELLED') {
      void qc.invalidateQueries({ queryKey: ['deployments', serviceId] });
      void qc.invalidateQueries({ queryKey: ['active-deployments'] });
      void invalidateServiceQueries(qc, { serviceId, projectId });
    }
  }, [d?.status, d, serviceId, projectId, qc]);

  const redeployMut = useMutation({
    mutationFn: (opts: { force?: boolean } = {}) => deployService(serviceId, opts),
    onSuccess: async (deployment) => {
      await qc.invalidateQueries({ queryKey: ['deployments', serviceId] });
      toast.success('Deployment queued');
      router.push(`/projects/${projectId}/services/${serviceId}/deployments/${deployment.id}`);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed'),
  });

  const rollbackMut = useMutation({
    mutationFn: () => rollbackService(serviceId, deploymentId),
    onSuccess: async (deployment) => {
      await qc.invalidateQueries({ queryKey: ['deployments', serviceId] });
      toast.success('Rollback queued');
      router.push(`/projects/${projectId}/services/${serviceId}/deployments/${deployment.id}`);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed'),
  });

  const cancelMut = useMutation({
    mutationFn: () => cancelDeployment(deploymentId),
    onSuccess: async (updated) => {
      qc.setQueryData(['deployment', deploymentId], updated);
      await qc.invalidateQueries({ queryKey: ['deployments', serviceId] });
      await qc.invalidateQueries({ queryKey: ['service', serviceId] });
      toast.success('Deployment cancelled');
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed'),
  });

  const deploymentsUrl = `/projects/${projectId}/services/${serviceId}?section=deployments`;

  if (!d) {
    return (
      <PageContainer>
        <div className="bg-accent h-20 animate-pulse rounded-lg" />
        <div className="bg-accent h-96 animate-pulse rounded-lg" />
      </PageContainer>
    );
  }

  const duration = formatDuration(d.startedAt, d.finishedAt);

  const metadata = [
    ...(d.commitSha
      ? [
          {
            label: 'Commit',
            mono: true,
            value: (
              <span className="inline-flex max-w-full items-center gap-1.5">
                <GitCommitHorizontal className="size-3.5 shrink-0" />
                <span className="bg-secondary rounded px-1.5 py-0.5">{d.commitSha.slice(0, 7)}</span>
                {d.commitMessage && (
                  <span className="text-foreground min-w-0 truncate font-sans">{d.commitMessage}</span>
                )}
              </span>
            ),
          },
        ]
      : []),
    ...(d.previewUrl
      ? [
          {
            label: 'Preview URL',
            mono: true,
            value: (
              <a
                href={d.previewUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary inline-flex max-w-full items-center gap-1.5 hover:underline"
              >
                <ExternalLink className="size-3.5 shrink-0" />
                <span className="truncate">{d.previewUrl.replace(/^https?:\/\//, '')}</span>
              </a>
            ),
          },
        ]
      : []),
    { label: 'Deployment ID', mono: true, value: d.uuid },
    { label: 'Created', value: <LocalDateTime value={d.createdAt} /> },
    ...(duration
      ? [{ label: 'Duration', value: `${running ? 'Running for' : 'Took'} ${duration}` }]
      : []),
    ...(d.triggeredBy ? [{ label: 'Triggered by', value: d.triggeredBy }] : []),
    ...(d.forceRebuild || d.restartOnly
      ? [
          {
            label: 'Options',
            value: [d.forceRebuild && 'Force rebuild', d.restartOnly && 'Restart only']
              .filter(Boolean)
              .join(' · '),
          },
        ]
      : []),
  ];

  return (
    <PageContainer>
      <Link
        href={deploymentsUrl}
        className="text-muted-foreground hover:text-foreground -mb-3 inline-flex items-center gap-1.5 text-sm transition-colors"
      >
        <ArrowLeft className="size-3" /> All deployments
      </Link>

      <PageHeader
        title={`Deployment ${d.uuid.slice(0, 12)}`}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <StatusBadge status={d.status} />
            {d.isPreview && (
              <span className="text-muted-foreground text-sm">
                Preview{d.pullRequestId ? ` · PR #${d.pullRequestId}` : ''}
              </span>
            )}
          </span>
        }
        actions={
          <>
            {d.previewUrl && (
              <Button asChild variant="outline">
                <a href={d.previewUrl} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="size-3.5" /> Open preview
                </a>
              </Button>
            )}
            {running && (
              <ConfirmButton
                title="Cancel this deployment?"
                description="Stops the in-progress deploy. Partial changes on the server may remain until the next successful deploy."
                confirmLabel="Cancel deployment"
                variant="outline"
                confirmVariant="default"
                disabled={cancelMut.isPending}
                onConfirm={() => cancelMut.mutate()}
              >
                <Ban className="size-3.5" /> Cancel
              </ConfirmButton>
            )}
            {!d.isPreview && (d.status === 'FINISHED' || d.status === 'FAILED') && d.commitSha && (
              <ConfirmButton
                title="Rollback to this deployment?"
                description="Queues a new deploy using this commit. The currently running version will be replaced."
                confirmLabel="Rollback"
                variant="outline"
                confirmVariant="default"
                disabled={rollbackMut.isPending}
                onConfirm={() => rollbackMut.mutate()}
              >
                <RotateCcw className="size-3.5" /> Rollback to this
              </ConfirmButton>
            )}
            <Button
              variant="outline"
              onClick={() => redeployMut.mutate({ force: true })}
              disabled={redeployMut.isPending}
              title="Clear cached source and rebuild without Docker/Nixpacks cache"
            >
              <RefreshCw className="size-3.5" /> Force rebuild
            </Button>
            <Button onClick={() => redeployMut.mutate({})} disabled={redeployMut.isPending}>
              <Rocket className="size-3.5" /> Redeploy
            </Button>
          </>
        }
      />

      <Panel title="Details" contentClassName="py-1.5">
        <KeyValueList items={metadata} />
      </Panel>

      <div className="border-border bg-card overflow-hidden rounded-lg border">
        <div className="flex items-center justify-between gap-3 border-b px-4 py-3">
          <h2 className="text-md font-medium">Build logs</h2>
          <div className="flex items-center gap-2">
            {running && (
              <span className="text-success inline-flex items-center gap-1.5 text-sm">
                <span className="bg-success size-1.5 animate-pulse rounded-full" /> Live
              </span>
            )}
            <Button
              size="sm"
              variant="outline"
              disabled={!d.logs.length}
              onClick={() => downloadBuildLogs({ uuid: d.uuid, logs: d.logs })}
            >
              <Download className="size-3.5" /> Download
            </Button>
          </div>
        </div>
        <pre
          ref={logRef}
          className="text-foreground max-h-[65vh] min-h-64 overflow-x-hidden overflow-y-auto p-4 font-mono text-sm leading-relaxed break-words whitespace-pre-wrap"
        >
          {d.logs.length
            ? d.logs.map((l, i) => (
                <div
                  key={i}
                  className={
                    l.stream === 'stderr'
                      ? 'text-destructive'
                      : l.stream === 'system'
                        ? 'text-muted-foreground'
                        : ''
                  }
                >
                  {l.message}
                </div>
              ))
            : 'No logs yet…'}
        </pre>
      </div>
    </PageContainer>
  );
}
