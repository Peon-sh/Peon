'use client';

import Link from 'next/link';
import { Suspense, use, useEffect, useRef, useState, type ReactNode } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient, useInfiniteQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Trash2,
  Play,
  Square,
  RotateCw,
  Rocket,
  ExternalLink,
  Layers,
  Eye,
  EyeOff,
  Copy,
  Download,
  RefreshCw,
  CircleHelp,
  TriangleAlert,
  PauseCircle,
} from 'lucide-react';
import { type ServiceSectionId as SectionId } from '@/lib/service-sections';
import {
  githubBranchUrl,
  githubCommitUrl,
  githubRepoSlug,
  githubRepoUrl,
} from '@/lib/github-urls';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { DocCallout, DocBullets } from '@/components/app/doc-callout';
import {
  updateService,
  deleteService,
  deployService,
  controlService,
  rollbackService,
  listEnv,
  upsertEnv,
  deleteEnv,
  bulkSaveEnv,
  importPreviewEnvFromProduction,
  listVolumes,
  createVolume,
  deleteVolume,
  listWebhooks,
  createWebhook,
  deleteWebhook,
  listPreviews,
  deletePreview,
  listServers,
  listTasks,
  createTask,
  updateTask,
  deleteTask,
  runTask,
  listTaskExecutions,
  getServiceLogs,
  getServiceConfig,
  updateServiceConfig,
  listBackups,
  createBackup,
  updateBackup,
  deleteBackup,
  runBackupNow,
  listBackupExecutions,
  restoreBackup,
  downloadBackup,
  type ServiceDetail,
  type ScheduledTaskItem,
  type ServiceConfigField,
  type ScheduledBackupItem,
  type ServiceControlAction,
} from '@/services/api/service';
import { listPrivateKeys } from '@/services/api/privatekey';
import {
  listGithubSourceBranches,
  listGithubSourceRepositories,
  listSources,
} from '@/services/api/sources';
import { listStorages } from '@/services/api/storages';
import {
  listDeployments,
  cancelDeployment,
  deploymentPreviewUrl,
  type DeploymentListItem,
} from '@/services/api/deployment';
import { PageContainer, Panel } from '@/components/app/page';
import { ConfirmButton } from '@/components/app/confirm';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { StatusBadge } from '@/components/app/status-badge';
import { RunOutput } from '@/components/app/run-output';
import { KindChip } from '@/components/app/kind-chip';
import { LocalDateTime } from '@/components/app/local-datetime';
import { AccessGateBanner } from '@/components/billing/access-gate-banner';
import { formatLocalDateTime } from '@/lib/datetime';
import { useCurrentWorkspaceAccess } from '@/lib/billing/workspace-access';
import { getProject } from '@/services/api/project';
import { SshTerminal } from '@/components/terminal/ssh-terminal';
import { useAuthStore } from '@/store/auth';
import { publicEnv } from '@/lib/env';
import {
  invalidateServiceQueries,
  patchServiceStatusInCache,
  useServiceDetail,
} from '@/lib/queries/service';
import { useRedeployNoticeStore } from '@/store/redeploy-notice';

const KIND_LABELS: Record<string, string> = {
  GIT_APP: 'Application (Git)',
  DOCKERFILE: 'Dockerfile',
  DOCKER_IMAGE: 'Docker Image',
  STATIC: 'Static Site',
  NIXPACKS: 'Nixpacks',
  DATABASE: 'Database',
  COMPOSE: 'Compose',
};

export default function ServiceDetailPage({
  params,
}: {
  params: Promise<{ projectId: string; serviceId: string }>;
}) {
  return (
    <Suspense fallback={null}>
      <ServiceDetail_ params={params} />
    </Suspense>
  );
}

function ServiceDetail_({ params }: { params: Promise<{ projectId: string; serviceId: string }> }) {
  const { projectId, serviceId } = use(params);
  const qc = useQueryClient();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const showRedeployNotice = useRedeployNoticeStore((s) => s.show);
  const hideRedeployNotice = useRedeployNoticeStore((s) => s.hide);
  const setRedeployBusy = useRedeployNoticeStore((s) => s.setBusy);

  const rawSection = searchParams.get('section') as SectionId | null;
  const section: SectionId = rawSection ?? 'overview';
  const setSection = (id: SectionId) =>
    router.replace(id === 'overview' ? pathname : `${pathname}?section=${id}`, { scroll: false });

  const { data: svc } = useServiceDetail(serviceId);
  const invalidate = () => invalidateServiceQueries(qc, { serviceId, projectId });
  const promptRedeploy = () => {
    showRedeployNotice({
      onRedeploy: () => deployMut.mutate({}),
      busy: deployMut.isPending,
    });
  };

  const deployMut = useMutation({
    mutationFn: (opts: { force?: boolean; restartOnly?: boolean } = {}) => deployService(serviceId, opts),
    onSuccess: async (deployment) => {
      await qc.invalidateQueries({ queryKey: ['deployments', serviceId] });
      await qc.invalidateQueries({ queryKey: ['active-deployments'] });
      await invalidate();
      hideRedeployNotice();
      toast.success('Deployment queued');
      router.push(`/projects/${projectId}/services/${serviceId}/deployments/${deployment.id}`);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed'),
  });

  useEffect(() => {
    setRedeployBusy(deployMut.isPending);
  }, [deployMut.isPending, setRedeployBusy]);

  const controlMut = useMutation({
    mutationFn: (action: ServiceControlAction) => controlService(serviceId, action),
    onSuccess: async (res, action) => {
      patchServiceStatusInCache(qc, {
        serviceId,
        projectId,
        status: res.status,
      });
      await invalidate();
      // Resume can end up rebuilding instead of just starting the containers
      // (docker cleanup prunes stopped containers and unused images), so say so
      // up front rather than letting an unexplained build appear.
      if (action === 'resume') {
        toast.success('resume queued', {
          description:
            'If the image was cleaned up while suspended, Peon rebuilds the service automatically.',
        });
      } else {
        toast.success(`${action} queued`);
      }
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed'),
  });

  if (!svc) {
    return (
      <PageContainer>
        <div className="bg-accent h-20 animate-pulse rounded-lg" />
        <div className="bg-accent h-64 animate-pulse rounded-lg" />
      </PageContainer>
    );
  }

  const busy = deployMut.isPending || controlMut.isPending;
  const isFullscreenSection = section === 'logs' || section === 'terminal';

  return (
    <div className={isFullscreenSection ? 'flex min-h-[calc(100vh-7rem)] flex-col' : 'w-full'}>
      <div className={isFullscreenSection ? 'flex min-h-0 flex-1 flex-col' : 'min-w-0'}>
        {section === 'overview' && (
          <OverviewTab
            svc={svc}
            projectId={projectId}
            onDeploy={() => deployMut.mutate({})}
            onForceDeploy={() => deployMut.mutate({ force: true })}
            onControl={(action) => controlMut.mutate(action)}
            onOpenDeployments={() => setSection('deployments')}
            busy={busy}
          />
        )}
        {section === 'configuration' && (
          <ConfigurationTab svc={svc} onSaved={invalidate} onSettingsChanged={promptRedeploy} />
        )}
        {section === 'environment' && (
          <EnvironmentTab
            serviceId={serviceId}
            projectId={projectId}
            onSettingsChanged={promptRedeploy}
          />
        )}
        {section === 'domains' && svc.kind !== 'DATABASE' && (
          <DomainsTab svc={svc} onSaved={invalidate} onSettingsChanged={promptRedeploy} />
        )}
        {section === 'storage' && <StorageTab serviceId={serviceId} />}
        {section === 'tasks' && <TasksTab serviceId={serviceId} />}
        {section === 'backups' && <BackupsTab serviceId={serviceId} />}
        {section === 'deployments' && (
          <DeploymentsTab
            serviceId={serviceId}
            projectId={projectId}
            onDeploy={() => deployMut.mutate({})}
            onForceDeploy={() => deployMut.mutate({ force: true })}
          />
        )}
        {section === 'logs' && <LogsTab serviceId={serviceId} />}
        {section === 'terminal' && <TerminalTab serviceId={serviceId} />}
        {section === 'webhooks' && (
          <WebhooksTab serviceId={serviceId} gitBranch={svc.gitBranch} />
        )}
        {section === 'danger' && (
          <DangerTab serviceId={serviceId} projectId={projectId} name={svc.name} />
        )}
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between border-b py-2 text-[11px] last:border-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-[12.5px] font-semibold">{value ?? '-'}</span>
    </div>
  );
}

function DetailField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-muted-foreground mb-1 text-[11px]">{label}</p>
      <div className="text-[12.5px]">{children}</div>
    </div>
  );
}

