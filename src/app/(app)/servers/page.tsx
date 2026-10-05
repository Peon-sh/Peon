'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Plus, Server } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PageContainer, PageHeader } from '@/components/app/page';
import { DataTable } from '@/components/app/data-table';
import { EmptyState } from '@/components/app/empty-state';
import { StatusBadge } from '@/components/app/status-badge';
import { LocalDateTime } from '@/components/app/local-datetime';
import { AddServerModal } from '@/components/app/add-server-modal';
import { useAuthStore } from '@/store/auth';
import { listServers, type ServerListItem } from '@/services/api/server';

function serverStatus(s: ServerListItem) {
  return !s.isReachable
    ? { label: 'Offline', tone: 'destructive' as const }
    : s.isUsable
      ? { label: 'Ready', tone: 'success' as const }
      : { label: 'Needs setup', tone: 'warning' as const };
}

export default function ServersPage() {
  const { currentWorkspaceId } = useAuthStore();
  const wsId = currentWorkspaceId ?? '';
  const [open, setOpen] = useState(false);

  const { data: servers, isLoading } = useQuery({
    queryKey: ['servers', wsId],
    queryFn: () => listServers(wsId),
    enabled: !!wsId,
  });

  const addButton = (
    <Button onClick={() => setOpen(true)}>
      <Plus className="size-4" /> Add server
    </Button>
  );

  return (
    <PageContainer>
      <AddServerModal workspaceId={wsId} open={open} onOpenChange={setOpen} />
      <PageHeader title="Servers" description="Machines you deploy to over SSH" actions={addButton} />

      <DataTable
        columns={[
          { key: 'name', header: 'Name', cell: (s) => s.name },
          { key: 'ip', header: 'IP', cell: (s) => <span className="font-mono">{s.ip}</span> },
          {
            key: 'status',
            header: 'Status',
            cell: (s) => {
              const status = serverStatus(s);
              return <StatusBadge status={status.label} tone={status.tone} />;
            },
          },
          {
            key: 'added',
            header: 'Added',
            cell: (s) => <LocalDateTime value={s.createdAt} className="text-muted-foreground" />,
          },
        ]}
        rows={servers ?? []}
        rowKey={(s) => s.id}
        rowHref={(s) => `/servers/${s.id}`}
        isLoading={isLoading}
        emptyState={
          <EmptyState
            icon={Server}
            title="No servers yet"
            description="Add a Linux host over SSH. You need an SSH key, which you can generate in the form or under MCP & SSH keys."
            action={addButton}
          />
        }
      />
    </PageContainer>
  );
}
