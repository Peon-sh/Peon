'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient, useInfiniteQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { DatabaseBackup, Trash2, Play, Download } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { SearchableSelect } from '@/components/ui/searchable-select';
import {
  listBackups,
  createBackup,
  updateBackup,
  deleteBackup,
  runBackupNow,
  listBackupExecutions,
  restoreBackup,
  downloadBackup,
  type ScheduledBackupItem,
} from '@/services/api/service';
import { listStorages } from '@/services/api/storages';
import { FormField, FormSection } from '@/components/app/page';
import { DataTable } from '@/components/app/data-table';
import { EmptyState } from '@/components/app/empty-state';
import { StatusBadge } from '@/components/app/status-badge';
import { ConfirmButton } from '@/components/app/confirm';
import { LocalDateTime } from '@/components/app/local-datetime';
import { useAuthStore } from '@/store/auth';

export function BackupsSection({ serviceId }: { serviceId: string }) {
  const qc = useQueryClient();
  const workspaceId = useAuthStore((s) => s.currentWorkspaceId);
  const { data: backups } = useQuery({
    queryKey: ['backups', serviceId],
    queryFn: () => listBackups(serviceId),
    refetchInterval: 10_000,
  });
  const { data: storages } = useQuery({
    queryKey: ['storages', workspaceId],
    queryFn: () => listStorages(workspaceId!),
    enabled: !!workspaceId,
  });
  const [frequency, setFrequency] = useState('0 0 * * *');
  const [dumpAll, setDumpAll] = useState(true);
  const invalidate = () => qc.invalidateQueries({ queryKey: ['backups', serviceId] });

  const addMut = useMutation({
    mutationFn: () => createBackup(serviceId, { frequency, dumpAll }),
    onSuccess: async () => {
      await invalidate();
      toast.success('Backup schedule created');
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed'),
  });

  return (
    <div className="space-y-4">
      <FormSection
        title="New backup schedule"
        description="Logical dumps are stored on the server and can be downloaded or restored from previous runs."
        footer={
          <Button size="sm" onClick={() => addMut.mutate()} disabled={!frequency || addMut.isPending}>
            Add backup schedule
          </Button>
        }
      >
        <FormField label="Frequency (cron)" htmlFor="backup-freq">
          <Input
            id="backup-freq"
            className="font-mono"
            placeholder="0 0 * * *"
            value={frequency}
            onChange={(e) => setFrequency(e.target.value)}
          />
        </FormField>
        <FormField
          label="Backup scope"
          htmlFor="backup-dump-all"
          description={
            dumpAll
              ? 'Uses pg_dumpall / --all-databases so every database in this service is included.'
              : 'Dumps only the configured database name for this service.'
          }
        >
          <div className="flex h-8 items-center gap-3">
            <Switch checked={dumpAll} onCheckedChange={setDumpAll} id="backup-dump-all" />
            <span className="text-base">Entire instance (all databases)</span>
          </div>
        </FormField>
      </FormSection>

      {backups?.length ? (
        backups.map((b) => (
          <BackupEditor
            key={b.id}
            serviceId={serviceId}
            backup={b}
            storages={storages ?? []}
          />
        ))
      ) : (
        <EmptyState
          icon={DatabaseBackup}
          title="No backup schedules"
          description="Add one above to protect this database."
        />
      )}
    </div>
  );
}

function BackupEditor({
  serviceId,
  backup,
  storages,
}: {
  serviceId: string;
  backup: ScheduledBackupItem;
  storages: { id: string; name: string }[];
}) {
  const qc = useQueryClient();
  const [form, setForm] = useState<Record<string, unknown>>({});
  const set = (k: string, v: unknown) => setForm((f) => ({ ...f, [k]: v }));
  const val = <T,>(k: keyof ScheduledBackupItem, fallback: T): T =>
    (form[k as string] as T) ?? ((backup[k] as T) ?? fallback);
  const dirty = Object.keys(form).length > 0;
  const invalidate = () => qc.invalidateQueries({ queryKey: ['backups', serviceId] });

  const saveMut = useMutation({
    mutationFn: () => updateBackup(serviceId, backup.id, form),
    onSuccess: async () => {
      await invalidate();
      setForm({});
      toast.success('Backup schedule saved');
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed'),
  });
  const toggleMut = useMutation({
    mutationFn: () => updateBackup(serviceId, backup.id, { enabled: !backup.enabled }),
    onSuccess: invalidate,
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed'),
  });
  const runMut = useMutation({
    mutationFn: () => runBackupNow(serviceId, backup.id),
    onSuccess: async () => {
      await invalidate();
      await qc.invalidateQueries({ queryKey: ['backup-executions', backup.id] });
      toast.success('Backup queued - check executions shortly');
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed'),
  });
  const delMut = useMutation({
    mutationFn: () => deleteBackup(serviceId, backup.id),
    onSuccess: invalidate,
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed'),
  });

  const saveS3 = val('saveS3', false);
  const dumpAll = val('dumpAll', true);

  return (
    <FormSection
      title={
        <span className="inline-flex flex-wrap items-center gap-2">
          <span className="font-mono">{backup.frequency}</span>
          {!backup.enabled && <Badge variant="outline">Disabled</Badge>}
          {backup.dumpAll ? (
            <Badge variant="outline">All databases</Badge>
          ) : (
            <Badge variant="outline">Single database</Badge>
          )}
          {backup.saveS3 && <Badge variant="outline">S3</Badge>}
        </span>
      }
      footer={
        <>
          <ConfirmButton
            size="sm"
            onConfirm={() => delMut.mutate()}
            title="Delete backup schedule?"
            description="The schedule and its execution history will be removed. Existing dump files on the server are not deleted."
            disabled={delMut.isPending}
            className="mr-auto"
          >
            <Trash2 className="size-3.5" /> Delete
          </ConfirmButton>
          <Button size="sm" variant="outline" onClick={() => toggleMut.mutate()} disabled={toggleMut.isPending}>
            {backup.enabled ? 'Disable' : 'Enable'}
          </Button>
          <Button size="sm" variant="outline" onClick={() => runMut.mutate()} disabled={runMut.isPending}>
            <Play className="size-3.5" /> Backup now
          </Button>
          <Button size="sm" onClick={() => saveMut.mutate()} disabled={!dirty || saveMut.isPending}>
            Save
          </Button>
        </>
      }
    >
      <FormField label="Frequency (cron)" htmlFor={`backup-${backup.id}-frequency`}>
        <Input
          id={`backup-${backup.id}-frequency`}
          className="font-mono"
          value={val('frequency', '')}
          onChange={(e) => set('frequency', e.target.value)}
        />
      </FormField>
      <FormField label="Local backups to keep" htmlFor={`backup-${backup.id}-retention`}>
        <Input
          id={`backup-${backup.id}-retention`}
          type="number"
          value={String(val('retentionAmountLocal', 7))}
          onChange={(e) => set('retentionAmountLocal', Number(e.target.value) || 0)}
        />
      </FormField>
      <FormField label="Entire instance" htmlFor={`backup-${backup.id}-dump-all`}>
        <div className="flex h-8 items-center gap-3">
          <Switch
            id={`backup-${backup.id}-dump-all`}
            checked={dumpAll}
            onCheckedChange={(c) => set('dumpAll', c)}
          />
          <span className="text-muted-foreground text-sm">
            {dumpAll ? 'All databases' : 'Configured database only'}
          </span>
        </div>
      </FormField>
      <FormField
        label="Upload to S3"
        htmlFor={`backup-${backup.id}-s3`}
        description={
          saveS3 && storages.length === 0 ? 'No S3 storages configured. Add one under Storages.' : undefined
        }
      >
        <div className="flex min-h-8 items-center gap-3">
          <Switch id={`backup-${backup.id}-s3`} checked={saveS3} onCheckedChange={(c) => set('saveS3', c)} />
          {saveS3 && (
            <SearchableSelect
              value={val('s3StorageId', '') ?? ''}
              onValueChange={(v) => set('s3StorageId', v)}
              placeholder="Select S3 storage"
              className="flex-1"
              options={storages.map((s) => ({ value: s.id, label: s.name }))}
            />
          )}
        </div>
      </FormField>

      <BackupExecutions serviceId={serviceId} backup={backup} />
    </FormSection>
  );
}

function formatBackupSize(size: string | null): string | null {
  if (!size) return null;
  const n = Number(size);
  if (!Number.isFinite(n) || n < 0) return null;
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function BackupExecutions({ serviceId, backup }: { serviceId: string; backup: ScheduledBackupItem }) {
  const {
    data,
    isPending: executionsPending,
    isError: executionsIsError,
    error: executionsError,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
  } = useInfiniteQuery({
    queryKey: ['backup-executions', backup.id],
    queryFn: ({ pageParam }) =>
      listBackupExecutions(serviceId, backup.id, {
        limit: 5,
        cursor: pageParam,
      }),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
    refetchInterval: 5000,
  });

  const items = data?.pages.flatMap((p) => p.items) ?? [];

  const restoreMut = useMutation({
    mutationFn: (filename: string) => restoreBackup(serviceId, filename),
    onSuccess: () => toast.success('Restore queued - the worker will apply it shortly'),
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Restore failed'),
  });

  const downloadMut = useMutation({
    mutationFn: (filename: string) => downloadBackup(serviceId, filename),
    onSuccess: () => toast.success('Download started'),
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Download failed'),
  });

  return (
    <div className="space-y-2">
      <div className="text-base font-medium">Previous backups ({backup._count.executions})</div>
      {executionsIsError ? (
        <Alert variant="destructive">
          <AlertDescription>{executionsError instanceof Error ? executionsError.message : 'Failed to load previous backups'}</AlertDescription>
        </Alert>
      ) : (
        <DataTable
          rows={items}
          rowKey={(e) => e.id}
          isLoading={executionsPending}
          emptyState={
            <p className="text-muted-foreground text-sm">
              No previous backups yet. Run “Backup now” to create one.
            </p>
          }
          columns={[
            {
              key: 'status',
              header: 'Status',
              cell: (e) => <StatusBadge status={e.status} />,
            },
            {
              key: 'details',
              header: 'Details',
              className: 'w-full max-w-0 whitespace-normal',
              cell: (e) => (
                <div className="min-w-0 space-y-1">
                  <div className="text-muted-foreground">
                    {[
                      e.dumpAll ? 'All databases' : e.databaseName,
                      e.s3Uploaded ? 'S3' : null,
                      formatBackupSize(e.size),
                    ]
                      .filter(Boolean)
                      .join(' · ') || '—'}
                  </div>
                  {e.filename && (
                    <div className="text-muted-foreground truncate font-mono text-sm">{e.filename}</div>
                  )}
                  {e.message && (
                    <pre className="text-muted-foreground max-h-32 overflow-auto font-mono text-sm whitespace-pre-wrap">
                      {e.message}
                    </pre>
                  )}
                </div>
              ),
            },
            {
              key: 'started',
              header: 'Started',
              cell: (e) => (
                <span className="text-muted-foreground">
                  <LocalDateTime value={e.startedAt} />
                </span>
              ),
            },
            {
              key: 'actions',
              header: <span className="sr-only">Actions</span>,
              align: 'right',
              cell: (e) =>
                e.filename && e.status === 'SUCCESS' ? (
                  <span className="inline-flex items-center justify-end gap-1.5">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={downloadMut.isPending}
                      onClick={() => downloadMut.mutate(e.filename!)}
                    >
                      <Download className="size-3.5" /> Download
                    </Button>
                    <ConfirmButton
                      onConfirm={() => restoreMut.mutate(e.filename!)}
                      title="Queue restore of this backup?"
                      description={
                        e.dumpAll
                          ? 'The restore will be queued and applied by the worker. All databases in this instance may be overwritten. This cannot be undone.'
                          : 'The restore will be queued and applied by the worker. Existing data in the database may be overwritten. This cannot be undone.'
                      }
                      confirmLabel="Queue restore"
                      variant="outline"
                      confirmVariant="default"
                      size="sm"
                      disabled={restoreMut.isPending}
                    >
                      Restore
                    </ConfirmButton>
                  </span>
                ) : null,
            },
          ]}
        />
      )}
      {hasNextPage ? (
        <Button
          size="sm"
          variant="outline"
          className="w-full"
          disabled={isFetchingNextPage}
          onClick={() => void fetchNextPage()}
        >
          {isFetchingNextPage ? 'Loading…' : 'Load more'}
        </Button>
      ) : null}
    </div>
  );
}
