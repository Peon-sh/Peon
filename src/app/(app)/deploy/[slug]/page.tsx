'use client';

import { use, useEffect, useMemo, useState } from 'react';
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

  const [projectId, setProjectId] = useState('');
  const [serverId, setServerId] = useState('');

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

  // Reset dependent picks when workspace changes; preselect sole options.
  useEffect(() => {
    setProjectId('');
    setServerId('');
  }, [workspaceId]);

  useEffect(() => {
    if (!projectId && projects?.length === 1) {
      setProjectId(projects[0].id);
    }
  }, [projects, projectId]);

  useEffect(() => {
    if (!serverId && servers?.length === 1) {
      setServerId(servers[0].id);
    }
  }, [servers, serverId]);

  // Drop stale selections if the list no longer contains them.
  useEffect(() => {
    if (projectId && projects && !projects.some((p) => p.id === projectId)) {
      setProjectId('');
    }
  }, [projects, projectId]);

  useEffect(() => {
    if (serverId && servers && !servers.some((s) => s.id === serverId)) {
      setServerId('');
    }
  }, [servers, serverId]);

  const deployMut = useMutation({
    mutationFn: async () => {
      if (!projectId || !serverId) {
        throw new Error('Select a project and server');
      }
      const service = await createServiceFromTemplate(projectId, { slug, serverId });
      return { projectId, serviceId: service.id };
    },
    onSuccess: ({ projectId: pid, serviceId }) => {
      toast.success(`${template?.name ?? slug} created`);
      router.push(`/projects/${pid}/services/${serviceId}`);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Deploy failed'),
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
      <h1 className="mt-2 text-2xl font-800">{template?.name ?? slug}</h1>
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
            value={projectId || null}
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
            value={serverId || null}
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
          disabled={!workspaceId || !projectId || !serverId || deployMut.isPending}
          onClick={() => deployMut.mutate()}
        >
          <Rocket className="size-4" />
          {deployMut.isPending ? 'Creating service…' : 'Deploy'}
        </Button>
      </div>
    </div>
  );
}
