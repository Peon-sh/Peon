'use client';

import { use, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ExternalLink, Rocket } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { listProjects } from '@/services/api/project';
import {
  createServiceFromTemplate,
  listServers,
  listTemplates,
} from '@/services/api/service';
import { useAuthStore } from '@/store/auth';
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
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <h1 className="text-xl font-800">Template not found</h1>
        <p className="text-muted-foreground mt-2 text-sm">
          No service named &quot;{slug}&quot; exists in the catalog.
        </p>
        <Button asChild className="mt-6">
          <Link href={marketingHref('/marketplace')}>Back to marketplace</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-lg px-4 py-12">
      <p className="text-phosphor font-mono text-xs uppercase tracking-widest">
        One-click deploy
      </p>
      <div className="mt-2 flex items-start gap-3">
        {template?.logo ? (
          // eslint-disable-next-line @next/next/no-img-element -- vendored local SVG/PNG assets
          <img
            src={template.logo}
            alt=""
            width={44}
            height={44}
            className="size-11 shrink-0 rounded-md bg-white object-contain p-1"
          />
        ) : null}
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-800">{template?.name ?? slug}</h1>
          {template?.slogan && (
            <p className="text-muted-foreground mt-2 text-sm">{template.slogan}</p>
          )}
          {template?.documentation && (
            <a
              href={template.documentation}
              target="_blank"
              rel="noreferrer"
              className="text-phosphor mt-2 inline-flex items-center gap-1 text-xs hover:underline"
            >
              documentation <ExternalLink className="size-3" />
            </a>
          )}
        </div>
      </div>

      <DeployTargetForm
        key={workspaceId ?? 'none'}
        slug={slug}
        templateName={template?.name}
        workspaceId={workspaceId}
        projects={projects}
        servers={servers}
        onWorkspaceChange={onWorkspaceChange}
        workspaces={workspaces}
      />
    </div>
  );
}

function DeployTargetForm({
  slug,
  templateName,
  workspaceId,
  workspaces,
  projects,
  servers,
  onWorkspaceChange,
}: {
  slug: string;
  templateName?: string;
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
    <div className="border-border bg-card mt-8 space-y-4 rounded-lg border p-5">
      <div className="space-y-1.5">
        <Label>Workspace</Label>
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
      </div>

      <div className="space-y-1.5">
        <Label>Project</Label>
        <SearchableSelect
          value={resolvedProjectId || null}
          onValueChange={setProjectId}
          placeholder="Select a project"
          searchPlaceholder="Search projects…"
          disabled={!workspaceId || !projects?.length}
          options={(projects ?? []).map((p) => ({ value: p.id, label: p.name }))}
        />
        {projects && projects.length === 0 && (
          <p className="text-muted-foreground text-xs">
            No projects in this workspace yet.{' '}
            <Link href="/projects" className="text-phosphor hover:underline">
              Create a project
            </Link>{' '}
            and come back.
          </p>
        )}
      </div>

      <div className="space-y-1.5">
        <Label>Server</Label>
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
          <p className="text-muted-foreground text-xs">
            You need a connected server in this workspace.{' '}
            <Link href="/servers" className="text-phosphor hover:underline">
              Add a server
            </Link>{' '}
            and come back; this page will pick it up.
          </p>
        )}
      </div>

      <p className="text-muted-foreground text-xs leading-relaxed">
        Secrets and hostnames are generated for you; you can review everything
        before the first deployment. Changing workspace also switches your
        current workspace in Peon.
      </p>

      <Button
        className="w-full"
        disabled={!workspaceId || !resolvedProjectId || !resolvedServerId || deployMut.isPending}
        onClick={() => deployMut.mutate()}
      >
        <Rocket className="size-4" />
        {deployMut.isPending ? 'Creating service…' : 'Deploy'}
      </Button>
    </div>
  );
}
