'use client';

import { Suspense, use, useEffect, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Boxes } from 'lucide-react';
import {
  getProject,
  getProjectMembers,
  removeProjectMember,
} from '@/services/api/project';
import { type ServiceListItem } from '@/services/api/service';
import { PageContainer, PageHeader } from '@/components/app/page';
import { DataTable } from '@/components/app/data-table';
import { LocalDateTime } from '@/components/app/local-datetime';
import { TemplateMarketplaceDialog } from '@/components/app/template-marketplace';
import { EmptyState } from '@/components/app/empty-state';
import { StatusBadge } from '@/components/app/status-badge';
import { KindChip } from '@/components/app/kind-chip';
import { ProjectMembersTab } from '@/components/app/project-members-tab';
import { ProjectSettingsTab } from '@/components/app/project-settings-tab';
import { NewServiceDialog } from '@/components/app/new-service-dialog';
import { useAuthStore } from '@/store/auth';
import { useProjectServices } from '@/lib/queries/service';

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
  const router = useRouter();
  const pathname = usePathname();
  // `?new=service` (from the setup wizard) opens the New service dialog once; captured on mount.
  const [newServiceOpen, setNewServiceOpen] = useState(() => searchParams.get('new') === 'service');

  const { data } = useQuery({ queryKey: ['project', projectId], queryFn: () => getProject(projectId) });
  const { data: members } = useQuery({
    queryKey: ['project-members', projectId],
    queryFn: () => getProjectMembers(projectId),
    enabled: tab === 'members',
  });

  // Strip `new` from the URL so a refresh does not reopen the dialog.
  useEffect(() => {
    if (searchParams.get('new') === null) return;
    const next = new URLSearchParams(searchParams.toString());
    next.delete('new');
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [searchParams, pathname, router]);

  const removeMut = useMutation({
    mutationFn: (userId: string) => removeProjectMember(projectId, userId),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['project-members', projectId] });
      toast.success('Member removed');
    },
  });

  return (
    <PageContainer>
      <PageHeader
        title={data?.project.name ?? 'Project'}
        description={data ? data.project.description || 'No description' : undefined}
        actions={
          tab === 'services' && data?.canManage ? (
            <>
              <TemplateMarketplaceDialog projectId={projectId} />
              <NewServiceDialog
                projectId={projectId}
                open={newServiceOpen}
                onOpenChange={setNewServiceOpen}
              />
            </>
          ) : undefined
        }
      />

      {tab === 'services' && <ServicesTab projectId={projectId} />}

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

function ServicesTab({ projectId }: { projectId: string }) {
  const { data: services, isLoading } = useProjectServices(projectId);

  return (
    <DataTable<ServiceListItem>
      columns={[
        {
          key: 'name',
          header: 'Name',
          cell: (svc) => (
            <span className="flex min-w-0 flex-col">
              <span className="truncate">{svc.name}</span>
              {svc.description ? (
                <span className="text-muted-foreground truncate text-sm font-normal">{svc.description}</span>
              ) : null}
            </span>
          ),
        },
        { key: 'kind', header: 'Kind', cell: (svc) => <KindChip kind={svc.kind} /> },
        { key: 'status', header: 'Status', cell: (svc) => <StatusBadge status={svc.status} /> },
        {
          key: 'updated',
          header: 'Created',
          cell: (svc) => <LocalDateTime value={svc.createdAt} />,
        },
      ]}
      rows={services ?? []}
      rowKey={(svc) => svc.id}
      rowHref={(svc) => `/projects/${projectId}/services/${svc.id}`}
      isLoading={isLoading}
      emptyState={
        <EmptyState
          icon={Boxes}
          title="No services yet"
          description="Create your first application, database, or compose stack in this project."
        />
      }
    />
  );
}
