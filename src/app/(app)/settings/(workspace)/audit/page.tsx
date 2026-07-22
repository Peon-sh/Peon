'use client';

import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { LoaderCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { Panel } from '@/components/app/page';
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

export default function SettingsAuditPage() {
  const { currentWorkspaceId } = useAuthStore();
  const wsId = currentWorkspaceId!;
  const [action, setAction] = useState('');
  const [actorUserId, setActorUserId] = useState('');
  const [resourceType, setResourceType] = useState('');
  const [q, setQ] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [cursor, setCursor] = useState<string | null>(null);
  const [items, setItems] = useState<AuditLogItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
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
      cursor: cursor || undefined,
      limit: 50,
    }),
    [action, actorUserId, resourceType, q, from, to, cursor],
  );

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['ws-audit', wsId, filters],
    queryFn: () => listWorkspaceAudit(wsId, filters),
    enabled: !!wsId,
  });

  useEffect(() => {
    setCursor(null);
    setItems([]);
  }, [action, actorUserId, resourceType, q, from, to]);

  useEffect(() => {
    if (!data) return;
    if (cursor) {
      setItems((prev) => [...prev, ...data.items]);
    } else {
      setItems(data.items);
    }
    setNextCursor(data.nextCursor);
  }, [data, cursor]);

  return (
    <div className="space-y-4">
      <Panel contentClassName="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className="space-y-1.5">
          <Label>Action</Label>
          <Input
            value={action}
            onChange={(e) => setAction(e.target.value)}
            placeholder="e.g. service.env.upserted"
          />
        </div>
        <div className="space-y-1.5">
          <Label>Actor</Label>
          <SearchableSelect
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
        </div>
        <div className="space-y-1.5">
          <Label>Resource type</Label>
          <SearchableSelect
            value={resourceType || '__all__'}
            onValueChange={(v) => setResourceType(v === '__all__' ? '' : v)}
            placeholder="All types"
            options={[
              { value: '__all__', label: 'All types' },
              { value: 'workspace', label: 'workspace' },
              { value: 'project', label: 'project' },
              { value: 'service', label: 'service' },
              { value: 'server', label: 'server' },
              { value: 'source', label: 'source' },
              { value: 'storage', label: 'storage' },
              { value: 'private_key', label: 'private_key' },
              { value: 'token', label: 'token' },
              { value: 'tag', label: 'tag' },
              { value: 'shared_variable', label: 'shared_variable' },
              { value: 'notification', label: 'notification' },
              { value: 'llm_credential', label: 'llm_credential' },
              { value: 'deployment', label: 'deployment' },
            ]}
          />
        </div>
        <div className="space-y-1.5">
          <Label>Search</Label>
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Summary or name" />
        </div>
        <div className="space-y-1.5">
          <Label>From</Label>
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>To</Label>
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
      </Panel>

      {isLoading && !items.length ? (
        <div className="text-muted-foreground flex items-center gap-2 text-[12px]">
          <LoaderCircle className="size-4 animate-spin" /> Loading audit log…
        </div>
      ) : !items.length ? (
        <EmptyState
          title="No audit events"
          description="Mutating actions in this workspace will appear here."
        />
      ) : (
        <Panel contentClassName="divide-y overflow-x-auto">
          <div className="text-muted-foreground grid min-w-[640px] grid-cols-[140px_minmax(0,1.4fr)_minmax(120px,0.8fr)_minmax(160px,1fr)] gap-3 px-4 py-2 text-[11px] font-semibold uppercase tracking-wide">
            <span>When</span>
            <span>Summary</span>
            <span>Actor</span>
            <span>Action</span>
          </div>
          {items.map((row) => (
            <button
              key={row.id}
              type="button"
              onClick={() => setSelected(row)}
              className="hover:bg-secondary grid min-w-[640px] w-full cursor-pointer grid-cols-[140px_minmax(0,1.4fr)_minmax(120px,0.8fr)_minmax(160px,1fr)] gap-3 px-4 py-3 text-left text-[12px] transition-colors"
            >
              <span className="text-muted-foreground">
                <LocalDateTime value={row.createdAt} />
              </span>
              <div className="min-w-0">
                <p className="truncate font-medium">{row.summary}</p>
                {row.resourceName || row.resourceType ? (
                  <p className="text-muted-foreground truncate text-[11px]">
                    {row.resourceType}
                    {row.resourceName ? ` · ${row.resourceName}` : ''}
                  </p>
                ) : null}
              </div>
              <span className="truncate">
                {row.actor?.name ?? row.actor?.email ?? row.actorType}
              </span>
              <span className="text-muted-foreground font-mono text-[11px] break-all">
                {row.action}
              </span>
            </button>
          ))}
        </Panel>
      )}

      {nextCursor ? (
        <Button
          size="sm"
          variant="outline"
          disabled={isFetching}
          onClick={() => setCursor(nextCursor)}
        >
          Load more
        </Button>
      ) : null}

      <Modal open={!!selected} onOpenChange={(open) => !open && setSelected(null)}>
        <ModalContent>
          <ModalHeader>
            <ModalTitle>Audit event</ModalTitle>
          </ModalHeader>
          <ModalBody className="space-y-4">
            {selected ? (
              <>
                <ModalDescription>{selected.summary}</ModalDescription>
                <dl className="grid gap-3 text-[12px] sm:grid-cols-2">
                  <div className="space-y-1">
                    <dt className="text-muted-foreground text-[11px] font-semibold uppercase tracking-wide">
                      When
                    </dt>
                    <dd>
                      <LocalDateTime value={selected.createdAt} />
                    </dd>
                  </div>
                  <div className="space-y-1">
                    <dt className="text-muted-foreground text-[11px] font-semibold uppercase tracking-wide">
                      Action
                    </dt>
                    <dd className="font-mono break-all">{selected.action}</dd>
                  </div>
                  <div className="space-y-1">
                    <dt className="text-muted-foreground text-[11px] font-semibold uppercase tracking-wide">
                      Actor
                    </dt>
                    <dd>
                      {selected.actor?.name ?? selected.actor?.email ?? selected.actorType}
                      {selected.actorRole ? ` · ${selected.actorRole}` : ''}
                      {selected.actor?.email && selected.actor?.name
                        ? ` (${selected.actor.email})`
                        : ''}
                    </dd>
                  </div>
                  <div className="space-y-1">
                    <dt className="text-muted-foreground text-[11px] font-semibold uppercase tracking-wide">
                      Actor type
                    </dt>
                    <dd>{selected.actorType}</dd>
                  </div>
                  <div className="space-y-1">
                    <dt className="text-muted-foreground text-[11px] font-semibold uppercase tracking-wide">
                      Resource
                    </dt>
                    <dd className="break-all">
                      {selected.resourceType}
                      {selected.resourceName ? ` · ${selected.resourceName}` : ''}
                      {selected.resourceId ? (
                        <span className="text-muted-foreground block font-mono text-[11px]">
                          {selected.resourceId}
                        </span>
                      ) : null}
                    </dd>
                  </div>
                </dl>
                <div className="space-y-1.5">
                  <p className="text-muted-foreground text-[11px] font-semibold uppercase tracking-wide">
                    Metadata
                  </p>
                  <pre className="bg-secondary max-h-64 overflow-auto rounded-md border p-3 font-mono text-[11px] whitespace-pre-wrap break-all">
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
    </div>
  );
}
