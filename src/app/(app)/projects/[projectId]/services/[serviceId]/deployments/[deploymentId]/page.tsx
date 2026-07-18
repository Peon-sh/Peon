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
import { Panel } from '@/components/app/page';
import { StatusBadge } from '@/components/app/status-badge';
import { ConfirmButton } from '@/components/app/confirm';
import { cancelDeployment, getDeployment } from '@/services/api/deployment';
import { deployService, rollbackService } from '@/services/api/service';
import { invalidateServiceQueries } from '@/lib/queries/service';
import { buildLogsDownloadFilename, buildLogsDownloadText } from '@/lib/deployment-logs';

function downloadBuildLogs(opts: { uuid: string; logs: Parameters<typeof buildLogsDownloadText>[0] }) {
  const blob = new Blob([buildLogsDownloadText(opts.logs)], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = buildLogsDownloadFilename(opts.uuid);
  a.click();
  URL.revokeObjectURL(url);
}

function formatDuration(startedAt: string | null, finishedAt: string | null): string | null {
  if (!startedAt) return null;
  const end = finishedAt ? new Date(finishedAt).getTime() : Date.now();
  const secs = Math.max(0, Math.round((end - new Date(startedAt).getTime()) / 1000));
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return m ? `${m}m ${s}s` : `${s}s`;
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
      <div className="space-y-4">
        <div className="bg-accent h-20 animate-pulse rounded-lg" />
        <div className="bg-accent h-96 animate-pulse rounded-lg" />
      </div>
    );
  }

  const duration = formatDuration(d.startedAt, d.finishedAt);

  return (
    <div className="w-full space-y-5">
      <Link
        href={deploymentsUrl}
        className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 text-[11.5px] transition-colors"
      >
        <ArrowLeft className="size-3" /> All deployments
      </Link>

      <Panel
        title={
          <span className="inline-flex flex-wrap items-center gap-2">
            Deployment{' '}
            <span className="text-muted-foreground font-mono text-base font-normal">
              {d.uuid.slice(0, 12)}
            </span>
            <StatusBadge status={d.status} />
            {d.isPreview && (
              <span className="text-muted-foreground text-[11px] font-normal">
                preview{d.pullRequestId ? ` · PR #${d.pullRequestId}` : ''}
              </span>
            )}
          </span>
        }
        actions={
          <div className="flex items-center gap-2">
            {d.previewUrl && (
              <Button asChild size="sm" variant="outline">
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
                size="sm"
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
                size="sm"
                disabled={rollbackMut.isPending}
                onConfirm={() => rollbackMut.mutate()}
              >
                <RotateCcw className="size-3.5" /> Rollback to this
              </ConfirmButton>
            )}
            <Button
              size="sm"
              variant="outline"
              onClick={() => redeployMut.mutate({ force: true })}
              disabled={redeployMut.isPending}
              title="Clear cached source and rebuild without Docker/Nixpacks cache"
            >
              <RefreshCw className="size-3.5" /> Force rebuild
            </Button>
            <Button size="sm" onClick={() => redeployMut.mutate({})} disabled={redeployMut.isPending}>
              <Rocket className="size-3.5" /> Redeploy
            </Button>
          </div>
        }
        contentClassName="grid gap-4 p-4 sm:grid-cols-2"
      >
        {d.commitSha && (
          <div>
            <p className="text-muted-foreground mb-1 text-[11px]">Commit</p>
            <span className="inline-flex items-center gap-1.5 font-mono text-[12px]">
              <GitCommitHorizontal className="size-3.5" />
              <span className="bg-secondary rounded px-1.5 py-0.5">{d.commitSha.slice(0, 7)}</span>
              {d.commitMessage && (
                <span className="text-foreground max-w-96 truncate font-sans">{d.commitMessage}</span>
              )}
            </span>
          </div>
        )}
        {d.previewUrl && (
          <div>
            <p className="text-muted-foreground mb-1 text-[11px]">Preview URL</p>
            <a
              href={d.previewUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-phosphor hover:underline inline-flex max-w-full items-center gap-1.5 font-mono text-[12px]"
            >
              <ExternalLink className="size-3.5 shrink-0" />
              <span className="truncate">{d.previewUrl.replace(/^https?:\/\//, '')}</span>
            </a>
          </div>
        )}
        <div>
          <p className="text-muted-foreground mb-1 text-[11px]">Created</p>
          <p className="text-[12.5px]">
            {new Date(d.createdAt).toLocaleString(undefined, {
              dateStyle: 'medium',
              timeStyle: 'short',
            })}
          </p>
        </div>
        {duration && (
          <div>
            <p className="text-muted-foreground mb-1 text-[11px]">Duration</p>
            <p className="text-[12.5px]">
              {running ? 'running for' : 'took'} {duration}
            </p>
          </div>
        )}
        {d.triggeredBy && (
          <div>
            <p className="text-muted-foreground mb-1 text-[11px]">Triggered by</p>
            <p className="text-[12.5px]">{d.triggeredBy}</p>
          </div>
        )}
        {(d.forceRebuild || d.restartOnly) && (
          <div>
            <p className="text-muted-foreground mb-1 text-[11px]">Options</p>
            <p className="text-[12.5px]">
              {[d.forceRebuild && 'force rebuild', d.restartOnly && 'restart only']
                .filter(Boolean)
                .join(' · ')}
            </p>
          </div>
        )}
      </Panel>

      <Panel
        title="build logs"
        actions={
          <div className="flex items-center gap-2">
            {running && (
              <span className="text-phosphor inline-flex items-center gap-1.5 text-[11px]">
                <span className="bg-phosphor size-1.5 animate-pulse rounded-full" /> live
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
        }
        contentClassName="bg-[#0a0f0c]"
      >
        <pre
          ref={logRef}
          className="max-h-[65vh] min-h-64 overflow-y-auto overflow-x-hidden p-4 font-mono text-xs leading-relaxed break-words whitespace-pre-wrap text-neutral-200"
        >
          {d.logs.length
            ? d.logs.map((l, i) => (
                <div
                  key={i}
                  className={
                    l.stream === 'stderr'
                      ? 'text-destructive'
                      : l.stream === 'system'
                        ? 'text-phosphor'
                        : ''
                  }
                >
                  {l.message}
                </div>
              ))
            : 'No logs yet…'}
        </pre>
      </Panel>
    </div>
  );
}
