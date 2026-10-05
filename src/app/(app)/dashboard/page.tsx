'use client';

import { useCallback, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { FolderKanban, Server, Boxes, KeyRound, Plus } from 'lucide-react';
import { PageContainer, PageHeader, Panel } from '@/components/app/page';
import { StatCard } from '@/components/app/stat-card';
import { EmptyState } from '@/components/app/empty-state';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/app/status-badge';
import { ListRow } from '@/components/app/list-row';
import { AddServerModal } from '@/components/app/add-server-modal';
import { SetupWizard } from '@/components/app/setup-wizard';
import { useSetupStatus } from '@/components/app/use-setup-status';
import { useAuthStore } from '@/store/auth';
import { listProjects } from '@/services/api/project';
import { listServers } from '@/services/api/server';
import { listPrivateKeys } from '@/services/api/privatekey';

export default function DashboardPage() {
  const { currentWorkspaceId } = useAuthStore();
  const [addServerOpen, setAddServerOpen] = useState(false);
  const [wizardForceStep, setWizardForceStep] = useState<'server' | null>(null);
  const clearWizardForceStep = useCallback(() => setWizardForceStep(null), []);

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

  // The setup wizard shows until key, server, GitHub (connected or skipped) and project all exist.
  const setupStatus = useSetupStatus(currentWorkspaceId ?? '');
  const setupIncomplete = setupStatus.loaded && !setupStatus.allDone;

  // Every "Add server" entry point: open the wizard at the server step while setup is incomplete.
  const onAddServer = () => {
    if (setupIncomplete) setWizardForceStep('server');
    else setAddServerOpen(true);
  };

  const totalServices = projects?.reduce((sum, p) => sum + (p._count?.services ?? 0), 0);

  return (
    <PageContainer>
      <PageHeader
        title="Overview"
        description="Workspace at a glance"
        actions={
          <Button onClick={onAddServer}>
            <Plus className="size-3.5" /> Add server
          </Button>
        }
      />

      <SetupWizard
        key={currentWorkspaceId ?? ''}
        workspaceId={currentWorkspaceId ?? ''}
        forceStep={wizardForceStep}
        onForceStepHandled={clearWizardForceStep}
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Projects"
          value={projects?.length ?? '-'}
          icon={FolderKanban}
          href="/projects"
          hint="Groups of deployable services"
        />
        <StatCard
          label="Services"
          value={totalServices ?? '-'}
          icon={Boxes}
          hint="Apps, databases, compose stacks"
        />
        <StatCard
          label="Servers"
          value={servers?.length ?? '-'}
          icon={Server}
          href="/servers"
          hint="Deploy targets"
        />
        <StatCard
          label="SSH keys"
          value={keys?.length ?? '-'}
          icon={KeyRound}
          href="/keys-and-tokens"
          hint="Keys for server access"
        />
      </div>

      <AddServerModal
        workspaceId={currentWorkspaceId ?? ''}
        open={addServerOpen}
        onOpenChange={setAddServerOpen}
      />

      <Panel title="Servers" padded={false}>
        {servers?.length ? (
          <div className="divide-y">
            {servers.map((s) => {
              const status = !s.isReachable
                ? { label: 'Offline', tone: 'destructive' as const }
                : s.isUsable
                  ? { label: 'Ready', tone: 'success' as const }
                  : { label: 'Needs setup', tone: 'warning' as const };

              return (
                <ListRow
                  key={s.id}
                  href={`/servers/${s.id}`}
                  title={s.name}
                  subtitle={s.ip}
                  trailing={<StatusBadge status={status.label} tone={status.tone} />}
                />
              );
            })}
          </div>
        ) : (
          <EmptyState
            icon={Server}
            title="No servers yet"
            description="Add a Linux host over SSH to start deploying."
            action={
              <Button onClick={onAddServer}>
                <Plus className="size-3.5" /> Add server
              </Button>
            }
            className="rounded-none border-0"
          />
        )}
      </Panel>
    </PageContainer>
  );
}
