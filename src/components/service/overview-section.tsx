'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Play, ExternalLink, Layers, PauseCircle } from 'lucide-react';
import { githubBranchUrl, githubCommitUrl, githubRepoUrl } from '@/lib/github-urls';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { type ServiceDetail, type ServiceControlAction } from '@/services/api/service';
import {
  listDeployments,
  deploymentPreviewUrl,
  type DeploymentListItem,
} from '@/services/api/deployment';
import { KeyValueList, Panel } from '@/components/app/page';
import { DataTable } from '@/components/app/data-table';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { StatusBadge } from '@/components/app/status-badge';
import { KindChip } from '@/components/app/kind-chip';
import { LocalDateTime } from '@/components/app/local-datetime';
import { formatDuration } from '@/lib/datetime';
import { cn } from '@/lib/utils';

const KIND_LABELS: Record<string, string> = {
  GIT_APP: 'Application (Git)',
  DOCKERFILE: 'Dockerfile',
  DOCKER_IMAGE: 'Docker image',
  STATIC: 'Static site',
  NIXPACKS: 'Nixpacks',
  DATABASE: 'Database',
  COMPOSE: 'Compose',
};

export function OverviewSection({
  svc,
  projectId,
  onControl,
  onOpenDeployments,
  busy,
}: {
  svc: ServiceDetail;
  projectId: string;
  onDeploy: () => void;
  onForceDeploy: () => void;
  onControl: (action: ServiceControlAction) => void;
  onOpenDeployments: () => void;
  busy: boolean;
}) {
  const { data: deployments } = useQuery({
    queryKey: ['deployments', svc.id],
    queryFn: () => listDeployments(svc.id),
  });
  // Production panel should reflect the live deploy (last success), not a later failed/queued attempt.
  const productionDeployment =
    deployments?.find((d) => !d.isPreview && d.status === 'FINISHED') ?? null;
  // Status alone, not suspendedAt: the API reconciles status to SUSPENDED exactly
  // when suspendedAt is set, and the optimistic cache patch after a control
  // action only updates status. Reading suspendedAt here would keep the
  // suspended UI on screen until the refetch lands, and a second Resume click
  // would 409. suspendedAt is still used below for the "suspended since" label.
  const isSuspended = svc.status === 'SUSPENDED';
  // Deploy / stop / restart controls live in the page header (ServiceActions).

  const domains = (svc.fqdn ?? '')
    .split(',')
    .map((d) => d.trim())
    .filter(Boolean);
  const primary = domains[0];
  const primaryUrl = primary
    ? primary.startsWith('http')
      ? primary
      : `https://${primary}`
    : null;
  const repoUrl = githubRepoUrl(svc.gitRepository);
  const branchUrl = githubBranchUrl(svc.gitRepository, svc.gitBranch);
  const commitSha = productionDeployment?.commitSha ?? svc.gitCommitSha;
  const commitUrl = githubCommitUrl(svc.gitRepository, commitSha);
  const deploymentHref = productionDeployment
    ? `/projects/${projectId}/services/${svc.id}/deployments/${productionDeployment.id}`
    : null;

  const recent = (deployments ?? []).slice(0, 5);
  const deploymentHrefFor = (d: DeploymentListItem) =>
    `/projects/${projectId}/services/${svc.id}/deployments/${d.id}`;

  const commit = commitSha ? (
    <span className="inline-flex flex-wrap items-center gap-2">
      {commitUrl ? (
        <a
          href={commitUrl}
          target="_blank"
          rel="noreferrer"
          className="bg-secondary hover:bg-secondary/80 rounded px-1.5 py-0.5 hover:underline"
        >
          {commitSha.slice(0, 7)}
        </a>
      ) : (
        <span className="bg-secondary rounded px-1.5 py-0.5">{commitSha.slice(0, 7)}</span>
      )}
      {productionDeployment?.commitMessage ? (
        <span className="text-muted-foreground font-sans">{productionDeployment.commitMessage}</span>
      ) : null}
    </span>
  ) : (
    <span className="text-muted-foreground font-sans">
      {svc.kind === 'DATABASE' ? KIND_LABELS[svc.kind] : 'No git source'}
    </span>
  );

  return (
    <div className="space-y-4">
      {isSuspended && (
        <Alert variant="warning">
          <PauseCircle className="size-4" />
          <AlertTitle>Service suspended</AlertTitle>
          <AlertDescription>
            <span>
              Containers are stopped. Deploys, git webhooks, scheduled tasks, and backups stay
              paused until you resume. Domains, environment variables, and volumes are kept.
              Resuming starts the containers again, or rebuilds the service if its image was
              cleaned up in the meantime.
              {svc.suspendedAt && (
                <>
                  {' '}
                  Suspended <LocalDateTime value={svc.suspendedAt} />.
                </>
              )}
            </span>
            <Button
              size="sm"
              className="mt-2 w-fit"
              onClick={() => onControl('resume')}
              disabled={busy}
            >
              <Play className="size-3.5" /> Resume service
            </Button>
          </AlertDescription>
        </Alert>
      )}
      <Panel
        title="Production deployment"
        actions={
          repoUrl || (primaryUrl && !isSuspended) ? (
            <>
              {repoUrl && (
                <Button asChild size="sm" variant="outline">
                  <a href={repoUrl} target="_blank" rel="noreferrer">
                    Repository <ExternalLink className="size-3" />
                  </a>
                </Button>
              )}
              {primaryUrl && !isSuspended && (
                <Button asChild size="sm" variant="outline">
                  <a href={primaryUrl} target="_blank" rel="noreferrer">
                    Visit <ExternalLink className="size-3" />
                  </a>
                </Button>
              )}
            </>
          ) : undefined
        }
        footer={
          <div className="flex w-full flex-wrap items-center justify-between gap-2">
            <span className="text-muted-foreground text-sm">
              {svc.gitBranch
                ? `To update your production deployment, push to the ${svc.gitBranch} branch.`
                : 'Deploy manually or configure a git source to deploy on push.'}
            </span>
            <Button size="sm" variant="ghost" onClick={onOpenDeployments}>
              <Layers className="size-3.5" /> Deployments
            </Button>
          </div>
        }
      >
        {/* No placeholder tile: without a real deployment preview the details span the full width. */}
        <div
          className={cn(
            'grid gap-6 md:items-start',
            productionDeployment?.hasPreview && 'md:grid-cols-[minmax(280px,360px)_1fr]',
          )}
        >
          {productionDeployment?.hasPreview ? (
            <div className="border-border relative aspect-[4/3] w-full overflow-hidden rounded-md border">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={deploymentPreviewUrl(productionDeployment.id)}
                alt={`${svc.name} deployment preview`}
                className="size-full object-cover object-top"
              />
            </div>
          ) : null}

          <KeyValueList
            className="-my-2.5"
            items={[
              { label: 'Service', value: <span className="font-medium">{svc.name}</span> },
              {
                label: 'Server',
                mono: true,
                value: svc.server ? `${svc.server.name} · ${svc.server.ip}` : 'No server assigned',
              },
              {
                label: 'Source',
                value: (
                  <span className="flex flex-wrap items-center gap-2">
                    <KindChip kind={svc.kind} />
                    <StatusBadge status={svc.status} />
                  </span>
                ),
              },
              {
                label: 'Deployment',
                mono: true,
                value:
                  productionDeployment && deploymentHref ? (
                    <Link href={deploymentHref} className="hover:underline">
                      {productionDeployment.uuid}
                    </Link>
                  ) : (
                    <span className="text-muted-foreground">No successful deployment</span>
                  ),
              },
              {
                label: 'Domains',
                mono: true,
                value: domains.length ? (
                  <span className="flex flex-col gap-1">
                    {domains.map((d) => (
                      <a
                        key={d}
                        href={d.startsWith('http') ? d : `https://${d}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-foreground inline-flex items-center gap-1 hover:underline"
                      >
                        {d.replace(/^https?:\/\//, '')} <ExternalLink className="size-3" />
                      </a>
                    ))}
                  </span>
                ) : (
                  <span className="text-muted-foreground font-sans">No domains configured</span>
                ),
              },
              {
                label: 'Created',
                value: (
                  <>
                    {productionDeployment ? (
                      <LocalDateTime value={productionDeployment.createdAt} />
                    ) : (
                      '—'
                    )}
                    {productionDeployment?.triggeredBy ? ` by ${productionDeployment.triggeredBy}` : ''}
                  </>
                ),
              },
              {
                label: 'Branch',
                mono: true,
                value: svc.gitBranch ? (
                  branchUrl ? (
                    <a href={branchUrl} target="_blank" rel="noreferrer" className="hover:underline">
                      {svc.gitBranch}
                    </a>
                  ) : (
                    svc.gitBranch
                  )
                ) : (
                  <span className="text-muted-foreground">—</span>
                ),
              },
              { label: 'Commit', mono: true, value: commit },
            ]}
          />
        </div>
      </Panel>

      <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        <Panel
          title="Recent deployments"
          actions={
            <Button size="sm" variant="ghost" onClick={onOpenDeployments}>
              View all
            </Button>
          }
          padded={false}
        >
          <DataTable
            className="rounded-none border-0"
            rows={recent}
            rowKey={(d) => d.id}
            rowHref={deploymentHrefFor}
            emptyState={
              <p className="text-muted-foreground p-6 text-center text-base">No deployments yet.</p>
            }
            columns={[
              { key: 'status', header: 'Status', cell: (d) => <StatusBadge status={d.status} /> },
              {
                key: 'commit',
                header: 'Commit',
                cell: (d) => (
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="shrink-0 font-mono">
                      {d.commitSha ? d.commitSha.slice(0, 7) : d.uuid.slice(0, 7)}
                    </span>
                    {d.commitMessage ? (
                      <span className="text-muted-foreground max-w-[280px] truncate">{d.commitMessage}</span>
                    ) : null}
                    {d.isPreview && (
                      <Badge variant="outline" className="shrink-0">
                        Preview{d.pullRequestId != null ? ` #${d.pullRequestId}` : ''}
                      </Badge>
                    )}
                    {d.previewUrl && (
                      <a
                        href={d.previewUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        title={d.previewUrl}
                        className="text-muted-foreground hover:text-primary relative z-10 inline-flex items-center gap-1 text-sm"
                      >
                        <ExternalLink className="size-3" />
                        Open
                      </a>
                    )}
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
                align: 'right',
                cell: (d) => (
                  <span className="text-muted-foreground">
                    {formatDuration(d.startedAt, d.finishedAt) ?? '—'}
                  </span>
                ),
              },
            ]}
          />
        </Panel>
        <Panel title="Activity">
          <KeyValueList
            className="-my-2.5"
            items={[
              { label: 'Deployments', value: svc._count.deployments },
              { label: 'Environment vars', value: svc._count.environmentVars },
              { label: 'Volumes', value: svc._count.persistentVolumes },
              { label: 'Previews', value: svc._count.previews },
              { label: 'Webhooks', value: svc._count.webhooks },
            ]}
          />
        </Panel>
      </div>
    </div>
  );
}
