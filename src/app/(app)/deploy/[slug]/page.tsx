'use client';

import { use, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ExternalLink, Rocket } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { listProjects } from '@/services/api/project';
import {
  createServiceFromTemplate,
  listServers,
  listTemplates,
} from '@/services/api/service';
import { useAuthStore } from '@/store/auth';
import { FormField, FormSection, PageContainer, PageHeader } from '@/components/app/page';
import { EmptyState } from '@/components/app/empty-state';
import { marketingHref } from '@/lib/env';

function resolveListedId(
  selected: string,
  options: { id: string }[] | undefined,
): string {
  if (!options?.length) return '';
  if (selected && options.some((option) => option.id === selected)) return selected;
  if (options.length === 1) return options[0]!.id;
  return '';
}

/**
 * One-click deploy target for the public marketplace. User picks workspace
 * (updates current workspace), project, and server, then creates the template
 * service and jumps to the service page.
 */
export default function OneClickDeployPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = use(params);
  const router = useRouter();
  const workspaces = useAuthStore((s) => s.workspaces);
  const workspaceId = useAuthStore((s) => s.currentWorkspaceId);
  const setCurrentWorkspace = useAuthStore((s) => s.setCurrentWorkspace);

  const { data: templatesData } = useQuery({
    queryKey: ['templates'],
    queryFn: () => listTemplates(),
    staleTime: 5 * 60_000,
  });
  const template = useMemo(
    () => templatesData?.templates.find((t) => t.slug === slug),
    [templatesData, slug],
  );

  const { data: projects } = useQuery({
    queryKey: ['projects', workspaceId],
    queryFn: () => listProjects(workspaceId!),
    enabled: !!workspaceId,
  });

  const { data: servers } = useQuery({
    queryKey: ['servers', workspaceId],
    queryFn: () => listServers(workspaceId!),
    enabled: !!workspaceId,
  });

  function onWorkspaceChange(id: string) {
    if (id === workspaceId) return;
    setCurrentWorkspace(id);
    router.refresh();
  }

  if (templatesData && !template) {
    return (
      <PageContainer className="max-w-3xl">
        <PageHeader title="Deploy template" />
        <EmptyState
          title="Template not found"
          description={`No service named "${slug}" exists in the catalog.`}
          action={
            <Button asChild>
              <Link href={marketingHref('/marketplace')}>Back to marketplace</Link>
            </Button>
          }
        />
      </PageContainer>
    );
  }

  return (
    <PageContainer className="max-w-3xl">
      <PageHeader
        title="Deploy template"
        description="Pick where this one-click service should run."
        actions={
          template?.documentation ? (
            <Button asChild variant="outline">
              <a href={template.documentation} target="_blank" rel="noreferrer">
                Documentation <ExternalLink className="size-3.5" />
              </a>
            </Button>
          ) : undefined
        }
      />

      <DeployTargetForm
        key={workspaceId ?? 'none'}
        slug={slug}
        templateName={template?.name}
        templateSlogan={template?.slogan}
        templateLogo={template?.logo}
        workspaceId={workspaceId}
        projects={projects}
        servers={servers}
        onWorkspaceChange={onWorkspaceChange}
        workspaces={workspaces}
      />
    </PageContainer>
  );
}

function DeployTargetForm({
  slug,
  templateName,
  templateSlogan,
  templateLogo,
  workspaceId,
  workspaces,
  projects,
  servers,
  onWorkspaceChange,
}: {
  slug: string;
  templateName?: string;
  templateSlogan?: string | null;
  templateLogo?: string | null;
  workspaceId: string | null;
  workspaces: ReturnType<typeof useAuthStore.getState>['workspaces'];
  projects: Awaited<ReturnType<typeof listProjects>> | undefined;
  servers: Awaited<ReturnType<typeof listServers>> | undefined;
  onWorkspaceChange: (id: string) => void;
}) {
  const router = useRouter();
  const [projectId, setProjectId] = useState('');
  const [serverId, setServerId] = useState('');
  const resolvedProjectId = resolveListedId(projectId, projects);
  const resolvedServerId = resolveListedId(serverId, servers);

  const deployMut = useMutation({
    mutationFn: async () => {
      if (!resolvedProjectId || !resolvedServerId) {
        throw new Error('Select a project and server');
      }
      const service = await createServiceFromTemplate(resolvedProjectId, {
        slug,
        serverId: resolvedServerId,
      });
      return { projectId: resolvedProjectId, serviceId: service.id };
    },
    onSuccess: ({ projectId: pid, serviceId }) => {
      toast.success(`${templateName ?? slug} created`);
      router.push(`/projects/${pid}/services/${serviceId}`);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Deploy failed'),
  });

  return (
    <FormSection
      title={
        <span className="flex min-w-0 items-center gap-3">
          {templateLogo ? (
            // eslint-disable-next-line @next/next/no-img-element -- vendored local SVG/PNG assets
            <img
              src={templateLogo}
              alt=""
              width={28}
              height={28}
              className="bg-secondary size-7 shrink-0 rounded-md object-contain p-0.5"
            />
          ) : null}
          <span className="truncate">{templateName ?? slug}</span>
        </span>
      }
      description={templateSlogan ?? undefined}
      footer={
        <>
          <p className="text-muted-foreground mr-auto text-sm leading-relaxed">
            Secrets and hostnames are generated for you; you can review everything before the first
            deployment.
          </p>
          <Button
            disabled={!workspaceId || !resolvedProjectId || !resolvedServerId || deployMut.isPending}
            onClick={() => deployMut.mutate()}
          >
            <Rocket className="size-3.5" />
            {deployMut.isPending ? 'Creating service…' : 'Deploy'}
          </Button>
        </>
      }
    >
      <FormField label="Workspace" description="Changing workspace also switches your current workspace in Peon.">
        <SearchableSelect
          value={workspaceId}
          onValueChange={onWorkspaceChange}
          placeholder="Select a workspace"
          searchPlaceholder="Search workspaces…"
          options={workspaces.map((w) => ({
            value: w.id,
            label: w.name,
            keywords: w.slug,
          }))}
        />
      </FormField>

      <FormField label="Project">
        <div className="space-y-1.5">
          <SearchableSelect
            value={resolvedProjectId || null}
            onValueChange={setProjectId}
            placeholder="Select a project"
            searchPlaceholder="Search projects…"
            disabled={!workspaceId || !projects?.length}
            options={(projects ?? []).map((p) => ({ value: p.id, label: p.name }))}
          />
          {projects && projects.length === 0 && (
            <p className="text-muted-foreground text-sm">
              No projects in this workspace yet.{' '}
              <Link href="/projects" className="text-primary hover:underline">
                Create a project
              </Link>{' '}
              and come back.
            </p>
          )}
        </div>
      </FormField>

      <FormField label="Server">
        <div className="space-y-1.5">
          <SearchableSelect
            value={resolvedServerId || null}
            onValueChange={setServerId}
            placeholder="Select a server"
            searchPlaceholder="Search servers…"
            disabled={!workspaceId || !servers?.length}
            options={(servers ?? []).map((s) => ({
              value: s.id,
              label: `${s.name} (${s.ip})`,
              keywords: s.ip,
            }))}
          />
          {servers && servers.length === 0 && (
            <p className="text-muted-foreground text-sm">
              You need a connected server in this workspace.{' '}
              <Link href="/servers" className="text-primary hover:underline">
                Add a server
              </Link>{' '}
              and come back; this page will pick it up.
            </p>
          )}
        </div>
      </FormField>
    </FormSection>
  );
}
