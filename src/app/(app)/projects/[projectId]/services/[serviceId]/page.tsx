'use client';

import { Suspense, use, useEffect } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { type ServiceSectionId as SectionId } from '@/lib/service-sections';
import { deployService, controlService, type ServiceControlAction } from '@/services/api/service';
import { PageContainer, PageHeader } from '@/components/app/page';
import { KindChip } from '@/components/app/kind-chip';
import { StatusBadge } from '@/components/app/status-badge';
import {
  invalidateServiceQueries,
  patchServiceStatusInCache,
  useServiceDetail,
} from '@/lib/queries/service';
import { useRedeployNoticeStore } from '@/store/redeploy-notice';
import { OverviewSection } from '@/components/service/overview-section';
import { ServiceActions } from '@/components/service/service-actions';
import { ConfigurationSection } from '@/components/service/configuration-section';
import { DomainsSection } from '@/components/service/domains-section';
import { EnvironmentSection } from '@/components/service/environment-section';
import { StorageSection } from '@/components/service/storage-section';
import { DeploymentsSection } from '@/components/service/deployments-section';
import { TasksSection } from '@/components/service/tasks-section';
import { BackupsSection } from '@/components/service/backups-section';
import { LogsSection } from '@/components/service/logs-section';
import { TerminalSection } from '@/components/service/terminal-section';
import { WebhooksSection } from '@/components/service/webhooks-section';
import { DangerSection } from '@/components/service/danger-section';

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
        toast.success('Resume queued', {
          description:
            'If the image was cleaned up while suspended, Peon rebuilds the service automatically.',
        });
      } else {
        toast.success(`${action.charAt(0).toUpperCase()}${action.slice(1)} queued`);
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

  const header = (
    <PageHeader
      title={svc.name}
      description={
        <span className="flex items-center gap-2">
          <KindChip kind={svc.kind} />
          <StatusBadge status={svc.status} />
        </span>
      }
      actions={
        <ServiceActions
          svc={svc}
          onDeploy={() => deployMut.mutate({})}
          onForceDeploy={() => deployMut.mutate({ force: true })}
          onControl={(action) => controlMut.mutate(action)}
          busy={busy}
        />
      }
    />
  );

  const content = (
    <>
      {section === 'overview' && (
        <OverviewSection
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
        <ConfigurationSection svc={svc} onSaved={invalidate} onSettingsChanged={promptRedeploy} />
      )}
      {section === 'environment' && (
        <EnvironmentSection
          serviceId={serviceId}
          projectId={projectId}
          onSettingsChanged={promptRedeploy}
        />
      )}
      {section === 'domains' && svc.kind !== 'DATABASE' && (
        <DomainsSection svc={svc} onSaved={invalidate} onSettingsChanged={promptRedeploy} />
      )}
      {section === 'storage' && <StorageSection serviceId={serviceId} />}
      {section === 'tasks' && <TasksSection serviceId={serviceId} />}
      {section === 'backups' && <BackupsSection serviceId={serviceId} />}
      {section === 'deployments' && (
        <DeploymentsSection
          serviceId={serviceId}
          projectId={projectId}
          onDeploy={() => deployMut.mutate({})}
          onForceDeploy={() => deployMut.mutate({ force: true })}
        />
      )}
      {section === 'logs' && <LogsSection serviceId={serviceId} />}
      {section === 'terminal' && <TerminalSection serviceId={serviceId} />}
      {section === 'webhooks' && (
        <WebhooksSection serviceId={serviceId} gitBranch={svc.gitBranch} />
      )}
      {section === 'danger' && (
        <DangerSection serviceId={serviceId} projectId={projectId} name={svc.name} />
      )}
    </>
  );

  // Logs and terminal fill the viewport, so they skip PageContainer's spacing.
  if (isFullscreenSection) {
    return (
      <div className="flex min-h-[calc(100vh-7rem)] flex-col gap-4">
        {header}
        <div className="flex min-h-0 flex-1 flex-col">{content}</div>
      </div>
    );
  }

  return (
    <PageContainer>
      {header}
      <div className="min-w-0">{content}</div>
    </PageContainer>
  );
}
