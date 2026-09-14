'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Plus, Server, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PageContainer } from '@/components/app/page';
import { EmptyState } from '@/components/app/empty-state';
import { StatusBadge } from '@/components/app/status-badge';
import { AddServerDialog } from '@/components/app/add-server-dialog';
import { useAuthStore } from '@/store/auth';
import { listServers } from '@/services/api/server';

export default function ServersPage() {
  const { currentWorkspaceId } = useAuthStore();
  const wsId = currentWorkspaceId ?? '';
  const [open, setOpen] = useState(false);

  const { data: servers, isLoading } = useQuery({
    queryKey: ['servers', wsId],
    queryFn: () => listServers(wsId),
    enabled: !!wsId,
  });

  return (
    <PageContainer>
      <AddServerDialog open={open} onOpenChange={setOpen} />

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="bg-accent h-40 animate-pulse rounded-lg" />
          ))}
        </div>
      ) : !servers?.length ? (
        <EmptyState
          icon={Server}
          title="No servers yet"
          description="add a linux host over ssh — you’ll need an ssh key (generate one in the form or under Keys & Tokens)."
          action={
            <Button onClick={() => setOpen(true)}>
              <Plus className="size-4" /> Add server
            </Button>
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {servers.map((s) => {
            const status = !s.isReachable
              ? { label: 'Offline', tone: 'destructive' as const }
              : s.isUsable
                ? { label: 'Ready', tone: 'success' as const }
                : { label: 'Needs setup', tone: 'warning' as const };
            const domain = s.settings?.wildcardDomain?.trim() || null;

            return (
              <Link key={s.id} href={`/servers/${s.id}`} className="group">
                <div className="bg-card hover:border-border-bright hover:bg-secondary flex h-full flex-col rounded-lg border p-4 transition-colors">
                  <div className="flex items-start justify-between gap-3">
                    <span className="border-border-bright bg-secondary text-phosphor grid size-9 place-items-center rounded-md border">
                      <Server className="size-4" />
                    </span>
                    <StatusBadge status={status.label} tone={status.tone} />
                  </div>
                  <div className="mt-3 min-w-0 space-y-1">
                    <p className="font-heading truncate font-bold">{s.name}</p>
                    <p className="text-muted-foreground truncate text-[11px]">{s.ip}</p>
                  </div>
                  <div className="text-muted-foreground mt-3 space-y-1 text-[11px]">
                    <div className="flex items-center justify-between gap-2">
                      <span>user</span>
                      <span className="text-foreground/80 truncate font-medium">{s.user}</span>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span>port</span>
                      <span className="text-foreground/80 font-medium">{s.port}</span>
                    </div>
                    {domain ? (
                      <div className="flex items-center justify-between gap-2">
                        <span>domain</span>
                        <span className="text-foreground/80 truncate font-medium">{domain}</span>
                      </div>
                    ) : null}
                  </div>
                  <div className="mt-auto flex items-center justify-end pt-3">
                    <ArrowRight className="text-faint size-4 transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
                  </div>
                </div>
              </Link>
            );
          })}
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="border-border-bright text-muted-foreground hover:text-phosphor hover:border-phosphor-dim grid min-h-40 place-items-center rounded-lg border border-dashed transition-colors"
          >
            <span className="flex flex-col items-center gap-2 text-[12.5px]">
              <Plus className="size-4" /> add server
            </span>
          </button>
        </div>
      )}
    </PageContainer>
  );
}
