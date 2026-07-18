'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { FolderKanban, Server, GitBranch, Database, ArrowRight, Boxes, KeyRound } from 'lucide-react';
import { PageContainer, Panel } from '@/components/app/page';
import { StatCard } from '@/components/app/stat-card';
import { EmptyState } from '@/components/app/empty-state';
import { useAuthStore } from '@/store/auth';
import { listProjects } from '@/services/api/project';
import { listServers } from '@/services/api/server';
import { listPrivateKeys } from '@/services/api/privatekey';

const QUICK_LINKS = [
  { title: 'Connect a server', description: 'add a linux vps to deploy to over ssh', href: '/servers', icon: Server },
  { title: 'Add a git source', description: 'link github or gitlab apps', href: '/sources', icon: GitBranch },
  { title: 'Configure storage', description: 'set up s3-compatible buckets for backups', href: '/storages', icon: Database },
  { title: 'Add an ssh key', description: 'generate or paste a keypair for servers', href: '/keys-and-tokens', icon: KeyRound },
];

export default function DashboardPage() {
  const { currentWorkspaceId } = useAuthStore();

  const { data: projects } = useQuery({
    queryKey: ['projects', currentWorkspaceId],
    queryFn: () => listProjects(currentWorkspaceId!),
    enabled: !!currentWorkspaceId,
  });

  const { data: servers } = useQuery({
    queryKey: ['servers', currentWorkspaceId],
    queryFn: () => listServers(currentWorkspaceId!),
    enabled: !!currentWorkspaceId,
  });

  const { data: keys } = useQuery({
    queryKey: ['private-keys', currentWorkspaceId],
    queryFn: () => listPrivateKeys(currentWorkspaceId!),
    enabled: !!currentWorkspaceId,
  });

  const totalServices = projects?.reduce((sum, p) => sum + (p._count?.services ?? 0), 0);

  return (
    <PageContainer>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Projects"
          value={projects?.length ?? '-'}
          icon={FolderKanban}
          href="/projects"
          hint="groups of deployable services"
          accent={!!projects?.length}
        />
        <StatCard
          label="Services"
          value={totalServices ?? '-'}
          icon={Boxes}
          hint="apps, databases & compose stacks"
          accent={!!totalServices}
        />
        <StatCard
          label="Servers"
          value={servers?.length ?? '-'}
          icon={Server}
          href="/servers"
          hint="deploy targets"
          accent={!!servers?.length}
        />
        <StatCard
          label="SSH Keys"
          value={keys?.length ?? '-'}
          icon={KeyRound}
          href="/keys-and-tokens"
          hint="keys for server access"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.6fr_1fr]">
        <Panel
          title="projects"
          contentClassName={projects?.length ? undefined : 'flex flex-col p-4'}
        >
          {projects?.length ? (
            <div className="divide-y">
              {projects.map((p) => (
                <Link
                  key={p.id}
                  href={`/projects/${p.id}`}
                  className="hover:bg-secondary flex items-center justify-between gap-4 px-4 py-3 transition-colors"
                >
                  <div className="min-w-0">
                    <div className="text-[12.5px] font-semibold">{p.name}</div>
                    <div className="text-muted-foreground truncate text-[11px]">
                      {p.description || 'no description'}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <span className="text-muted-foreground text-[11px]">
                      <b className="text-foreground">{p._count?.services ?? 0}</b>{' '}
                      {(p._count?.services ?? 0) === 1 ? 'service' : 'services'}
                    </span>
                    <ArrowRight className="text-faint size-3.5" />
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <EmptyState
              icon={FolderKanban}
              title="No projects yet"
              description="create your first project to start deploying."
              className="flex flex-1 flex-col items-center justify-center py-8"
            />
          )}
        </Panel>

        <Panel title="get started">
          <div className="divide-y">
            {QUICK_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="hover:bg-secondary flex items-center gap-3 px-4 py-3 transition-colors"
              >
                <span className="border-border-bright bg-secondary text-phosphor grid size-9 shrink-0 place-items-center rounded-md border">
                  <link.icon className="size-4" />
                </span>
                <span className="min-w-0">
                  <span className="block text-[12.5px] font-semibold">{link.title}</span>
                  <span className="text-muted-foreground block truncate text-[11px]">
                    {link.description}
                  </span>
                </span>
              </Link>
            ))}
          </div>
        </Panel>
      </div>
    </PageContainer>
  );
}
