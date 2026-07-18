'use client';

import Link from 'next/link';
import { Suspense, use } from 'react';
import { useSearchParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Boxes } from 'lucide-react';
import {
  getProject,
  getProjectMembers,
  removeProjectMember,
} from '@/services/api/project';
import {
  type ServiceKind,
  type ServiceListItem,
} from '@/services/api/service';
import { PageContainer, Panel, Section } from '@/components/app/page';
import { TemplateMarketplaceDialog } from '@/components/app/template-marketplace';
import { EmptyState } from '@/components/app/empty-state';
import { StatusBadge } from '@/components/app/status-badge';
import { KindChip } from '@/components/app/kind-chip';
import { ProjectMembersTab } from '@/components/app/project-members-tab';
import { ProjectSettingsTab } from '@/components/app/project-settings-tab';
import { NewServiceDialog } from '@/components/app/new-service-dialog';
import { useAuthStore } from '@/store/auth';
import { useProjectServices } from '@/lib/queries/service';

const KIND_LABELS: Record<ServiceKind, string> = {
  GIT_APP: 'Application (Git)',
  DOCKERFILE: 'Dockerfile',
  DOCKER_IMAGE: 'Docker Image',
  STATIC: 'Static Site',
  NIXPACKS: 'Nixpacks',
  DATABASE: 'Database',
  COMPOSE: 'Compose',
};

export default function ProjectDetailPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  return (
    <Suspense fallback={null}>
      <ProjectDetail_ params={params} />
    </Suspense>
  );
}

function ProjectDetail_({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = use(params);
  const qc = useQueryClient();
  const searchParams = useSearchParams();
  const workspaceId = useAuthStore((s) => s.currentWorkspaceId);
  const tab = searchParams.get('tab') ?? 'services';

  const { data } = useQuery({ queryKey: ['project', projectId], queryFn: () => getProject(projectId) });
  const { data: members } = useQuery({
    queryKey: ['project-members', projectId],
    queryFn: () => getProjectMembers(projectId),
    enabled: tab === 'members',
  });

  const removeMut = useMutation({
    mutationFn: (userId: string) => removeProjectMember(projectId, userId),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['project-members', projectId] });
      toast.success('Member removed');
    },
  });

  return (
    <PageContainer>
      {tab === 'services' && (
        <ServicesTab projectId={projectId} canManage={data?.canManage ?? false} />
      )}

      {tab === 'members' && (
        <ProjectMembersTab
          projectId={projectId}
          workspaceId={workspaceId!}
          canManage={data?.canManage ?? false}
          members={members ?? []}
          onRemove={(userId) => removeMut.mutate(userId)}
        />
      )}

      {tab === 'settings' &&
        (data?.project ? (
          <ProjectSettingsTab
            key={`${data.project.id}-${data.project.name}-${data.project.description ?? ''}`}
            project={data.project}
            canManage={data.canManage}
          />
        ) : (
          <div className="bg-accent h-40 animate-pulse rounded-lg" />
        ))}
    </PageContainer>
  );
}

function ServicesTab({ projectId, canManage }: { projectId: string; canManage: boolean }) {
  const { data: services, isLoading } = useProjectServices(projectId);

  return (
    <Section
      title="services"
      description="applications, databases, and compose stacks in this project"
      actions={
        canManage ? (
          <div className="flex items-center gap-2">
            <TemplateMarketplaceDialog projectId={projectId} />
            <NewServiceDialog projectId={projectId} />
          </div>
        ) : undefined
      }
    >
      {isLoading ? (
        <div className="bg-accent h-40 animate-pulse rounded-lg" />
      ) : services && services.length > 0 ? (
        <Panel title="services">
          <div className="divide-y">
            {services.map((svc: ServiceListItem) => (
              <Link
                key={svc.id}
                href={`/projects/${projectId}/services/${svc.id}`}
                className="hover:bg-secondary flex items-center justify-between gap-4 px-4 py-3 transition-colors"
              >
                <div className="min-w-0">
                  <div className="text-[12.5px] font-semibold">{svc.name}</div>
                  <div className="text-muted-foreground truncate text-[11px]">
                    {svc.description || KIND_LABELS[svc.kind]}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <KindChip kind={svc.kind} />
                  <StatusBadge status={svc.status} />
                </div>
              </Link>
            ))}
          </div>
        </Panel>
      ) : (
        <EmptyState
          icon={Boxes}
          title="No services yet"
          description="Create your first application, database, or compose stack in this project."
          action={
            canManage ? (
              <div className="flex items-center gap-2">
                <TemplateMarketplaceDialog projectId={projectId} />
                <NewServiceDialog projectId={projectId} />
              </div>
            ) : undefined
          }
        />
      )}
    </Section>
  );
}
