'use client';

import { use, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { SquareTerminal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PageContainer, PageHeader } from '@/components/app/page';
import { StatusBadge } from '@/components/app/status-badge';
import { getServer } from '@/services/api/server';
import { TabWithActivity } from '@/components/server/activity-panel';
import { GeneralSection } from '@/components/server/general-section';
import { AdvancedSection } from '@/components/server/advanced-section';
import { TerminalSection } from '@/components/server/terminal-section';
import { ProxySection } from '@/components/server/proxy-section';
import { DestinationsSection } from '@/components/server/destinations-section';
import { DangerSection } from '@/components/server/danger-section';

export default function ServerDetailPage({ params }: { params: Promise<{ serverId: string }> }) {
  const { serverId } = use(params);
  const qc = useQueryClient();
  const [tab, setTab] = useState('general');

  const { data: server, isLoading } = useQuery({
    queryKey: ['server', serverId],
    queryFn: () => getServer(serverId),
    refetchInterval: (q) => (q.state.data?.settings?.isSentinelEnabled ? 30_000 : false),
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ['server', serverId] });

  if (isLoading || !server) {
    return (
      <PageContainer>
        <div className="bg-accent h-20 animate-pulse rounded-lg" />
        <div className="bg-accent h-64 animate-pulse rounded-lg" />
      </PageContainer>
    );
  }

  const status = !server.isReachable
    ? { label: 'Offline', tone: 'destructive' as const }
    : server.isUsable
      ? { label: 'Ready', tone: 'success' as const }
      : { label: 'Needs setup', tone: 'warning' as const };

  return (
    <PageContainer>
      <PageHeader
        title={server.name}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-mono">{server.ip}</span>
            <StatusBadge status={status.label} tone={status.tone} />
          </span>
        }
        actions={
          <Button variant="outline" onClick={() => setTab('terminal')}>
            <SquareTerminal className="size-4" /> Terminal
          </Button>
        }
      />
      <Tabs value={tab} onValueChange={setTab} className="w-full min-w-0">
        <TabsList variant="line">
          <TabsTrigger value="general">General</TabsTrigger>
          <TabsTrigger value="proxy">Gateway</TabsTrigger>
          <TabsTrigger value="terminal">Terminal</TabsTrigger>
          <TabsTrigger value="advanced">Advanced</TabsTrigger>
          <TabsTrigger value="destinations">Destinations</TabsTrigger>
          <TabsTrigger value="danger">Danger</TabsTrigger>
        </TabsList>
        <TabsContent value="general" className="pt-6">
          <TabWithActivity serverId={server.id}>
            <GeneralSection key={server.id} server={server} onSaved={invalidate} />
          </TabWithActivity>
        </TabsContent>
        <TabsContent value="proxy" className="pt-6">
          <TabWithActivity serverId={server.id}>
            <ProxySection server={server} onChanged={invalidate} />
          </TabWithActivity>
        </TabsContent>
        <TabsContent value="terminal" className="pt-6">
          <TerminalSection serverId={server.id} />
        </TabsContent>
        <TabsContent value="advanced" className="pt-6">
          <TabWithActivity serverId={server.id}>
            <AdvancedSection server={server} onSaved={invalidate} />
          </TabWithActivity>
        </TabsContent>
        <TabsContent value="destinations" className="pt-6">
          <DestinationsSection server={server} onChanged={invalidate} />
        </TabsContent>
        <TabsContent value="danger" className="pt-6">
          <DangerSection server={server} />
        </TabsContent>
      </Tabs>
    </PageContainer>
  );
}