function OverviewTab({
  svc,
  projectId,
  onDeploy,
  onForceDeploy,
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
  const hasDeployment = !!productionDeployment;
  // Status alone, not suspendedAt: the API reconciles status to SUSPENDED exactly
  // when suspendedAt is set, and the optimistic cache patch after a control
  // action only updates status. Reading suspendedAt here would keep the
  // suspended UI on screen until the refetch lands, and a second Resume click
  // would 409. suspendedAt is still used below for the "suspended since" label.
  const isSuspended = svc.status === 'SUSPENDED';
  const isRunning = !isSuspended && ['RUNNING', 'STARTING'].includes(svc.status);

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

  return (
    <div className="space-y-4">
      {isSuspended && (
        <Alert>
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
        title="production deployment"
        actions={
          <div className="flex flex-wrap items-center justify-end gap-2">
            {repoUrl && (
              <Button asChild size="sm" variant="outline">
                <a href={repoUrl} target="_blank" rel="noreferrer">
                  Repository <ExternalLink className="size-3" />
                </a>
              </Button>
            )}
            {isSuspended ? (
              <Button size="sm" onClick={() => onControl('resume')} disabled={busy}>
                <Play className="size-3.5" /> Resume
              </Button>
            ) : isRunning ? (
              <>
                <Button size="sm" variant="outline" onClick={() => onControl('stop')} disabled={busy}>
                  <Square className="size-3.5" /> Stop
                </Button>
                <Button size="sm" variant="outline" onClick={() => onControl('restart')} disabled={busy}>
                  <RotateCw className="size-3.5" /> Restart
                </Button>
                <ConfirmButton
                  size="sm"
                  variant="outline"
                  confirmVariant="default"
                  confirmLabel="Suspend"
                  title="Suspend this service?"
                  description="Containers stop and stay stopped. Deploys, git webhooks, scheduled tasks, and backups are paused until you resume. Configuration, domains, and volumes are kept."
                  onConfirm={() => onControl('suspend')}
                  disabled={busy}
                >
                  <PauseCircle className="size-3.5" /> Suspend
                </ConfirmButton>
              </>
            ) : hasDeployment ? (
              <Button size="sm" variant="outline" onClick={() => onControl('start')} disabled={busy}>
                <Play className="size-3.5" /> Start
              </Button>
            ) : null}
            {primaryUrl && !isSuspended && (
              <Button asChild size="sm" variant="outline">
                <a href={primaryUrl} target="_blank" rel="noreferrer">
                  Visit <ExternalLink className="size-3" />
                </a>
              </Button>
            )}
            <Button
              size="sm"
              variant="outline"
              onClick={onForceDeploy}
              disabled={busy || isSuspended}
              title={
                isSuspended
                  ? 'Resume the service before deploying'
                  : 'Clear cached source and rebuild without Docker/Nixpacks cache'
              }
            >
              <RefreshCw className="size-3.5" /> Force rebuild
            </Button>
            <Button
              onClick={onDeploy}
              disabled={busy || isSuspended}
              title={isSuspended ? 'Resume the service before deploying' : undefined}
            >
              <Rocket className="size-4" /> {hasDeployment ? 'Redeploy' : 'Deploy now'}
            </Button>
          </div>
        }
        footer={
          <div className="flex w-full flex-wrap items-center justify-between gap-2">
            <span className="text-muted-foreground text-[11.5px]">
              {svc.gitBranch
                ? `To update your Production Deployment, push to the ${svc.gitBranch} branch.`
                : 'Deploy manually or configure a git source to deploy on push.'}
            </span>
            <Button size="sm" variant="ghost" onClick={onOpenDeployments}>
              <Layers className="size-3.5" /> Deployments
            </Button>
          </div>
        }
        contentClassName="p-4"
      >
        <div className="grid gap-6 md:grid-cols-[minmax(280px,360px)_1fr] md:items-start">
          <div className="border-border-bright relative aspect-[4/3] w-full overflow-hidden rounded-md border bg-gradient-to-br from-secondary to-background">
            {productionDeployment?.hasPreview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={deploymentPreviewUrl(productionDeployment.id)}
                alt={`${svc.name} deployment preview`}
                className="size-full object-cover object-top"
              />
            ) : (
              <div className="grid size-full place-items-center">
                <span className="text-phosphor font-heading text-4xl font-extrabold uppercase">
                  {svc.name[0]}
                </span>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-2">
            <DetailField label="Service">
              <p className="font-semibold">{svc.name}</p>
            </DetailField>
            <DetailField label="Server">
              <p className="font-mono text-[12px]">
                {svc.server ? `${svc.server.name} · ${svc.server.ip}` : 'No server assigned'}
              </p>
            </DetailField>
            <DetailField label="Source">
              <div className="flex flex-wrap items-center gap-2">
                <KindChip kind={svc.kind} />
                <StatusBadge status={svc.status} />
              </div>
            </DetailField>
            <DetailField label="Deployment">
              {productionDeployment && deploymentHref ? (
                <Link href={deploymentHref} className="font-mono text-[12px] hover:underline">
                  {productionDeployment.uuid}
                </Link>
              ) : (
                <p className="text-muted-foreground font-mono text-[12px]">No successful deployment</p>
              )}
            </DetailField>
            <DetailField label="Domains">
              {domains.length ? (
                <div className="flex flex-col gap-1">
                  {domains.map((d) => (
                    <a
                      key={d}
                      href={d.startsWith('http') ? d : `https://${d}`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-foreground inline-flex items-center gap-1 font-medium hover:underline"
                    >
                      {d.replace(/^https?:\/\//, '')} <ExternalLink className="size-3" />
                    </a>
                  ))}
                </div>
              ) : (
                <p className="text-muted-foreground">No domains configured</p>
              )}
            </DetailField>
            <DetailField label="Created">
              <p>
                {productionDeployment ? (
                  <LocalDateTime value={productionDeployment.createdAt} />
                ) : (
                  '—'
                )}
                {productionDeployment?.triggeredBy ? ` by ${productionDeployment.triggeredBy}` : ''}
              </p>
            </DetailField>
            <DetailField label="Branch">
              {svc.gitBranch ? (
                branchUrl ? (
                  <a
                    href={branchUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="font-mono text-[12px] hover:underline"
                  >
                    {svc.gitBranch}
                  </a>
                ) : (
                  <p className="font-mono text-[12px]">{svc.gitBranch}</p>
                )
              ) : (
                <p className="text-muted-foreground">—</p>
              )}
            </DetailField>
            <DetailField label="Commit">
              {commitSha ? (
                <p className="font-mono text-[12px]">
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
                    <span className="text-muted-foreground ml-2 font-sans">
                      {productionDeployment.commitMessage}
                    </span>
                  ) : null}
                </p>
              ) : (
                <p className="text-muted-foreground">
                  {svc.kind === 'DATABASE' ? KIND_LABELS[svc.kind] : 'No git source'}
                </p>
              )}
            </DetailField>
          </div>
        </div>
      </Panel>

      <div className="grid gap-4 md:grid-cols-2">
        <Panel
          title="recent deployments"
          actions={
            <Button size="sm" variant="ghost" onClick={onOpenDeployments}>
              View all
            </Button>
          }
          contentClassName="divide-y"
        >
          {(deployments ?? []).slice(0, 5).length ? (
            (deployments ?? []).slice(0, 5).map((d) => (
              <div
                key={d.id}
                className="hover:bg-secondary/50 flex items-center justify-between gap-3 px-4 py-2.5 transition-colors"
              >
                <Link
                  href={`/projects/${projectId}/services/${svc.id}/deployments/${d.id}`}
                  className="flex min-w-0 flex-1 items-center gap-2"
                >
                  <StatusBadge status={d.status} />
                  {d.isPreview && (
                    <Badge variant="outline" className="shrink-0 text-[10px]">
                      preview{d.pullRequestId != null ? ` #${d.pullRequestId}` : ''}
                    </Badge>
                  )}
                  <span className="text-muted-foreground shrink-0 font-mono text-[11px]">
                    {d.commitSha ? d.commitSha.slice(0, 7) : d.uuid.slice(0, 7)}
                  </span>
                  {d.commitMessage ? (
                    <span className="text-foreground min-w-0 truncate text-[11.5px]">{d.commitMessage}</span>
                  ) : null}
                </Link>
                <div className="flex shrink-0 items-center gap-2">
                  {d.previewUrl && (
                    <a
                      href={d.previewUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      title={d.previewUrl}
                      className="text-muted-foreground hover:text-phosphor inline-flex items-center gap-1 text-[11px] transition-colors"
                    >
                      <ExternalLink className="size-3" />
                      Open
                    </a>
                  )}
                  <span className="text-muted-foreground text-[11px]">
                    <LocalDateTime value={d.createdAt} />
                  </span>
                </div>
              </div>
            ))
          ) : (
            <div className="text-muted-foreground p-6 text-center text-[12.5px]">no deployments yet.</div>
          )}
        </Panel>
        <Panel title="activity" contentClassName="px-4 py-2">
          <Row label="deployments" value={svc._count.deployments} />
          <Row label="environment vars" value={svc._count.environmentVars} />
          <Row label="volumes" value={svc._count.persistentVolumes} />
          <Row label="previews" value={svc._count.previews} />
          <Row label="webhooks" value={svc._count.webhooks} />
        </Panel>
      </div>
    </div>
  );
}

function ConfigurationTab({
  svc,
  onSaved,
  onSettingsChanged,
}: {
  svc: ServiceDetail;
  onSaved: () => void;
  onSettingsChanged: () => void;
}) {
  const workspaceId = useAuthStore((s) => s.currentWorkspaceId);
  const [form, setForm] = useState<Record<string, unknown>>({});
  const set = (k: string, v: unknown) => setForm((f) => ({ ...f, [k]: v }));
  const hasOverride = (k: string) => Object.prototype.hasOwnProperty.call(form, k);
  const val = <T,>(k: keyof ServiceDetail, fallback: T): T =>
    hasOverride(k as string) ? (form[k as string] as T) : ((svc[k] as T) ?? fallback);
  const settingVal = <T,>(k: keyof NonNullable<ServiceDetail['settings']>, fallback: T): T =>
    hasOverride(k as string) ? (form[k as string] as T) : ((svc.settings?.[k] as T) ?? fallback);

  const { data: servers } = useQuery({
    queryKey: ['servers', workspaceId],
    queryFn: () => listServers(workspaceId!),
    enabled: !!workspaceId,
  });

  const { data: sources } = useQuery({
    queryKey: ['sources', workspaceId],
    queryFn: () => listSources(workspaceId!),
    enabled: !!workspaceId,
  });
  const { data: privateKeys } = useQuery({
    queryKey: ['private-keys', workspaceId],
    queryFn: () => listPrivateKeys(workspaceId!),
    enabled: !!workspaceId,
  });

  const githubSources = sources?.github ?? [];
  const gitlabSources = sources?.gitlab ?? [];
  const connectedGithubSources = githubSources.filter(
    (source) => source.status === 'CONNECTED' || source.kind === 'CUSTOM',
  );
  const gitSourceType = val('gitSourceType', svc.gitSourceType ?? 'PUBLIC');
  const gitUiMode: 'PUBLIC' | 'GIT_APP' | 'DEPLOY_KEY' =
    gitSourceType === 'GITHUB_APP' || gitSourceType === 'GITLAB_APP'
      ? 'GIT_APP'
      : gitSourceType === 'DEPLOY_KEY'
        ? 'DEPLOY_KEY'
        : 'PUBLIC';

  const selectedGithubAppId =
    gitSourceType === 'GITHUB_APP'
      ? (val('githubAppId', svc.githubAppId ?? '') || connectedGithubSources[0]?.id || '')
      : '';
  const selectedGitlabAppId =
    gitSourceType === 'GITLAB_APP' ? (val('gitlabAppId', svc.gitlabAppId ?? '') || gitlabSources[0]?.id || '') : '';
  const selectedGithubSource = connectedGithubSources.find((s) => s.id === selectedGithubAppId);
  const selectedGitAppConnection =
    gitSourceType === 'GITHUB_APP' && selectedGithubAppId
      ? `github:${selectedGithubAppId}`
      : gitSourceType === 'GITLAB_APP' && selectedGitlabAppId
        ? `gitlab:${selectedGitlabAppId}`
        : '';
  const currentRepoSlug = githubRepoSlug(val('gitRepository', svc.gitRepository ?? ''));

  // Same defaults the previous effect applied when sources load (keeps Save dirtyable).
  const defaultGithubAppId =
    gitSourceType === 'GITHUB_APP' &&
    !val('githubAppId', svc.githubAppId ?? '') &&
    connectedGithubSources[0]?.id
      ? connectedGithubSources[0].id
      : null;
  const defaultGitlabAppId =
    gitSourceType === 'GITLAB_APP' &&
    !val('gitlabAppId', svc.gitlabAppId ?? '') &&
    gitlabSources[0]?.id
      ? gitlabSources[0].id
      : null;
  const [prevGitDefaults, setPrevGitDefaults] = useState({
    defaultGithubAppId,
    defaultGitlabAppId,
  });
  if (
    defaultGithubAppId !== prevGitDefaults.defaultGithubAppId ||
    defaultGitlabAppId !== prevGitDefaults.defaultGitlabAppId
  ) {
    setPrevGitDefaults({ defaultGithubAppId, defaultGitlabAppId });
    if (defaultGithubAppId) set('githubAppId', defaultGithubAppId);
    if (defaultGitlabAppId) set('gitlabAppId', defaultGitlabAppId);
  }

  const { data: githubRepos, isLoading: reposLoading, isError: reposError } = useQuery({
    queryKey: ['github-source-repos', selectedGithubAppId],
    queryFn: () => listGithubSourceRepositories(selectedGithubAppId),
    enabled: gitSourceType === 'GITHUB_APP' && !!selectedGithubAppId,
    retry: false,
  });

  const { data: githubBranches, isLoading: branchesLoading } = useQuery({
    queryKey: ['github-source-branches', selectedGithubAppId, currentRepoSlug],
    queryFn: () => listGithubSourceBranches(selectedGithubAppId, currentRepoSlug!),
    enabled: gitSourceType === 'GITHUB_APP' && !!selectedGithubAppId && !!currentRepoSlug,
  });

  const saveMut = useMutation({
    mutationFn: () => {
      const payload = { ...form };
      if (gitSourceType === 'GITHUB_APP' && selectedGithubAppId && payload.githubAppId == null) {
        payload.githubAppId = selectedGithubAppId;
      }
      if (gitSourceType === 'GITLAB_APP' && selectedGitlabAppId && payload.gitlabAppId == null) {
        payload.gitlabAppId = selectedGitlabAppId;
      }
      return updateService(svc.id, payload);
    },
    onSuccess: async () => {
      setForm({});
      onSaved();
      toast.success('Saved');
      onSettingsChanged();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed'),
  });

  const isGit = ['GIT_APP', 'DOCKERFILE', 'NIXPACKS', 'STATIC'].includes(svc.kind);
  const isDb = svc.kind === 'DATABASE';
  // Databases are TCP services: no HTTP domains / proxy flags / HTTP healthcheck.
  const hasHttpSurface = !isDb;
  const buildPack = val('buildPack', svc.buildPack ?? 'NIXPACKS');
  // Show Dockerfile Location whenever the build pack is Dockerfile.
  const isDockerfilePack = buildPack === 'DOCKERFILE' || svc.kind === 'DOCKERFILE';
  const dirty = Object.keys(form).length > 0;
  const saveFooter = (
    <Button size="sm" onClick={() => saveMut.mutate()} disabled={!dirty || saveMut.isPending}>
      Save
    </Button>
  );

  return (
    <div>
      <div className="space-y-4">
      <Panel
        id="general"
        title="general"
        contentClassName="grid gap-3 p-4 md:grid-cols-2"
        footer={saveFooter}
      >
        <Field label="Name">
          <Input value={val('name', '')} onChange={(e) => set('name', e.target.value)} />
        </Field>
        <Field label="Description">
          <Input value={val('description', '') ?? ''} onChange={(e) => set('description', e.target.value || null)} />
        </Field>
        <Field label="Server">
          <SearchableSelect
            value={val('serverId', '') ?? ''}
            onValueChange={(v) => set('serverId', v)}
            placeholder="Select server"
            options={(servers ?? []).map((s) => ({
              value: s.id,
              label: `${s.name} (${s.ip})`,
              keywords: s.ip,
            }))}
          />
          {!svc.serverId && (
            <p className="text-muted-foreground text-[11px]">Assign a server before deploying this service.</p>
          )}
        </Field>
        {isGit && (
          <Field
            label="Build pack"
            tooltip="How the image is built. Static: copies the base directory into nginx:alpine and serves files on port 80 (use for HTML/CSS/JS sites). Nixpacks/Railpack: auto-detect frameworks. Dockerfile: use your Dockerfile."
          >
            <SearchableSelect
              value={val('buildPack', 'NIXPACKS')}
              onValueChange={(v) => set('buildPack', v)}
              placeholder="Select build pack"
              options={[
                { value: 'NIXPACKS', label: 'Nixpacks' },
                { value: 'RAILPACK', label: 'Railpack' },
                { value: 'DOCKERFILE', label: 'Dockerfile' },
                { value: 'STATIC', label: 'Static' },
              ]}
            />
          </Field>
        )}
      </Panel>

      {isGit && (
        <Panel id="git-source" title="git source" contentClassName="grid gap-3 p-4 md:grid-cols-2" footer={saveFooter}>
          <Field label="Git source type">
            <SearchableSelect
              value={gitUiMode}
              onValueChange={(mode) => {
                if (mode === 'PUBLIC') {
                  set('gitSourceType', 'PUBLIC');
                  set('githubAppId', null);
                  set('gitlabAppId', null);
                  set('privateKeyId', null);
                  set('repositoryProjectId', null);
                } else if (mode === 'DEPLOY_KEY') {
                  set('gitSourceType', 'DEPLOY_KEY');
                  set('githubAppId', null);
                  set('gitlabAppId', null);
                  set('repositoryProjectId', null);
                } else {
                  // Git App — prefer GitHub connection, else GitLab.
                  if (connectedGithubSources[0]) {
                    set('gitSourceType', 'GITHUB_APP');
                    set('githubAppId', connectedGithubSources[0].id);
                    set('gitlabAppId', null);
                  } else if (gitlabSources[0]) {
                    set('gitSourceType', 'GITLAB_APP');
                    set('gitlabAppId', gitlabSources[0].id);
                    set('githubAppId', null);
                  } else {
                    set('gitSourceType', 'GITHUB_APP');
                    set('githubAppId', null);
                    set('gitlabAppId', null);
                  }
                  set('privateKeyId', null);
                }
              }}
              placeholder="Select source type"
              options={[
                { value: 'GIT_APP', label: 'Git App' },
                { value: 'PUBLIC', label: 'Public repository' },
                { value: 'DEPLOY_KEY', label: 'Deploy key' },
              ]}
            />
          </Field>

          {gitUiMode === 'GIT_APP' ? (
            <>
              <Field label="Connection">
                <SearchableSelect
                  value={selectedGitAppConnection}
                  onValueChange={(value) => {
                    set('gitRepository', '');
                    set('repositoryProjectId', null);
                    set('gitBranch', 'main');
                    if (value.startsWith('github:')) {
                      set('gitSourceType', 'GITHUB_APP');
                      set('githubAppId', value.slice('github:'.length));
                      set('gitlabAppId', null);
                    } else if (value.startsWith('gitlab:')) {
                      set('gitSourceType', 'GITLAB_APP');
                      set('gitlabAppId', value.slice('gitlab:'.length));
                      set('githubAppId', null);
                      set('repositoryProjectId', null);
                    }
                  }}
                  placeholder={
                    connectedGithubSources.length || gitlabSources.length
                      ? 'Select connection'
                      : 'No connections — add one under Sources'
                  }
                  disabled={!connectedGithubSources.length && !gitlabSources.length}
                  options={[
                    ...connectedGithubSources.map((source) => ({
                      value: `github:${source.id}`,
                      label:
                        source.kind === 'PLATFORM'
                          ? `GitHub (Peon)${source.organization ? `: ${source.organization}` : ''}`
                          : `GitHub: ${source.name}`,
                    })),
                    ...gitlabSources.map((source) => ({
                      value: `gitlab:${source.id}`,
                      label: `GitLab: ${source.name}`,
                    })),
                  ]}
                />
              </Field>
              {selectedGithubSource?.status && selectedGithubSource.status !== 'CONNECTED' ? (
                <p className="text-muted-foreground col-span-full text-[12px]">
                  This GitHub connection is {selectedGithubSource.status.toLowerCase()}. Reconnect under
                  Sources before deploying.
                </p>
              ) : null}
              {gitSourceType === 'GITHUB_APP' ? (
                <>
                  <Field label="Repository">
                    <SearchableSelect
                      value={currentRepoSlug ?? ''}
                      onValueChange={(fullName) => {
                        const repo = githubRepos?.find((r) => r.fullName === fullName);
                        set('gitRepository', repo?.cloneUrl ?? fullName);
                        set('repositoryProjectId', repo?.id ?? null);
                        set('gitBranch', repo?.defaultBranch ?? val('gitBranch', 'main'));
                      }}
                      placeholder={
                        reposLoading
                          ? 'Loading repositories…'
                          : reposError
                            ? 'Failed to load repositories'
                            : 'Select repository'
                      }
                      emptyText={
                        reposError
                          ? 'Could not load repositories — check Sources connection'
                          : 'No repositories found for this installation'
                      }
                      disabled={
                        reposLoading ||
                        reposError ||
                        !selectedGithubAppId ||
                        selectedGithubSource?.status === 'DISCONNECTED'
                      }
                      options={(githubRepos ?? []).map((repo) => ({
                        value: repo.fullName,
                        label: `${repo.fullName}${repo.private ? ' · private' : ''}`,
                        keywords: repo.fullName,
                      }))}
                    />
                  </Field>
                  <Field label="Branch">
                    <SearchableSelect
                      value={val('gitBranch', '') || 'main'}
                      onValueChange={(branch) => set('gitBranch', branch)}
                      placeholder={branchesLoading ? 'Loading branches…' : 'Select branch'}
                      disabled={!currentRepoSlug || branchesLoading}
                      options={(
                        githubBranches?.length
                          ? githubBranches
                          : [val('gitBranch', svc.gitBranch ?? 'main') || 'main']
                      ).map((branch) => ({
                        value: branch,
                        label: branch,
                      }))}
                    />
                  </Field>
                </>
              ) : (
                <>
                  <Field label="Git repository">
                    <Input
                      value={val('gitRepository', '')}
                      onChange={(e) => set('gitRepository', e.target.value)}
                      placeholder="https://gitlab.com/group/project.git"
                    />
                  </Field>
                  <Field label="Branch">
                    <Input
                      value={val('gitBranch', '')}
                      onChange={(e) => set('gitBranch', e.target.value)}
                    />
                  </Field>
                </>
              )}
            </>
          ) : (
            <>
              <Field label="Git repository">
                <Input
                  value={val('gitRepository', '')}
                  onChange={(e) => set('gitRepository', e.target.value)}
                  placeholder="https://github.com/org/repo.git"
                />
              </Field>
              <Field label="Branch">
                <Input
                  value={val('gitBranch', '')}
                  onChange={(e) => set('gitBranch', e.target.value)}
                />
              </Field>
            </>
          )}

          {gitUiMode === 'DEPLOY_KEY' && (
            <Field label="Private key">
              <SearchableSelect
                value={val('privateKeyId', '') || 'none'}
                onValueChange={(id) => set('privateKeyId', id === 'none' ? null : id)}
                placeholder="Select private key"
                options={[
                  { value: 'none', label: 'No private key' },
                  ...(privateKeys ?? []).map((key) => ({ value: key.id, label: key.name })),
                ]}
              />
            </Field>
          )}
        </Panel>
      )}

      {isGit && (
        <Panel id="build" title="build" contentClassName="space-y-3 p-4" footer={saveFooter}>
          {!isDockerfilePack && (
            <div className="grid gap-3 md:grid-cols-3">
              <Field
                label="Install command"
                tooltip="Overrides the pack’s install step (Nixpacks/Railpack via NIXPACKS_INSTALL_CMD). Example: pnpm install --frozen-lockfile. Leave empty to let the pack detect it."
              >
                <Input value={val('installCommand', '') ?? ''} onChange={(e) => set('installCommand', e.target.value || null)} />
              </Field>
              <Field
                label="Build command"
                tooltip="Overrides the pack’s build step (NIXPACKS_BUILD_CMD). Example: pnpm run build. Leave empty to use the pack’s detected build command."
              >
                <Input value={val('buildCommand', '') ?? ''} onChange={(e) => set('buildCommand', e.target.value || null)} />
              </Field>
              <Field
                label="Start command"
                tooltip="Overrides the pack’s start command (NIXPACKS_START_CMD) used when the container runs. Example: node server.js or pnpm start."
              >
                <Input value={val('startCommand', '') ?? ''} onChange={(e) => set('startCommand', e.target.value || null)} />
              </Field>
            </div>
          )}
          {isDockerfilePack && (
            <Field
              label="Start command"
              tooltip="Optional command that overrides the image CMD when the container starts. Leave empty to use the Dockerfile CMD as-is."
            >
              <Input
                placeholder="Leave empty to use Dockerfile CMD"
                value={val('startCommand', '') ?? ''}
                onChange={(e) => set('startCommand', e.target.value || null)}
              />
            </Field>
          )}
          <div className="grid gap-3 md:grid-cols-3">
            <Field
              label="Base directory"
              tooltip="Repo subdirectory used as the build context (e.g. /apps/web). Defaults to / (repository root). Dockerfile location and install/build commands run relative to this."
            >
              <Input value={val('baseDirectory', '/')} onChange={(e) => set('baseDirectory', e.target.value || '/')} />
            </Field>
            {isDockerfilePack ? (
              <Field
                label="Dockerfile location"
                tooltip="Path to the Dockerfile, resolved with the base directory (e.g. /Dockerfile or /docker/Dockerfile.worker). Used unless inline Dockerfile content is set."
              >
                <Input
                  placeholder="/Dockerfile"
                  value={val('dockerfilePath', '/Dockerfile')}
                  onChange={(e) => set('dockerfilePath', e.target.value || '/Dockerfile')}
                />
                <p className="text-muted-foreground text-[11px]">
                  Resolved with base directory (e.g. <code>/docker/Dockerfile.worker</code>).
                </p>
              </Field>
            ) : (
              <Field
                label="Publish directory"
                tooltip="Folder of built static assets (e.g. dist/out), relative to Base directory. Static pack currently serves the Base directory itself — put built files there (or set Base to your output folder)."
              >
                <Input
                  value={val('publishDirectory', '') ?? ''}
                  onChange={(e) => set('publishDirectory', e.target.value || null)}
                />
              </Field>
            )}
            <Field
              label="Ports exposed / mappings"
              tooltip="Container listen port or host:container mappings (comma-separated), e.g. 3000 or 8080:3000,8443:443. With no domain, these are published on the host. With a domain, host ports are not opened — the first port is used as the proxy/healthcheck target unless you set a healthcheck port."
            >
              <Input
                placeholder="3000 or 8080:3000,8443:443"
                value={val('ports', '') ?? ''}
                onChange={(e) => set('ports', e.target.value || null)}
              />
            </Field>
          </div>
          <Field
            label="Watch paths"
            tooltip="Optional glob patterns (one per line). Auto-deploy from GitHub only runs when a push changes files matching these paths. Leave empty to deploy on every push to the branch."
          >
            <Textarea
              className="font-mono min-h-20"
              placeholder="src/pages/**"
              value={settingVal('watchPaths', '') ?? ''}
              onChange={(e) => set('watchPaths', e.target.value || null)}
            />
          </Field>
          <ToggleField
            label="Disable build cache"
            tooltip="Always rebuild without Docker/Nixpacks cache and clear the cached source on the server. Slower builds, useful when cached layers cause stale output."
            checked={settingVal('disableBuildCache', false)}
            onCheckedChange={(c) => set('disableBuildCache', c)}
          />
        </Panel>
      )}

      {isDockerfilePack && (
        <Panel title="dockerfile" contentClassName="space-y-3 p-4" footer={saveFooter}>
          <Field label="Inline Dockerfile content">
            <Textarea
              className="font-mono min-h-32"
              placeholder="Optional — overrides the file at Dockerfile location when set"
              value={val('dockerfileContent', '') ?? ''}
              onChange={(e) => set('dockerfileContent', e.target.value || null)}
            />
          </Field>
        </Panel>
      )}

      {svc.kind === 'DOCKER_IMAGE' && (
        <Panel title="docker registry" contentClassName="grid gap-3 p-4 md:grid-cols-2" footer={saveFooter}>
            <Field label="Image">
              <Input value={val('dockerRegistryImage', '')} onChange={(e) => set('dockerRegistryImage', e.target.value)} />
            </Field>
            <Field label="Tag">
              <Input value={val('dockerRegistryTag', 'latest')} onChange={(e) => set('dockerRegistryTag', e.target.value)} />
            </Field>
            <Field
              label="Ports exposed / mappings"
              tooltip="Container listen port or host:container mappings (comma-separated), e.g. 3000 or 8080:3000,8443:443. With no domain, these are published on the host. With a domain, host ports are not opened — the first port is used as the proxy/healthcheck target unless you set a healthcheck port."
            >
              <Input
                placeholder="3000 or 8080:3000,8443:443"
                value={val('ports', '') ?? ''}
                onChange={(e) => set('ports', e.target.value || null)}
              />
            </Field>
          </Panel>
      )}

      {svc.kind === 'COMPOSE' && (
        <Panel title="compose" contentClassName="p-4" footer={saveFooter}>
            <Textarea
              className="font-mono min-h-64"
              value={val('dockerComposeRaw', '')}
              onChange={(e) => set('dockerComposeRaw', e.target.value)}
            />
          </Panel>
      )}

      {(svc.kind === 'DATABASE' || svc.kind === 'COMPOSE') && (
        <ServiceConfigPanel serviceId={svc.id} onSaved={onSaved} onSettingsChanged={onSettingsChanged} />
      )}

      {svc.kind === 'DATABASE' && (
        <Panel title="public access" contentClassName="space-y-3 p-4" footer={saveFooter}>
            <ToggleField
              label="Publicly accessible"
              tooltip="Publish the database port on the host so clients can connect from outside the Docker network. Prefer keeping this off and using private networking when possible."
              checked={val('databasePublic', false)}
              onCheckedChange={(c) => set('databasePublic', c)}
            />
            <Field label="Public port">
              <Input
                type="number"
                value={String(val('databasePublicPort', '') ?? '')}
                onChange={(e) => set('databasePublicPort', e.target.value ? Number(e.target.value) : null)}
              />
            </Field>
          </Panel>
      )}

      {svc.kind !== 'COMPOSE' && (
      <Panel id="healthcheck" title="healthcheck" contentClassName="space-y-4 p-4" footer={saveFooter}>
        <div className="flex items-center justify-between gap-4">
          <p className="text-muted-foreground min-w-0 flex-1 text-[12px]">
            {isDb
              ? 'Docker probe timing for the database container (the probe command is engine-specific).'
              : "Define how your container's health should be checked (Docker HEALTHCHECK on the running container)."}
          </p>
          <div className="w-full max-w-[220px] shrink-0">
            <ToggleField
              label="Enabled"
              tooltip={
                isDb
                  ? 'Run Docker HEALTHCHECK probes on the database container using engine-specific commands and the timing fields below.'
                  : 'Add a Docker HEALTHCHECK to the running container using the method, path, and timing options below. Failed probes mark the container unhealthy.'
              }
              checked={val('healthCheckEnabled', false)}
              onCheckedChange={(c) => set('healthCheckEnabled', c)}
            />
          </div>
        </div>
        {hasHttpSurface && (
        <div className="grid gap-3 md:grid-cols-5">
          <Field label="Method">
            <SearchableSelect
              value={val('healthCheckMethod', 'GET')}
              onValueChange={(v) => set('healthCheckMethod', v)}
              placeholder="Select method"
              options={['GET', 'HEAD', 'POST', 'OPTIONS'].map((m) => ({ value: m, label: m }))}
            />
          </Field>
          <Field label="Scheme">
            <SearchableSelect
              value={val('healthCheckScheme', 'http')}
              onValueChange={(v) => set('healthCheckScheme', v)}
              placeholder="Select scheme"
              options={[
                { value: 'http', label: 'http' },
                { value: 'https', label: 'https' },
              ]}
            />
          </Field>
          <Field label="Host">
            <Input
              placeholder="localhost"
              value={val('healthCheckHost', 'localhost')}
              onChange={(e) => set('healthCheckHost', e.target.value || 'localhost')}
            />
          </Field>
          <Field label="Port">
            <Input
              placeholder="defaults to first exposed port"
              value={val('healthCheckPort', '') ?? ''}
              onChange={(e) => set('healthCheckPort', e.target.value || null)}
            />
          </Field>
          <Field label="Path">
            <Input
              placeholder="/"
              value={val('healthCheckPath', '') ?? ''}
              onChange={(e) => set('healthCheckPath', e.target.value || null)}
            />
          </Field>
        </div>
        )}
        {hasHttpSurface && (
        <div className="grid gap-3 md:grid-cols-2">
          <Field label="Return code">
            <Input
              type="number"
              value={String(val('healthCheckReturnCode', 200))}
              onChange={(e) => set('healthCheckReturnCode', Number(e.target.value) || 200)}
            />
          </Field>
          <Field label="Response text (optional, body must contain)">
            <Input
              placeholder="OK"
              value={val('healthCheckResponseText', '') ?? ''}
              onChange={(e) => set('healthCheckResponseText', e.target.value || null)}
            />
          </Field>
        </div>
        )}
        <div className="grid gap-3 md:grid-cols-4">
          <Field label="Interval (s)">
            <Input
              type="number"
              value={String(val('healthCheckInterval', 5))}
              onChange={(e) => set('healthCheckInterval', Number(e.target.value) || 5)}
            />
          </Field>
          <Field label="Timeout (s)">
            <Input
              type="number"
              value={String(val('healthCheckTimeout', 5))}
              onChange={(e) => set('healthCheckTimeout', Number(e.target.value) || 5)}
            />
          </Field>
          <Field label="Retries">
            <Input
              type="number"
              value={String(val('healthCheckRetries', 10))}
              onChange={(e) => set('healthCheckRetries', Number(e.target.value) || 10)}
            />
          </Field>
          <Field label="Start period (s)">
            <Input
              type="number"
              value={String(val('healthCheckStartPeriod', 5))}
              onChange={(e) => set('healthCheckStartPeriod', Number(e.target.value) || 5)}
            />
          </Field>
        </div>
      </Panel>
      )}

      <Panel id="advanced" title="advanced" contentClassName="space-y-3 p-4" footer={saveFooter}>
        {isGit && (
          <PreviewDnsGuide
            serverIp={svc.server?.ip}
            wildcardDomain={
              (servers ?? []).find((s) => s.id === (val('serverId', '') ?? svc.serverId))?.settings
                ?.wildcardDomain ??
              svc.server?.settings?.wildcardDomain ??
              null
            }
          />
        )}
        <div className="grid gap-3 md:grid-cols-2">
          {isGit && (
            <>
              <ToggleField
                label="Auto deploy"
                tooltip="When enabled, push and service webhook events for this branch queue a new deployment. Turn off to require manual Deploy / Redeploy only."
                checked={settingVal('isAutoDeployEnabled', true)}
                onCheckedChange={(c) => set('isAutoDeployEnabled', c)}
              />
              <ToggleField
                label="Preview deployments"
                tooltip="On pull requests targeting this service’s branch, deploy {shortSha}.{serverWildcardDomain}, post a sticky GitHub comment, create a GitHub Check, and a Deployments timeline entry (like Vercel). Requires server Wildcard domain and GitHub App permissions: Pull requests Write, Issues Write, Checks Write, Deployments Write, and the Pull request webhook event."
                checked={settingVal('isPreviewDeploymentsEnabled', false)}
                onCheckedChange={(c) => set('isPreviewDeploymentsEnabled', c)}
              />
              <ToggleField
                label="Static site"
                tooltip="How to use: set Build pack → Static, put site assets under the Base directory (index.html, etc.), set Ports to 80, then Deploy. Peon wraps the folder in nginx:alpine and serves files on :80. This flag is saved for parity; the build pack is what activates static hosting."
                checked={settingVal('isStatic', false)}
                onCheckedChange={(c) => set('isStatic', c)}
              />
              <ToggleField
                label="Single-page app fallback"
                tooltip="How to use: use Build pack → Static for a client-side router (React Router, Vue Router, etc.), then enable this. Intended to rewrite unknown paths to index.html so deep links don’t 404. Flag is saved; Peon’s Static pack still uses default nginx (SPA rewrite not applied yet)."
                checked={settingVal('isSpa', false)}
                onCheckedChange={(c) => set('isSpa', c)}
              />
            </>
          )}
        </div>
        {svc.kind === 'COMPOSE' && (
          <ToggleField
            label="Raw compose deployment"
            tooltip="Deploy your docker-compose.yml as-is — Peon will not inject container_name, the peon network, or proxy labels. Configure Traefik/Caddy yourself. Domains in Peon won’t apply until you add labels. Prefer leaving this off."
            checked={settingVal('isRawComposeDeploymentEnabled', false)}
            onCheckedChange={(c) => set('isRawComposeDeploymentEnabled', c)}
          />
        )}
        {(svc.kind !== 'COMPOSE' && svc.kind !== 'DATABASE') && (
          <ToggleField
            label="Rolling update"
            tooltip="Start the new container beside the old one, wait until it is healthy, then stop the old container. Requires a domain (Traefik/Caddy) and no host port mappings. Turn off to recreate in place."
            checked={settingVal('rollingUpdate', true)}
            onCheckedChange={(c) => set('rollingUpdate', c)}
          />
        )}
        {!isDb && (
        <div className="grid gap-3 md:grid-cols-2">
          <Field
            label="Pre-deploy command"
            tooltip="Shell command run on the server after the image is built and before docker compose up (e.g. cache warm or migrate prep). Leave empty to skip."
          >
            <Input
              value={settingVal('preDeployCommand', '') ?? ''}
              onChange={(e) => set('preDeployCommand', e.target.value || null)}
            />
          </Field>
          <Field
            label="Post-deploy command"
            tooltip="Shell command run on the server after compose is up and the container is ready (e.g. migrate, seed). Leave empty to skip."
          >
            <Input
              value={settingVal('postDeployCommand', '') ?? ''}
              onChange={(e) => set('postDeployCommand', e.target.value || null)}
            />
          </Field>
        </div>
        )}
        <Field
          label="Custom Docker options"
          tooltip="Extra docker run flags merged into compose on deploy. Supported: --cap-add, --cap-drop, --security-opt, --sysctl, --ulimit, --device, --shm-size, --dns, --init, --privileged, --ip, --ip6, --gpus, --hostname, --entrypoint. Example: --cap-add SYS_ADMIN --ulimit nofile=65536:65536"
        >
          <Input
            placeholder="--cap-add SYS_ADMIN --ulimit nofile=65536"
            value={settingVal('customDockerRunOptions', '') ?? ''}
            onChange={(e) => set('customDockerRunOptions', e.target.value || null)}
          />
        </Field>
        {!isDb && (
        <Field
          label="Labels"
          tooltip="Extra Docker labels (one per line), merged into the service compose labels alongside Peon’s proxy labels. Useful for Traefik/Caddy middlewares or custom metadata."
        >
          <Textarea
            className="font-mono min-h-24"
            placeholder="traefik.http.middlewares..."
            value={settingVal('customLabels', '') ?? ''}
            onChange={(e) => set('customLabels', e.target.value || null)}
          />
        </Field>
        )}
      </Panel>

      <Panel id="resource-limits" title="resource limits" contentClassName="grid gap-3 p-4 md:grid-cols-2" footer={saveFooter}>
        <Field
          label="CPU limit"
          tooltip="Docker CPU limit for the container (e.g. 0.5 = half a core). Leave empty for no limit. Applied on deploy via compose."
        >
          <Input
            placeholder="0.5"
            value={settingVal('cpuLimit', '') ?? ''}
            onChange={(e) => set('cpuLimit', e.target.value || null)}
          />
        </Field>
        <Field
          label="Memory limit"
          tooltip="Docker memory limit (e.g. 512m or 1g). Leave empty for no limit. Applied on deploy via compose."
        >
          <Input
            placeholder="512m"
            value={settingVal('memoryLimit', '') ?? ''}
            onChange={(e) => set('memoryLimit', e.target.value || null)}
          />
        </Field>
        <Field
          label="Docker images to keep"
          tooltip="After each successful build, keep this many previous peon/* image tags plus the currently running one (for rollback). Set 0 to keep only the running image. PR/preview tags are always removed. Applies to git-built apps, not registry pulls."
        >
          <Input
            type="number"
            value={String(settingVal('dockerImagesToKeep', 3))}
            onChange={(e) => set('dockerImagesToKeep', Number(e.target.value || 3))}
          />
        </Field>
        <Field
          label="Stop grace period (seconds)"
          tooltip="Seconds Docker waits for a graceful shutdown on stop/restart/redeploy before SIGKILL. Applied as stop_grace_period in compose."
        >
          <Input
            type="number"
            value={String(settingVal('stopGracePeriod', 30))}
            onChange={(e) => set('stopGracePeriod', Number(e.target.value || 30))}
          />
        </Field>
      </Panel>
      </div>
    </div>
  );
}

/**
 * Multi-domain editor with add/remove rows. Persists as comma-separated fqdn.
 */
function parseDomains(fqdn: string): string[] {
  return fqdn
    .split(',')
    .map((d) => d.trim())
    .filter(Boolean);
}

function DomainsField({
  serviceId,
  value,
  onChange,
}: {
  serviceId: string;
  value: string;
  onChange: (fqdn: string | null) => void;
}) {
  const [domains, setDomains] = useState<string[]>(() => {
    const parsed = parseDomains(value);
    return parsed.length ? parsed : [''];
  });
  const [prevServiceId, setPrevServiceId] = useState(serviceId);

  if (serviceId !== prevServiceId) {
    setPrevServiceId(serviceId);
    const parsed = parseDomains(value);
    setDomains(parsed.length ? parsed : ['']);
  }

  const commit = (next: string[]) => {
    const rows = next.length ? next : [''];
    setDomains(rows);
    const joined = rows.map((d) => d.trim()).filter(Boolean);
    onChange(joined.length ? joined.join(',') : null);
  };

  return (
    <div className="space-y-2">
      <Label>Domains</Label>
      <div className="space-y-2">
        {domains.map((domain, i) => (
          <div key={i} className="flex gap-2">
            <Input
              className="min-w-0 flex-1"
              placeholder="https://app.example.com"
              value={domain}
              onChange={(e) => {
                const next = [...domains];
                next[i] = e.target.value;
                commit(next);
              }}
            />
            {domains.length > 1 && (
              <ConfirmButton
                title="Remove this domain?"
                description="It will be removed from the form. Save the service for the change to take effect."
                confirmLabel="Remove"
                size="icon-sm"
                onConfirm={() => {
                  const next = domains.filter((_, idx) => idx !== i);
                  commit(next.length ? next : ['']);
                }}
              >
                <Trash2 className="size-3.5" />
                <span className="sr-only">Remove domain</span>
              </ConfirmButton>
            )}
          </div>
        ))}
      </div>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => commit([...domains, ''])}
      >
        Add New Domain
      </Button>
    </div>
  );
}

function DnsGuide({ serverIp, domain }: { serverIp?: string | null; domain?: string }) {
  const host = domain?.replace(/^https?:\/\//, '').split('/')[0] || 'app.example.com';
  const parts = host.split('.');
  const sub = parts.length > 2 ? parts.slice(0, -2).join('.') : '@';
  const ip = serverIp || '<your-server-ip>';

  const copy = (text: string) => {
    void navigator.clipboard.writeText(text);
    toast.success('Copied');
  };

  return (
    <DocCallout title="How do I point my domain here?">
      <p>
        Create this record at your DNS provider (Cloudflare, Namecheap, GoDaddy, …) for{' '}
        <span className="text-foreground break-all font-mono">{host}</span>:
      </p>
      <div className="min-w-0 overflow-x-auto">
        <table className="w-full min-w-105 text-left">
          <thead className="text-muted-foreground font-mono text-[10.5px] uppercase tracking-wide">
            <tr>
              <th className="py-1 pr-4">Type</th>
              <th className="py-1 pr-4">Name / Host</th>
              <th className="py-1 pr-4">Value / Points to</th>
              <th className="py-1">TTL</th>
            </tr>
          </thead>
          <tbody className="text-foreground font-mono text-[12px]">
            <tr>
              <td className="py-1 pr-4">A</td>
              <td className="py-1 pr-4">{sub}</td>
              <td className="py-1 pr-4">
                <button
                  type="button"
                  onClick={() => serverIp && copy(serverIp)}
                  className="hover:text-phosphor inline-flex items-center gap-1.5 transition-colors"
                  title="Copy IP"
                >
                  {ip}
                  {serverIp && <Copy className="size-3" />}
                </button>
              </td>
              <td className="py-1">Auto / 300</td>
            </tr>
          </tbody>
        </table>
      </div>
      <DocBullets>
        <li>
          The value must be the public IP of the server this service is deployed to
          {serverIp ? '' : ' — assign a server first to see it here'}.
        </li>
        <li>
          Hosting many services on this server? Add a wildcard record instead (
          <span className="font-mono">*</span> → <span className="font-mono break-all">{ip}</span>) and every
          subdomain will just work.
        </li>
        <li>
          Using Cloudflare? Set the record to <b>DNS only</b> (grey cloud) until the first deploy
          completes, so the HTTPS certificate can be issued.
        </li>
        <li>
          HTTPS is automatic — a Let&apos;s Encrypt certificate is issued on the first request once DNS
          resolves. Propagation usually takes a few minutes.
        </li>
      </DocBullets>
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <span className="shrink-0">Verify:</span>
        <button
          type="button"
          onClick={() => copy(`dig +short ${host}`)}
          className="bg-secondary hover:text-phosphor inline-flex max-w-full items-center gap-1.5 rounded px-2 py-1 font-mono text-[11.5px] transition-colors"
          title="Copy command"
        >
          <span className="min-w-0 break-all">dig +short {host}</span>
          <Copy className="size-3 shrink-0" />
        </button>
        <span className="break-all">should print {ip}</span>
      </div>
    </DocCallout>
  );
}

/**
 * Wildcard-DNS guidance for preview deployments using the server wildcard domain.
 * FQDN pattern: `{shortCommitSha}.{wildcardHost}` e.g. `abc1234.preview.peon.sh`.
 */
function PreviewDnsGuide({
  serverIp,
  wildcardDomain,
}: {
  serverIp?: string | null;
  wildcardDomain?: string | null;
}) {
  const raw = wildcardDomain?.replace(/^https?:\/\//, '').replace(/^\*\./, '').split('/')[0] || null;
  const host = raw || 'preview.example.com';
  const exampleFqdn = `abc1234.${host}`;
  const ip = serverIp || '<your-server-ip>';

  const copy = (text: string) => {
    void navigator.clipboard.writeText(text);
    toast.success('Copied');
  };

  return (
    <DocCallout title="DNS setup for preview deployments (server wildcard)">
      <p>
        Previews use your <b>server wildcard domain</b>: each PR commit gets{' '}
        <span className="text-foreground font-mono">{exampleFqdn}</span>. Point a wildcard A record
        at this server:
      </p>
      <div className="min-w-0 overflow-x-auto">
        <table className="w-full min-w-105 text-left">
          <thead className="text-muted-foreground font-mono text-[10.5px] uppercase tracking-wide">
            <tr>
              <th className="py-1 pr-4">Type</th>
              <th className="py-1 pr-4">Name / Host</th>
              <th className="py-1 pr-4">Value / Points to</th>
              <th className="py-1">TTL</th>
            </tr>
          </thead>
          <tbody className="text-foreground font-mono text-[12px]">
            <tr>
              <td className="py-1 pr-4">A</td>
              <td className="py-1 pr-4">*.{host}</td>
              <td className="py-1 pr-4">
                <button
                  type="button"
                  onClick={() => serverIp && copy(serverIp)}
                  className="hover:text-phosphor inline-flex items-center gap-1.5 transition-colors"
                  title="Copy IP"
                >
                  {ip}
                  {serverIp && <Copy className="size-3" />}
                </button>
              </td>
              <td className="py-1">Auto / 300</td>
            </tr>
          </tbody>
        </table>
      </div>
      <DocBullets>
        <li>
          Set the same base on the server under <b>Wildcard domain</b> (e.g.{' '}
          <span className="font-mono">https://{host}</span>).
        </li>
        <li>
          Enable <b>Preview deployments</b> below. PRs targeting this service&apos;s branch get a
          sticky GitHub comment with build status and the preview URL.
        </li>
        <li>
          On Cloudflare, keep the wildcard record <b>DNS only</b> (grey cloud) so Let&apos;s Encrypt
          HTTP-01 works.
        </li>
        <li>Preview containers run alongside production — they never replace it.</li>
      </DocBullets>
      {!wildcardDomain && (
        <p className="text-warning mt-2 text-[12px]">
          This server has no wildcard domain yet — set one before enabling preview deployments.
        </p>
      )}
    </DocCallout>
  );
}

function Field({
  label,
  tooltip,
  children,
}: {
  label: string;
  tooltip?: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex min-w-0 items-center gap-1.5">
        <Label className="truncate">{label}</Label>
        {tooltip ? (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  className="text-muted-foreground hover:text-foreground shrink-0"
                  aria-label={`About ${label}`}
                >
                  <CircleHelp className="size-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-xs text-left leading-relaxed">
                {tooltip}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        ) : null}
      </div>
      {children}
    </div>
  );
}

function ToggleField({
  label,
  tooltip,
  checked,
  onCheckedChange,
}: {
  label: string;
  tooltip?: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <div className="border-border-bright flex h-10 items-center justify-between gap-4 rounded-md border px-3">
      <div className="flex min-w-0 items-center gap-1.5">
        <Label className="truncate">{label}</Label>
        {tooltip ? (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  className="text-muted-foreground hover:text-foreground shrink-0"
                  aria-label={`About ${label}`}
                >
                  <CircleHelp className="size-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-xs text-left leading-relaxed">
                {tooltip}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        ) : null}
      </div>
      <Switch className="shrink-0" checked={checked} onCheckedChange={onCheckedChange} />
    </div>
  );
}

function DomainsTab({
  svc,
  onSaved,
  onSettingsChanged,
}: {
  svc: ServiceDetail;
  onSaved: () => void;
  onSettingsChanged: () => void;
}) {
  const [form, setForm] = useState<Record<string, unknown>>({});
  const set = (k: string, v: unknown) => setForm((f) => ({ ...f, [k]: v }));
  const val = <T,>(k: keyof ServiceDetail, fallback: T): T =>
    (form[k as string] as T) ?? ((svc[k] as T) ?? fallback);
  const settingVal = <T,>(k: keyof NonNullable<ServiceDetail['settings']>, fallback: T): T =>
    (form[k as string] as T) ?? ((svc.settings?.[k] as T) ?? fallback);

  const saveMut = useMutation({
    mutationFn: () => updateService(svc.id, form),
    onSuccess: async () => {
      setForm({});
      onSaved();
      toast.success('Saved');
      onSettingsChanged();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed'),
  });

  const dirty = Object.keys(form).length > 0;

  return (
    <div className="space-y-4">
      <Panel
        id="domains"
        title="domains"
        contentClassName="space-y-3 p-4"
        footer={
          <Button size="sm" onClick={() => saveMut.mutate()} disabled={!dirty || saveMut.isPending}>
            Save
          </Button>
        }
      >
        <DomainsField
          serviceId={svc.id}
          value={val('fqdn', '') ?? ''}
          onChange={(v) => set('fqdn', v)}
        />
        <DnsGuide serverIp={svc.server?.ip} domain={parseDomains(val('fqdn', '') ?? '')[0]} />
        <div className="grid gap-3 md:grid-cols-3">
          <ToggleField
            label="Force HTTPS"
            checked={settingVal('isForceHttpsEnabled', true)}
            onCheckedChange={(c) => set('isForceHttpsEnabled', c)}
          />
          <ToggleField
            label="Gzip compression"
            checked={settingVal('isGzipEnabled', true)}
            onCheckedChange={(c) => set('isGzipEnabled', c)}
          />
          <ToggleField
            label="Strip prefix"
            checked={settingVal('isStripprefixEnabled', false)}
            onCheckedChange={(c) => set('isStripprefixEnabled', c)}
          />
        </div>
      </Panel>
    </div>
  );
}

function EnvironmentTab({
  serviceId,
  projectId,
  onSettingsChanged,
}: {
  serviceId: string;
  projectId: string;
  onSettingsChanged: () => void;
}) {
  const qc = useQueryClient();
  const { data: vars } = useQuery({ queryKey: ['env', serviceId], queryFn: () => listEnv(serviceId) });
  const { data: project } = useQuery({
    queryKey: ['project', projectId],
    queryFn: () => getProject(projectId),
  });
  const access = useCurrentWorkspaceAccess({
    projectCanManage: project?.canManage,
  });
  // Manage requires project role + active plan. Gate before reveal/write API calls.
  const canWrite = !access.blocked && project?.canManage === true;

  const invalidate = () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: ['env', serviceId] }),
      qc.invalidateQueries({ queryKey: ['env-revealed', serviceId] }),
    ]);

  const delMut = useMutation({
    mutationFn: (id: string) => deleteEnv(serviceId, id),
    onSuccess: async () => {
      await invalidate();
      onSettingsChanged();
    },
  });

  const importMut = useMutation({
    mutationFn: () => importPreviewEnvFromProduction(serviceId),
    onSuccess: async (res) => {
      await invalidate();
      onSettingsChanged();
      toast.success(
        res.imported
          ? `Imported ${res.imported} production variable${res.imported === 1 ? '' : 's'} into preview`
          : 'No production variables to import',
      );
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Import failed'),
  });

  const productionVars = (vars ?? []).filter((v) => !v.isPreview);
  const previewVars = (vars ?? []).filter((v) => v.isPreview);

  const onChanged = () => {
    void invalidate();
    onSettingsChanged();
  };

  return (
    <div className="space-y-4">
      {access.blocked ? <AccessGateBanner reason={access.block} /> : null}
      <EnvSection
        title="production"
        description="Used only by production deploys. The same key can exist in Preview with a different value."
        serviceId={serviceId}
        isPreview={false}
        vars={productionVars}
        canWrite={canWrite}
        onChanged={onChanged}
        onDelete={(id) => delMut.mutate(id)}
      />

      <EnvSection
        title="preview"
        description="Used only by PR preview deploys. Import from production to copy keys, then change values as needed."
        serviceId={serviceId}
        isPreview
        vars={previewVars}
        canWrite={canWrite}
        onChanged={onChanged}
        onDelete={(id) => delMut.mutate(id)}
        headerExtra={
          <ConfirmButton
            onConfirm={() => importMut.mutate()}
            title="Import from production?"
            description="Copies all production variables into the preview set and overwrites any matching preview keys. Preview deployments only use the preview set — import if you want production values as a starting point. Preview-only keys that don’t exist in production are kept."
            confirmLabel="Import"
            variant="outline"
            confirmVariant="default"
            disabled={!canWrite || importMut.isPending || productionVars.length === 0}
          >
            Import from production
          </ConfirmButton>
        }
      />
    </div>
  );
}

function EnvSection({
  title,
  description,
  serviceId,
  isPreview,
  vars,
  canWrite,
  onChanged,
  onDelete,
  headerExtra,
}: {
  title: string;
  description: string;
  serviceId: string;
  isPreview: boolean;
  vars: Array<{
    id: string;
    key: string;
    value: string;
    isPreview: boolean;
    isBuildtime: boolean;
    isRuntime: boolean;
  }>;
  canWrite: boolean;
  onChanged: () => void;
  onDelete: (id: string) => void;
  headerExtra?: ReactNode;
}) {
  const [devMode, setDevMode] = useState(false);
  const [key, setKey] = useState('');
  const [value, setValue] = useState('');
  const [isBuildtime, setIsBuildtime] = useState(true);
  const [isRuntime, setIsRuntime] = useState(true);
  const switchId = `dev-mode-${isPreview ? 'preview' : 'production'}`;

  const developerModeToggle = (
    <div className="flex shrink-0 items-center gap-2">
      <Label htmlFor={switchId} className="text-muted-foreground text-[12px] font-normal tracking-normal">
        Developer mode
      </Label>
      <Switch
        id={switchId}
        checked={devMode && canWrite}
        disabled={!canWrite}
        onCheckedChange={(checked) => {
          if (!canWrite) return;
          setDevMode(checked);
        }}
      />
    </div>
  );

  const headerActions = (
    <div className="flex flex-wrap items-center justify-end gap-2">
      {headerExtra}
      {developerModeToggle}
    </div>
  );

  const addMut = useMutation({
    mutationFn: () =>
      upsertEnv(serviceId, { key, value, isBuildtime, isRuntime, isPreview }),
    onSuccess: async () => {
      setKey('');
      setValue('');
      toast.success('Saved');
      onChanged();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed'),
  });

  if (devMode && canWrite) {
    return (
      <EnvDeveloperEditor
        title={title}
        serviceId={serviceId}
        isPreview={isPreview}
        canWrite={canWrite}
        actions={headerActions}
        onSaved={onChanged}
      />
    );
  }

  return (
    <div className="space-y-3">
      <Panel
        title={title}
        actions={headerActions}
        contentClassName="space-y-3 p-4"
        footer={
          <Button
            size="sm"
            onClick={() => addMut.mutate()}
            disabled={!canWrite || !key || addMut.isPending}
          >
            Add {isPreview ? 'preview' : 'production'} variable
          </Button>
        }
      >
        <p className="text-muted-foreground text-[12px]">{description}</p>
        <div className="flex gap-2">
          <Input
            placeholder="KEY"
            value={key}
            disabled={!canWrite}
            onChange={(e) => setKey(e.target.value)}
          />
          <Input
            placeholder="value"
            value={value}
            disabled={!canWrite}
            onChange={(e) => setValue(e.target.value)}
          />
        </div>
        <div className="flex flex-wrap items-center gap-4 text-sm">
          <label className="flex items-center gap-2">
            <Switch checked={isBuildtime} disabled={!canWrite} onCheckedChange={setIsBuildtime} /> Build
          </label>
          <label className="flex items-center gap-2">
            <Switch checked={isRuntime} disabled={!canWrite} onCheckedChange={setIsRuntime} /> Runtime
          </label>
        </div>
      </Panel>

      <Panel contentClassName="divide-y">
        {vars.length ? (
          vars.map((v) => (
            <EnvRow
              key={v.id}
              serviceId={serviceId}
              env={v}
              canWrite={canWrite}
              showPreviewBadge={false}
              onChanged={onChanged}
              onDelete={() => onDelete(v.id)}
            />
          ))
        ) : (
          <div className="text-muted-foreground p-6 text-center text-[12.5px]">
            no {isPreview ? 'preview' : 'production'} variables.
          </div>
        )}
      </Panel>
    </div>
  );
}

/** Vercel-style inline row: masked at rest, expands into an editable form. */
function EnvRow({
  serviceId,
  env,
  canWrite,
  onChanged,
  onDelete,
  showPreviewBadge = true,
}: {
  serviceId: string;
  env: { id: string; key: string; value: string; isPreview: boolean; isBuildtime: boolean; isRuntime: boolean };
  canWrite: boolean;
  onChanged: () => void;
  onDelete: () => void;
  showPreviewBadge?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<{ value: string; isBuildtime: boolean; isRuntime: boolean } | null>(null);

  // Fetch decrypted values only while a row is being edited (and writes are allowed).
  const {
    data: revealed,
    isLoading: revealLoading,
  } = useQuery({
    queryKey: ['env-revealed', serviceId],
    queryFn: () => listEnv(serviceId, true),
    enabled: editing && canWrite,
  });
  const revealedValue = revealed?.find((r) => r.id === env.id)?.value;
  // Derive the edit state lazily from the revealed value; `form` only holds
  // user modifications, avoiding a setState-in-effect.
  const effective =
    form ??
    (revealedValue !== undefined
      ? { value: revealedValue, isBuildtime: env.isBuildtime, isRuntime: env.isRuntime }
      : null);

  const saveMut = useMutation({
    mutationFn: () =>
      upsertEnv(serviceId, {
        key: env.key,
        value: effective?.value ?? '',
        isPreview: env.isPreview,
        isBuildtime: effective?.isBuildtime ?? env.isBuildtime,
        isRuntime: effective?.isRuntime ?? env.isRuntime,
      }),
    onSuccess: () => {
      setEditing(false);
      setForm(null);
      onChanged();
      toast.success('Variable saved');
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed'),
  });

  if (editing && canWrite) {
    return (
      <div className="space-y-3 px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="font-mono text-[12.5px] font-medium">{env.key}</span>
          {showPreviewBadge && env.isPreview && <Badge variant="outline">preview</Badge>}
        </div>
        <Input
          className="font-mono"
          value={effective?.value ?? ''}
          placeholder={revealLoading || effective === null ? 'loading value…' : ''}
          disabled={revealLoading || effective === null}
          onChange={(e) => effective && setForm({ ...effective, value: e.target.value })}
        />
        <div className="flex flex-wrap items-center gap-4 text-[12px]">
          <label className="flex items-center gap-2">
            <Switch
              checked={effective?.isBuildtime ?? env.isBuildtime}
              onCheckedChange={(c) => effective && setForm({ ...effective, isBuildtime: c })}
            />
            Build
          </label>
          <label className="flex items-center gap-2">
            <Switch
              checked={effective?.isRuntime ?? env.isRuntime}
              onCheckedChange={(c) => effective && setForm({ ...effective, isRuntime: c })}
            />
            Runtime
          </label>
          <div className="ml-auto flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={() => { setEditing(false); setForm(null); }}>
              Cancel
            </Button>
            <Button size="sm" onClick={() => saveMut.mutate()} disabled={effective === null || saveMut.isPending}>
              Save
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="hover:bg-secondary flex min-w-0 items-center justify-between gap-4 px-4 py-3 text-[12.5px] transition-colors">
      <div className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden">
        <span className="shrink-0 font-mono font-medium">{env.key}</span>
        <span className="text-muted-foreground min-w-0 truncate font-mono">{env.value}</span>
        {showPreviewBadge && env.isPreview && <Badge variant="outline">preview</Badge>}
        {env.isBuildtime && <Badge variant="secondary">build</Badge>}
        {env.isRuntime && <Badge variant="secondary">runtime</Badge>}
      </div>
      {canWrite ? (
        <div className="flex shrink-0 items-center gap-1.5">
          <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
            Edit
          </Button>
          <ConfirmButton
            onConfirm={onDelete}
            title={`Delete ${env.key}?`}
            description="The variable will be removed from this service. A redeploy is required to apply."
          >
            <Trash2 className="size-4" /> Delete
          </ConfirmButton>
        </div>
      ) : null}
    </div>
  );
}

/**
 * Developer mode: the production or preview variable set as an editable
 * .env document. Saving replaces that set (missing keys are removed).
 */
function EnvDeveloperEditor({
  title,
  serviceId,
  isPreview,
  canWrite,
  onSaved,
  actions,
}: {
  title: string;
  serviceId: string;
  isPreview: boolean;
  canWrite: boolean;
  onSaved: () => void;
  actions?: ReactNode;
}) {
  const [raw, setRaw] = useState<string | null>(null);
  const { data: revealed } = useQuery({
    queryKey: ['env-revealed', serviceId],
    queryFn: () => listEnv(serviceId, true),
    enabled: canWrite,
  });

  // Derive the initial document from the revealed vars; `raw` only holds
  // user edits, avoiding a setState-in-effect.
  const doc =
    raw ??
    (revealed
      ? revealed
          .filter((v) => v.isPreview === isPreview)
          .map((v) => `${v.key}=${v.value}`)
          .join('\n')
      : null);

  const saveMut = useMutation({
    mutationFn: () => bulkSaveEnv(serviceId, doc ?? '', isPreview),
    onSuccess: (res) => {
      setRaw(null);
      onSaved();
      toast.success(`Saved ${res.saved} variable${res.saved === 1 ? '' : 's'}${res.deleted ? `, removed ${res.deleted}` : ''}`);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed'),
  });

  return (
    <Panel
      title={title}
      actions={actions}
      contentClassName="space-y-2 p-4"
      footer={
        <Button
          size="sm"
          onClick={() => saveMut.mutate()}
          disabled={!canWrite || doc === null || saveMut.isPending}
        >
          Save all
        </Button>
      }
    >
      <p className="text-muted-foreground text-[11.5px]">
        Edit {isPreview ? 'preview' : 'production'} variables as one .env document (KEY=value per line, #
        comments ignored). Saving replaces this set — variables removed here are deleted.
      </p>
      <Textarea
        className="max-h-[60vh] min-h-72 overflow-y-auto font-mono text-[12px] break-all [field-sizing:fixed]"
        value={doc ?? ''}
        placeholder={doc === null ? 'loading variables…' : 'KEY=value'}
        disabled={!canWrite || doc === null}
        onChange={(e) => setRaw(e.target.value)}
        spellCheck={false}
      />
    </Panel>
  );
}

function StorageTab({ serviceId }: { serviceId: string }) {
  const qc = useQueryClient();
  const { data: volumes } = useQuery({
    queryKey: ['volumes', serviceId],
    queryFn: () => listVolumes(serviceId),
  });
  const [name, setName] = useState('');
  const [mountPath, setMountPath] = useState('');
  const invalidate = () => qc.invalidateQueries({ queryKey: ['volumes', serviceId] });

  const addMut = useMutation({
    mutationFn: () => createVolume(serviceId, { name, mountPath }),
    onSuccess: async () => {
      await invalidate();
      setName('');
      setMountPath('');
      toast.success('Volume added');
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed'),
  });
  const delMut = useMutation({
    mutationFn: (id: string) => deleteVolume(serviceId, id),
    onSuccess: invalidate,
  });

  return (
    <div className="space-y-4">
      <Panel
        title="add persistent volume"
        contentClassName="flex gap-2 p-4"
        footer={
          <Button size="sm" onClick={() => addMut.mutate()} disabled={!name || !mountPath || addMut.isPending}>
            Add volume
          </Button>
        }
      >
          <Input placeholder="name" value={name} onChange={(e) => setName(e.target.value)} />
          <Input placeholder="/data" value={mountPath} onChange={(e) => setMountPath(e.target.value)} />
      </Panel>
      <Panel contentClassName="divide-y">
        {volumes?.length ? (
          volumes.map((v) => (
            <div key={v.id} className="hover:bg-secondary flex items-center justify-between gap-4 px-4 py-3 text-[12.5px] transition-colors">
              <span className="font-mono">
                {v.name} → {v.mountPath}
              </span>
              <ConfirmButton
                onConfirm={() => delMut.mutate(v.id)}
                title={`Delete volume ${v.name}?`}
                description="The volume mapping is removed from the service configuration. Data on the server is not deleted automatically."
              >
                <Trash2 className="size-4" /> Delete
              </ConfirmButton>
            </div>
          ))
        ) : (
          <div className="text-muted-foreground p-6 text-center text-[12.5px]">no volumes.</div>
        )}
      </Panel>
    </div>
  );
}

function DeploymentsTab({
  serviceId,
  projectId,
  onDeploy,
  onForceDeploy,
}: {
  serviceId: string;
  projectId: string;
  onDeploy: () => void;
  onForceDeploy: () => void;
}) {
  const qc = useQueryClient();
  const { data: deployments } = useQuery({
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

  return (
    <div className="space-y-4">
      <Panel
        title="deployments"
        actions={
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button
              variant="outline"
              onClick={onForceDeploy}
              title="Clear cached source and rebuild without Docker/Nixpacks cache"
            >
              <RefreshCw className="size-3.5" /> Force rebuild
            </Button>
            <Button onClick={onDeploy}>Deploy now</Button>
          </div>
        }
        contentClassName="divide-y"
      >
        {deployments?.length ? (
          deployments.map((d: DeploymentListItem) => {
            const preview =
              d.isPreview && d.pullRequestId != null
                ? previewByPr.get(d.pullRequestId)
                : undefined;
            return (
              <div
                key={d.id}
                className="hover:bg-secondary/50 flex items-center justify-between gap-4 px-4 py-3 transition-colors"
              >
                <Link
                  href={`/projects/${projectId}/services/${serviceId}/deployments/${d.id}`}
                  className="flex min-w-0 flex-1 items-center gap-2 text-sm"
                >
                  <StatusBadge status={d.status} />
                  {d.isPreview && (
                    <Badge variant="outline" className="shrink-0 text-[10px]">
                      preview{d.pullRequestId != null ? ` #${d.pullRequestId}` : ''}
                    </Badge>
                  )}
                  <span className="text-muted-foreground font-mono text-xs">
                    {d.commitSha ? d.commitSha.slice(0, 7) : d.uuid.slice(0, 7)}
                  </span>
                  {d.commitMessage && (
                    <span className="text-foreground max-w-72 truncate text-xs">
                      {d.commitMessage}
                    </span>
                  )}
                  <span className="text-muted-foreground text-xs">
                    <LocalDateTime value={d.createdAt} />
                  </span>
                </Link>
                <div className="flex shrink-0 gap-2">
                  {d.previewUrl && (
                    <Button asChild size="sm" variant="ghost">
                      <a href={d.previewUrl} target="_blank" rel="noopener noreferrer" title={d.previewUrl}>
                        <ExternalLink className="size-3.5" /> Open
                      </a>
                    </Button>
                  )}
                  <Button asChild size="sm" variant="ghost">
                    <Link href={`/projects/${projectId}/services/${serviceId}/deployments/${d.id}`}>
                      View
                    </Link>
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
                </div>
              </div>
            );
          })
        ) : (
          <div className="text-muted-foreground p-6 text-center text-[12.5px]">no deployments yet.</div>
        )}
      </Panel>

      <Panel title="preview deployments" contentClassName="divide-y px-4">
        {previewPanelRows.length ? (
          previewPanelRows.map((p) => {
            const href = p.fqdn
              ? p.fqdn.startsWith('http')
                ? p.fqdn
                : `https://${p.fqdn}`
              : null;
            return (
              <div key={p.key} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                  <Badge variant="outline" className="text-[10px]">
                    preview #{p.pullRequestId}
                  </Badge>
                  {href ? (
                    <a
                      href={href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-phosphor hover:underline inline-flex min-w-0 items-center gap-1 truncate font-mono text-[12px]"
                      title={href}
                    >
                      <ExternalLink className="size-3 shrink-0" />
                      <span className="truncate">{href.replace(/^https?:\/\//, '')}</span>
                    </a>
                  ) : (
                    <span className="text-muted-foreground text-[12px]">no URL yet</span>
                  )}
                </span>
                <div className="flex shrink-0 items-center gap-2">
                  <StatusBadge status={p.status} />
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
                </div>
              </div>
            );
          })
        ) : (
          <div className="text-muted-foreground py-6 text-center text-[12.5px]">
            No active preview environments. Enable Preview deployments in Configuration, then open a
            PR against this service&apos;s branch.
          </div>
        )}
      </Panel>
    </div>
  );
}

/**
 * Renders the declarative service-specific configuration (database
 * credentials / marketplace app fields) resolved by the backend. Sections and
 * fields are data-driven - see src/lib/service-config.
 */
function ServiceConfigPanel({
  serviceId,
  onSaved,
  onSettingsChanged,
}: {
  serviceId: string;
  onSaved: () => void;
  onSettingsChanged: () => void;
}) {
  const qc = useQueryClient();
  const [form, setForm] = useState<Record<string, string>>({});
  const { data } = useQuery({
    queryKey: ['service-config', serviceId],
    queryFn: () => getServiceConfig(serviceId),
  });

  const saveMut = useMutation({
    mutationFn: () => updateServiceConfig(serviceId, form),
    onSuccess: async () => {
      setForm({});
      await qc.invalidateQueries({ queryKey: ['service-config', serviceId] });
      onSaved();
      toast.success('Configuration saved');
      onSettingsChanged();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed'),
  });

  if (!data || data.sections.length === 0) return null;
  const dirty = Object.keys(form).length > 0;

  return (
    <>
      {data.sections.map((section) => (
        <Panel
          key={section.id}
          title={section.title}
          contentClassName="space-y-3 p-4"
          footer={
            section.fields.some((f) => !f.readonly) ? (
              <Button size="sm" onClick={() => saveMut.mutate()} disabled={!dirty || saveMut.isPending}>
                Save
              </Button>
            ) : undefined
          }
        >
          <div className="grid gap-3 md:grid-cols-2">
            {section.fields.map((field) => (
              <ConfigFieldInput
                key={field.key}
                field={field}
                value={form[field.key] ?? data.values[field.key] ?? ''}
                onChange={(v) => setForm((f) => ({ ...f, [field.key]: v }))}
              />
            ))}
          </div>
        </Panel>
      ))}
    </>
  );
}

function ConfigFieldInput({
  field,
  value,
  onChange,
}: {
  field: ServiceConfigField;
  value: string;
  onChange: (v: string) => void;
}) {
  const [revealed, setRevealed] = useState(false);
  const masked = field.isPassword && !revealed;

  return (
    <div className={`space-y-1.5 ${field.readonly ? 'md:col-span-2' : ''}`}>
      <Label>
        {field.label}
        {field.required && !field.readonly && <span className="text-destructive"> *</span>}
      </Label>
      <div className="flex min-w-0 items-center gap-1.5">
        <Input
          className="min-w-0 flex-1 font-mono"
          type={masked ? 'password' : 'text'}
          value={value}
          readOnly={field.readonly}
          onChange={(e) => onChange(e.target.value)}
        />
        {field.isPassword && (
          <Button variant="ghost" size="sm" className="shrink-0 px-2" onClick={() => setRevealed(!revealed)}>
            {revealed ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
          </Button>
        )}
        {field.readonly && (
          <Button
            variant="ghost"
            size="sm"
            className="shrink-0 px-2"
            onClick={() => {
              void navigator.clipboard.writeText(value);
              toast.success('Copied');
            }}
          >
            <Copy className="size-3.5" />
          </Button>
        )}
      </div>
      {field.helper && <p className="text-muted-foreground text-[11px]">{field.helper}</p>}
    </div>
  );
}

function TasksTab({ serviceId }: { serviceId: string }) {
  const qc = useQueryClient();
  const { data: tasks } = useQuery({
    queryKey: ['tasks', serviceId],
    queryFn: () => listTasks(serviceId),
    refetchInterval: 10_000,
  });
  const [name, setName] = useState('');
  const [command, setCommand] = useState('');
  const [frequency, setFrequency] = useState('0 0 * * *');
  const invalidate = () => qc.invalidateQueries({ queryKey: ['tasks', serviceId] });

  const addMut = useMutation({
    mutationFn: () => createTask(serviceId, { name, command, frequency }),
    onSuccess: async () => {
      await invalidate();
      setName('');
      setCommand('');
      toast.success('Task created');
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed'),
  });
  return (
    <div className="space-y-4">
      <Panel
        title="new scheduled task"
        contentClassName="space-y-3 p-4"
        footer={
          <Button size="sm" onClick={() => addMut.mutate()} disabled={!name || !command || !frequency || addMut.isPending}>
            Add task
          </Button>
        }
      >
        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="task-name">Name</Label>
            <Input id="task-name" placeholder="cleanup-cache" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="task-freq">Frequency (cron)</Label>
            <Input
              id="task-freq"
              className="font-mono"
              placeholder="0 0 * * *"
              value={frequency}
              onChange={(e) => setFrequency(e.target.value)}
            />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="task-cmd">Command (runs inside the container)</Label>
          <Input
            id="task-cmd"
            className="font-mono"
            placeholder="pnpm run scheduler:clean"
            value={command}
            onChange={(e) => setCommand(e.target.value)}
          />
        </div>
      </Panel>

      {tasks?.length ? (
        tasks.map((t) => <TaskEditor key={t.id} serviceId={serviceId} task={t} />)
      ) : (
        <Panel contentClassName="p-6">
          <div className="text-muted-foreground text-center text-[12.5px]">
            no scheduled tasks. add one above - it runs inside the service container on a cron schedule.
          </div>
        </Panel>
      )}
    </div>
  );
}

function TaskEditor({ serviceId, task }: { serviceId: string; task: ScheduledTaskItem }) {
  const qc = useQueryClient();
  const [form, setForm] = useState<Record<string, unknown>>({});
  const set = (k: string, v: unknown) => setForm((f) => ({ ...f, [k]: v }));
  const val = <T,>(k: keyof ScheduledTaskItem, fallback: T): T =>
    (form[k as string] as T) ?? ((task[k] as T) ?? fallback);
  const dirty = Object.keys(form).length > 0;
  const invalidate = () => qc.invalidateQueries({ queryKey: ['tasks', serviceId] });

  const saveMut = useMutation({
    mutationFn: () => updateTask(serviceId, task.id, form),
    onSuccess: async () => {
      await invalidate();
      setForm({});
      toast.success('Task saved');
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed'),
  });
  const toggleMut = useMutation({
    mutationFn: () => updateTask(serviceId, task.id, { enabled: !task.enabled }),
    onSuccess: invalidate,
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed'),
  });
  const runMut = useMutation({
    mutationFn: () => runTask(serviceId, task.id),
    onSuccess: async () => {
      await invalidate();
      toast.success('Task queued - check executions shortly');
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed'),
  });
  const delMut = useMutation({
    mutationFn: () => deleteTask(serviceId, task.id),
    onSuccess: invalidate,
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed'),
  });

  return (
    <Panel
      title={
        <span className="inline-flex items-center gap-2">
          {task.name}
          {!task.enabled && <Badge variant="outline" className="text-[10px]">disabled</Badge>}
        </span>
      }
      contentClassName="space-y-4 p-4"
      footer={
        <>
          <ConfirmButton
            onConfirm={() => delMut.mutate()}
            title={`Delete task "${task.name}"?`}
            description="The schedule and its execution history will be permanently removed."
            disabled={delMut.isPending}
            className="mr-auto"
          >
            <Trash2 className="size-3.5" /> Delete
          </ConfirmButton>
          <Button size="sm" variant="outline" onClick={() => toggleMut.mutate()} disabled={toggleMut.isPending}>
            {task.enabled ? 'Disable task' : 'Enable task'}
          </Button>
          <Button size="sm" variant="outline" onClick={() => runMut.mutate()} disabled={runMut.isPending}>
            <Play className="size-3.5" /> Execute now
          </Button>
          <Button size="sm" onClick={() => saveMut.mutate()} disabled={!dirty || saveMut.isPending}>
            Save
          </Button>
        </>
      }
    >
      <div className="grid gap-3 md:grid-cols-4">
        <div className="space-y-1.5">
          <Label>Name</Label>
          <Input value={val('name', '')} onChange={(e) => set('name', e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>Frequency (cron)</Label>
          <Input
            className="font-mono"
            value={val('frequency', '')}
            onChange={(e) => set('frequency', e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label>Timeout (seconds)</Label>
          <Input
            type="number"
            value={String(val('timeout', 300))}
            onChange={(e) => set('timeout', Number(e.target.value) || 300)}
          />
        </div>
        <div className="space-y-1.5">
          <Label>Container name</Label>
          <Input
            placeholder="defaults to the service container"
            value={val('container', '') ?? ''}
            onChange={(e) => set('container', e.target.value || null)}
          />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label>Command</Label>
        <Input
          className="font-mono"
          value={val('command', '')}
          onChange={(e) => set('command', e.target.value)}
        />
      </div>

      <TaskExecutions serviceId={serviceId} task={task} />
    </Panel>
  );
}

function TaskExecutions({ serviceId, task }: { serviceId: string; task: ScheduledTaskItem }) {
  const [open, setOpen] = useState(false);
  const { data: executions } = useQuery({
    queryKey: ['task-executions', task.id],
    queryFn: () => listTaskExecutions(serviceId, task.id),
    enabled: open,
    refetchInterval: open ? 5000 : false,
  });
  const last = task.executions[0];

  return (
    <div className="text-[11px]">
      <button onClick={() => setOpen(!open)} className="text-muted-foreground hover:text-foreground transition-colors">
        {task._count.executions} execution{task._count.executions === 1 ? '' : 's'}
        {last ? ` · last: ${last.status.toLowerCase()} ${formatLocalDateTime(last.startedAt)}` : ''}
        {open ? ' ▲' : ' ▼'}
      </button>
      {open && (
        <div className="mt-2 space-y-2">
          {executions?.length ? (
            executions.map((e) => (
              <div
                key={e.id}
                className="border-border/60 bg-secondary/30 space-y-2 rounded-lg border px-3 py-2.5"
              >
                <div className="flex items-center justify-between gap-3">
                  <StatusBadge status={e.status} />
                  <span className="text-muted-foreground shrink-0 tabular-nums">
                    <LocalDateTime value={e.startedAt} />
                    {e.duration != null ? ` · ${(e.duration / 1000).toFixed(1)}s` : ''}
                  </span>
                </div>
                <RunOutput message={e.message} />
              </div>
            ))
          ) : (
            <div className="text-muted-foreground">no executions yet.</div>
          )}
        </div>
      )}
    </div>
  );
}

function BackupsTab({ serviceId }: { serviceId: string }) {
  const qc = useQueryClient();
  const workspaceId = useAuthStore((s) => s.currentWorkspaceId);
  const { data: backups } = useQuery({
    queryKey: ['backups', serviceId],
    queryFn: () => listBackups(serviceId),
    refetchInterval: 10_000,
  });
  const { data: storages } = useQuery({
    queryKey: ['storages', workspaceId],
    queryFn: () => listStorages(workspaceId!),
    enabled: !!workspaceId,
  });
  const [frequency, setFrequency] = useState('0 0 * * *');
  const [dumpAll, setDumpAll] = useState(true);
  const invalidate = () => qc.invalidateQueries({ queryKey: ['backups', serviceId] });

  const addMut = useMutation({
    mutationFn: () => createBackup(serviceId, { frequency, dumpAll }),
    onSuccess: async () => {
      await invalidate();
      toast.success('Backup schedule created');
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed'),
  });

  return (
    <div className="space-y-4">
      <Panel
        title="new backup schedule"
        contentClassName="space-y-3 p-4"
        footer={
          <Button size="sm" onClick={() => addMut.mutate()} disabled={!frequency || addMut.isPending}>
            Add backup schedule
          </Button>
        }
      >
        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="backup-freq">Frequency (cron)</Label>
            <Input
              id="backup-freq"
              className="font-mono"
              placeholder="0 0 * * *"
              value={frequency}
              onChange={(e) => setFrequency(e.target.value)}
            />
            <p className="text-muted-foreground text-[11px]">
              Logical dumps are stored on the server and can be downloaded or restored from previous runs.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label>Backup scope</Label>
            <div className="flex items-center gap-3 pt-1">
              <Switch checked={dumpAll} onCheckedChange={setDumpAll} id="backup-dump-all" />
              <Label htmlFor="backup-dump-all" className="font-normal text-[12.5px]">
                Entire instance (all databases)
              </Label>
            </div>
            <p className="text-muted-foreground text-[11px]">
              {dumpAll
                ? 'Uses pg_dumpall / --all-databases so every database in this service is included.'
                : 'Dumps only the configured database name for this service.'}
            </p>
          </div>
        </div>
      </Panel>

      {backups?.length ? (
        backups.map((b) => (
          <BackupEditor
            key={b.id}
            serviceId={serviceId}
            backup={b}
            storages={storages ?? []}
          />
        ))
      ) : (
        <Panel contentClassName="p-6">
          <div className="text-muted-foreground text-center text-[12.5px]">
            no backup schedules. add one above to protect this database.
          </div>
        </Panel>
      )}
    </div>
  );
}

function BackupEditor({
  serviceId,
  backup,
  storages,
}: {
  serviceId: string;
  backup: ScheduledBackupItem;
  storages: { id: string; name: string }[];
}) {
  const qc = useQueryClient();
  const [form, setForm] = useState<Record<string, unknown>>({});
  const set = (k: string, v: unknown) => setForm((f) => ({ ...f, [k]: v }));
  const val = <T,>(k: keyof ScheduledBackupItem, fallback: T): T =>
    (form[k as string] as T) ?? ((backup[k] as T) ?? fallback);
  const dirty = Object.keys(form).length > 0;
  const invalidate = () => qc.invalidateQueries({ queryKey: ['backups', serviceId] });

  const saveMut = useMutation({
    mutationFn: () => updateBackup(serviceId, backup.id, form),
    onSuccess: async () => {
      await invalidate();
      setForm({});
      toast.success('Backup schedule saved');
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed'),
  });
  const toggleMut = useMutation({
    mutationFn: () => updateBackup(serviceId, backup.id, { enabled: !backup.enabled }),
    onSuccess: invalidate,
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed'),
  });
  const runMut = useMutation({
    mutationFn: () => runBackupNow(serviceId, backup.id),
    onSuccess: async () => {
      await invalidate();
      await qc.invalidateQueries({ queryKey: ['backup-executions', backup.id] });
      toast.success('Backup queued - check executions shortly');
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed'),
  });
  const delMut = useMutation({
    mutationFn: () => deleteBackup(serviceId, backup.id),
    onSuccess: invalidate,
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed'),
  });

  const saveS3 = val('saveS3', false);
  const dumpAll = val('dumpAll', true);

  return (
    <Panel
      title={
        <span className="inline-flex items-center gap-2 font-mono">
          {backup.frequency}
          {!backup.enabled && <Badge variant="outline" className="text-[10px]">disabled</Badge>}
          {backup.dumpAll ? (
            <Badge variant="outline" className="text-[10px]">all dbs</Badge>
          ) : (
            <Badge variant="outline" className="text-[10px]">single db</Badge>
          )}
          {backup.saveS3 && <Badge variant="outline" className="text-[10px]">S3</Badge>}
        </span>
      }
      contentClassName="space-y-4 p-4"
      footer={
        <>
          <ConfirmButton
            onConfirm={() => delMut.mutate()}
            title="Delete backup schedule?"
            description="The schedule and its execution history will be removed. Existing dump files on the server are not deleted."
            disabled={delMut.isPending}
            className="mr-auto"
          >
            <Trash2 className="size-3.5" /> Delete
          </ConfirmButton>
          <Button size="sm" variant="outline" onClick={() => toggleMut.mutate()} disabled={toggleMut.isPending}>
            {backup.enabled ? 'Disable' : 'Enable'}
          </Button>
          <Button size="sm" variant="outline" onClick={() => runMut.mutate()} disabled={runMut.isPending}>
            <Play className="size-3.5" /> Backup now
          </Button>
          <Button size="sm" onClick={() => saveMut.mutate()} disabled={!dirty || saveMut.isPending}>
            Save
          </Button>
        </>
      }
    >
      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-1.5">
          <Label>Frequency (cron)</Label>
          <Input
            className="font-mono"
            value={val('frequency', '')}
            onChange={(e) => set('frequency', e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label>Local backups to keep</Label>
          <Input
            type="number"
            value={String(val('retentionAmountLocal', 7))}
            onChange={(e) => set('retentionAmountLocal', Number(e.target.value) || 0)}
          />
        </div>
        <div className="space-y-1.5">
          <Label>Entire instance</Label>
          <div className="flex items-center gap-3 pt-1">
            <Switch checked={dumpAll} onCheckedChange={(c) => set('dumpAll', c)} />
            <span className="text-muted-foreground text-[11px]">
              {dumpAll ? 'all databases' : 'configured DB only'}
            </span>
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>Upload to S3</Label>
          <div className="flex items-center gap-3 pt-1">
            <Switch checked={saveS3} onCheckedChange={(c) => set('saveS3', c)} />
            {saveS3 && (
              <SearchableSelect
                value={val('s3StorageId', '') ?? ''}
                onValueChange={(v) => set('s3StorageId', v)}
                placeholder="Select S3 storage"
                className="flex-1"
                options={storages.map((s) => ({ value: s.id, label: s.name }))}
              />
            )}
          </div>
          {saveS3 && storages.length === 0 && (
            <p className="text-muted-foreground text-[11px]">No S3 storages configured - add one under Storages.</p>
          )}
        </div>
      </div>

      <BackupExecutions serviceId={serviceId} backup={backup} />
    </Panel>
  );
}

function formatBackupSize(size: string | null): string | null {
  if (!size) return null;
  const n = Number(size);
  if (!Number.isFinite(n) || n < 0) return null;
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function BackupExecutions({ serviceId, backup }: { serviceId: string; backup: ScheduledBackupItem }) {
  const {
    data,
    isLoading,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
  } = useInfiniteQuery({
    queryKey: ['backup-executions', backup.id],
    queryFn: ({ pageParam }) =>
      listBackupExecutions(serviceId, backup.id, {
        limit: 5,
        cursor: pageParam,
      }),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
    refetchInterval: 5000,
  });

  const items = data?.pages.flatMap((p) => p.items) ?? [];

  const restoreMut = useMutation({
    mutationFn: (filename: string) => restoreBackup(serviceId, filename),
    onSuccess: () => toast.success('Restore queued - the worker will apply it shortly'),
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Restore failed'),
  });

  const downloadMut = useMutation({
    mutationFn: (filename: string) => downloadBackup(serviceId, filename),
    onSuccess: () => toast.success('Download started'),
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Download failed'),
  });

  return (
    <div className="space-y-2 text-[11px]">
      <div className="text-muted-foreground font-medium tracking-wide uppercase">
        Previous backups ({backup._count.executions})
      </div>
      <div className="space-y-1.5">
        {isLoading && items.length === 0 ? (
          <div className="text-muted-foreground">loading…</div>
        ) : items.length ? (
          <>
            {items.map((e) => (
              <div key={e.id} className="bg-secondary/50 rounded-md px-3 py-2">
                <div className="flex items-center justify-between gap-2">
                  <span className={e.status === 'SUCCESS' ? 'text-phosphor' : e.status === 'FAILED' ? 'text-destructive' : ''}>
                    {e.status.toLowerCase()}
                    {e.dumpAll ? ' · all dbs' : e.databaseName ? ` · ${e.databaseName}` : ''}
                    {e.s3Uploaded ? ' · s3' : ''}
                    {formatBackupSize(e.size) ? ` · ${formatBackupSize(e.size)}` : ''}
                  </span>
                  <span className="text-muted-foreground">
                    <LocalDateTime value={e.startedAt} />
                  </span>
                </div>
                {e.filename && (
                  <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
                    <span className="text-muted-foreground truncate font-mono text-[10.5px]">{e.filename}</span>
                    {e.status === 'SUCCESS' && (
                      <div className="flex items-center gap-1.5">
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={downloadMut.isPending}
                          onClick={() => downloadMut.mutate(e.filename!)}
                        >
                          <Download className="size-3.5" /> Download
                        </Button>
                        <ConfirmButton
                          onConfirm={() => restoreMut.mutate(e.filename!)}
                          title="Queue restore of this backup?"
                          description={
                            e.dumpAll
                              ? 'The restore will be queued and applied by the worker. All databases in this instance may be overwritten. This cannot be undone.'
                              : 'The restore will be queued and applied by the worker. Existing data in the database may be overwritten. This cannot be undone.'
                          }
                          confirmLabel="Queue restore"
                          variant="outline"
                          confirmVariant="default"
                          size="sm"
                          disabled={restoreMut.isPending}
                        >
                          Restore
                        </ConfirmButton>
                      </div>
                    )}
                  </div>
                )}
                {e.message && (
                  <pre className="text-muted-foreground mt-1 max-h-32 overflow-auto font-mono text-[10.5px] whitespace-pre-wrap">
                    {e.message}
                  </pre>
                )}
              </div>
            ))}
            {hasNextPage ? (
              <Button
                size="sm"
                variant="outline"
                className="w-full"
                disabled={isFetchingNextPage}
                onClick={() => void fetchNextPage()}
              >
                {isFetchingNextPage ? 'Loading…' : 'Load more'}
              </Button>
            ) : null}
          </>
        ) : (
          <div className="text-muted-foreground">no previous backups yet. run “Backup now” to create one.</div>
        )}
      </div>
    </div>
  );
}

function LogsTab({ serviceId }: { serviceId: string }) {
  const [tail, setTail] = useState(200);
  const [follow, setFollow] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  const { data, isFetching, refetch, error } = useQuery({
    queryKey: ['service-logs', serviceId, tail],
    queryFn: () => getServiceLogs(serviceId, tail),
    refetchInterval: follow ? 5000 : false,
  });

  useEffect(() => {
    if (follow) endRef.current?.scrollIntoView({ block: 'end' });
  }, [data, follow]);

  const downloadLogs = async () => {
    setDownloading(true);
    try {
      const full = await getServiceLogs(serviceId, 0);
      const blob = new Blob([full.lines.join('\n')], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${full.container || serviceId}-logs.txt`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to download logs');
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-44">
            <SearchableSelect
              value={String(tail)}
              onValueChange={(v) => setTail(Number(v))}
              placeholder="Select log lines"
              size="sm"
              options={[100, 200, 500, 1000, 2000].map((n) => ({
                value: String(n),
                label: `last ${n} lines`,
              }))}
            />
          </div>
          <label className="text-muted-foreground flex items-center gap-2 text-[12px]">
            <Switch checked={follow} onCheckedChange={setFollow} /> auto-refresh
          </label>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={downloadLogs} disabled={downloading}>
            <Download className="size-3.5" /> Download full logs
          </Button>
          <Button size="sm" variant="outline" onClick={() => refetch()} disabled={isFetching}>
            <RotateCw className={`size-3.5 ${isFetching ? 'animate-spin' : ''}`} /> Refresh
          </Button>
        </div>
      </div>

      <Panel
        title={data ? `container: ${data.container}` : 'logs'}
        contentClassName="bg-[#0a0f0c] flex min-h-0 flex-1 flex-col"
        className="flex min-h-0 flex-1 flex-col"
      >
        <div className="min-h-0 flex-1 overflow-auto p-4">
          <pre className="font-mono text-[11.5px] leading-relaxed whitespace-pre-wrap text-neutral-200">
            {error
              ? `Failed to fetch logs: ${error instanceof Error ? error.message : 'unknown error'}`
              : data?.lines.length
                ? data.lines.join('\n')
                : isFetching
                  ? 'Loading logs…'
                  : 'No log output. Is the container running?'}
          </pre>
          <div ref={endRef} />
        </div>
      </Panel>
    </div>
  );
}

function TerminalTab({ serviceId }: { serviceId: string }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <SshTerminal serviceId={serviceId} className="min-h-0 flex-1" />
    </div>
  );
}

function WebhooksTab({
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
      <DocCallout title="Independent deploy webhooks" defaultOpen>
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
        <DocBullets>
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
        </DocBullets>
      </DocCallout>

      <Panel
        title="deploy webhooks"
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
            <Button onClick={() => createMut.mutate()} disabled={createMut.isPending}>
              New webhook
            </Button>
          </div>
        }
        contentClassName="divide-y"
      >
        {webhooks?.length ? (
          webhooks.map((w) => (
            <div
              key={w.id}
              className="hover:bg-secondary flex min-w-0 items-center justify-between gap-4 px-4 py-3 text-[12.5px] transition-colors"
            >
              <div className="flex min-w-0 flex-1 flex-col gap-1 overflow-hidden">
                <span className="min-w-0 break-all font-mono text-xs">{webhookUrl(w.token)}</span>
                <span className="text-muted-foreground text-xs">
                  provider: {w.provider}
                  {w.provider !== 'generic' ? ' · use the path token as the webhook secret' : ''}
                </span>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => void copyUrl(w.token)}
                  title="Copy URL"
                >
                  <Copy className="size-3.5" />
                </Button>
                <ConfirmButton
                  onConfirm={() => delMut.mutate(w.id)}
                  title="Delete webhook?"
                  description="External systems calling this webhook URL will stop triggering deployments."
                >
                  <Trash2 className="size-4" /> Delete
                </ConfirmButton>
              </div>
            </div>
          ))
        ) : (
          <div className="text-muted-foreground p-6 text-center text-[12.5px]">
            No webhooks yet. Create one to get a deploy URL.
          </div>
        )}
      </Panel>
    </div>
  );
}

function DangerTab({
  serviceId,
  projectId,
  name,
}: {
  serviceId: string;
  projectId: string;
  name: string;
}) {
  const [confirm, setConfirm] = useState('');
  const delMut = useMutation({
    mutationFn: () => deleteService(serviceId),
    onSuccess: () => {
      toast.success('Service deleted');
      window.location.href = `/projects/${projectId}`;
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed'),
  });

  return (
    <Panel
      title={<span className="text-destructive">delete service</span>}
      className="border-destructive/40"
      contentClassName="space-y-3 p-4"
      footer={
        <ConfirmButton
          onConfirm={() => delMut.mutate()}
          title={`Delete service "${name}"?`}
          description={
            <div className="space-y-3">
              <p>
                This permanently deletes the service, its configuration, environment variables, and
                deployment history from Peon.
              </p>
              <p className="text-amber-700 dark:text-amber-400 font-medium">
                Stop the service first. Deleting does not stop or remove containers on the server —
                they will keep running until you stop the service (or clean them up manually).
              </p>
            </div>
          }
          confirmLabel="Delete permanently"
          size="sm"
          disabled={confirm !== name || delMut.isPending}
        >
          <Trash2 className="size-4" /> Delete permanently
        </ConfirmButton>
      }
    >
      <Alert className="border-amber-500/40 bg-amber-500/10 text-amber-950 dark:text-amber-50">
        <TriangleAlert />
        <AlertTitle>Stop the service first</AlertTitle>
        <AlertDescription className="text-amber-900/85 dark:text-amber-100/80">
          Deleting a service removes it from Peon only. Running containers on the server are not
          stopped. Stop the service before deleting it.
        </AlertDescription>
      </Alert>
      <p className="text-muted-foreground text-sm">
        This permanently deletes the service and its configuration. Type <b>{name}</b> to confirm.
      </p>
      <Input value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder={name} />
    </Panel>
  );
}
