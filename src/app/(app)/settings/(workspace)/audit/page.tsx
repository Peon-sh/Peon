'use client';

import { useMemo, useState } from 'react';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { ScrollText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { KeyValueList } from '@/components/app/page';
import { DataTable } from '@/components/app/data-table';
import { EmptyState } from '@/components/app/empty-state';
import { LocalDateTime } from '@/components/app/local-datetime';
import {
  Modal,
  ModalBody,
  ModalContent,
  ModalDescription,
  ModalFooter,
  ModalHeader,
  ModalTitle,
} from '@/components/app/modal';
import { useAuthStore } from '@/store/auth';
import {
  listWorkspaceAudit,
  getWorkspaceMembers,
  type AuditLogItem,
} from '@/services/api/workspace';

const RESOURCE_TYPES = [
  'workspace',
  'project',
  'service',
  'server',
  'source',
  'storage',
  'private_key',
  'token',
  'tag',
  'shared_variable',
  'notification',
  'llm_credential',
  'deployment',
] as const;

function resourceTypeLabel(t: string) {
  const w = t.replace(/_/g, ' ');
  return w.charAt(0).toUpperCase() + w.slice(1);
}

export default function SettingsAuditPage() {
  const { currentWorkspaceId } = useAuthStore();
  const wsId = currentWorkspaceId!;
  const [action, setAction] = useState('');
  const [actorUserId, setActorUserId] = useState('');
  const [resourceType, setResourceType] = useState('');
  const [q, setQ] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [selected, setSelected] = useState<AuditLogItem | null>(null);

  const { data: membersData } = useQuery({
    queryKey: ['ws-members', wsId],
    queryFn: () => getWorkspaceMembers(wsId),
    enabled: !!wsId,
  });

  const filters = useMemo(
    () => ({
      action: action || undefined,
      actorUserId: actorUserId || undefined,
      resourceType: resourceType || undefined,
      q: q || undefined,
      from: from ? new Date(from).toISOString() : undefined,
      to: to ? new Date(to).toISOString() : undefined,
      limit: 50,
    }),
    [action, actorUserId, resourceType, q, from, to],
  );

  const {
    data,
    isLoading,
    isFetching,
    fetchNextPage,
    hasNextPage,
  } = useInfiniteQuery({
    queryKey: ['ws-audit', wsId, filters],
    queryFn: ({ pageParam }) =>
      listWorkspaceAudit(wsId, { ...filters, cursor: pageParam as string | undefined }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    enabled: !!wsId,
  });

  const items = data?.pages.flatMap((page) => page.items) ?? [];

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <Input
          aria-label="Search"
          className="w-full sm:w-56"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search summary or name"
        />
        <Input
          aria-label="Action"
          className="w-full font-mono sm:w-56"
          value={action}
          onChange={(e) => setAction(e.target.value)}
          placeholder="Action, e.g. service.env.upserted"
        />
        <SearchableSelect
          className="w-full sm:w-44"
          value={actorUserId || '__all__'}
          onValueChange={(v) => setActorUserId(v === '__all__' ? '' : v)}
          placeholder="All actors"
          options={[
            { value: '__all__', label: 'All actors' },
            ...(membersData?.members.map((m) => ({
              value: m.user.id,
              label: m.user.name ?? m.user.email,
            })) ?? []),
          ]}
        />
        <SearchableSelect
          className="w-full sm:w-44"
          value={resourceType || '__all__'}
          onValueChange={(v) => setResourceType(v === '__all__' ? '' : v)}
          placeholder="All types"
          options={[
            { value: '__all__', label: 'All types' },
            ...RESOURCE_TYPES.map((t) => ({ value: t, label: resourceTypeLabel(t) })),
          ]}
        />
        <div className="flex items-center gap-2">
          <Input
            aria-label="From"
            type="date"
            className="w-36"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
          <span className="text-muted-foreground text-sm">to</span>
          <Input
            aria-label="To"
            type="date"
            className="w-36"
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
        </div>
      </div>

      <DataTable
        columns={[
          {
            key: 'when',
            header: 'When',
            className: 'whitespace-nowrap',
            cell: (row) => <LocalDateTime value={row.createdAt} className="text-muted-foreground" />,
          },
          {
            key: 'actor',
            header: 'Actor',
            cell: (row) => (
              <span className="block max-w-48 truncate">
                {row.actor?.name ?? row.actor?.email ?? row.actorType}
              </span>
            ),
          },
          {
            key: 'action',
            header: 'Action',
            cell: (row) => <span className="text-muted-foreground font-mono text-sm break-all">{row.action}</span>,
          },
          {
            key: 'target',
            header: 'Target',
            cell: (row) => (
              <div className="min-w-0 max-w-md">
                <p className="truncate font-medium">{row.summary}</p>
                {row.resourceName || row.resourceType ? (
                  <p className="text-muted-foreground truncate text-sm">
                    {row.resourceType}
                    {row.resourceName ? ` · ${row.resourceName}` : ''}
                  </p>
                ) : null}
              </div>
            ),
          },
        ]}
        rows={items}
        rowKey={(row) => row.id}
        onRowClick={(row) => setSelected(row)}
        isLoading={isLoading && !items.length}
        emptyState={
          <EmptyState
            icon={ScrollText}
            title="No audit events"
            description="Mutating actions in this workspace will appear here."
          />
        }
      />

      {hasNextPage ? (
        <div className="flex justify-center">
          <Button
            variant="outline"
            disabled={isFetching}
            onClick={() => void fetchNextPage()}
          >
            Load more
          </Button>
        </div>
      ) : null}

      <Modal open={!!selected} onOpenChange={(open) => !open && setSelected(null)}>
        <ModalContent size="lg">
          <ModalHeader>
            <ModalTitle>Audit event</ModalTitle>
            {selected ? <ModalDescription>{selected.summary}</ModalDescription> : null}
          </ModalHeader>
          <ModalBody className="space-y-4">
            {selected ? (
              <>
                <KeyValueList
                  items={[
                    { label: 'When', value: <LocalDateTime value={selected.createdAt} /> },
                    { label: 'Action', value: <span className="break-all">{selected.action}</span>, mono: true },
                    {
                      label: 'Actor',
                      value: (
                        <>
                          {selected.actor?.name ?? selected.actor?.email ?? selected.actorType}
                          {selected.actorRole ? ` · ${selected.actorRole}` : ''}
                          {selected.actor?.email && selected.actor?.name
                            ? ` (${selected.actor.email})`
                            : ''}
                        </>
                      ),
                    },
                    { label: 'Actor type', value: selected.actorType },
                    {
                      label: 'Resource',
                      value: (
                        <span className="break-all">
                          {selected.resourceType}
                          {selected.resourceName ? ` · ${selected.resourceName}` : ''}
                          {selected.resourceId ? (
                            <span className="text-muted-foreground block font-mono text-sm">
                              {selected.resourceId}
                            </span>
                          ) : null}
                        </span>
                      ),
                    },
                  ]}
                />
                <div className="space-y-2">
                  <p className="text-muted-foreground text-sm font-medium">Metadata</p>
                  <pre className="bg-secondary max-h-64 overflow-auto rounded-md border p-3 font-mono text-xs whitespace-pre-wrap break-all">
                    {selected.metadata == null
                      ? '—'
                      : JSON.stringify(selected.metadata, null, 2)}
                  </pre>
                </div>
              </>
            ) : null}
          </ModalBody>
          <ModalFooter>
            <Button variant="outline" onClick={() => setSelected(null)}>
              Close
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </>
  );
}
