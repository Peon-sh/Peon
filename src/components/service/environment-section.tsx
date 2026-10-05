'use client';

import { useState, type ReactNode } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import {
  listEnv,
  upsertEnv,
  deleteEnv,
  bulkSaveEnv,
  importPreviewEnvFromProduction,
} from '@/services/api/service';
import { Panel } from '@/components/app/page';
import { DataTable } from '@/components/app/data-table';
import { ConfirmButton } from '@/components/app/confirm';
import { AccessGateBanner } from '@/components/billing/access-gate-banner';
import { useCurrentWorkspaceAccess } from '@/lib/billing/workspace-access';
import { getProject } from '@/services/api/project';

export function EnvironmentSection({
  serviceId,
  projectId,
  onSettingsChanged,
}: {
  serviceId: string;
  projectId: string;
  onSettingsChanged: () => void;
}) {
  const qc = useQueryClient();
  const { data: vars } = useQuery({ queryKey: ['env', serviceId], queryFn: () => listEnv(serviceId) });
  const { data: project } = useQuery({
    queryKey: ['project', projectId],
    queryFn: () => getProject(projectId),
  });
  const access = useCurrentWorkspaceAccess({
    projectCanManage: project?.canManage,
  });
  // Manage requires project role + active plan. Gate before reveal/write API calls.
  const canWrite = !access.blocked && project?.canManage === true;

  const invalidate = () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: ['env', serviceId] }),
      qc.invalidateQueries({ queryKey: ['env-revealed', serviceId] }),
    ]);

  const delMut = useMutation({
    mutationFn: (id: string) => deleteEnv(serviceId, id),
    onSuccess: async () => {
      await invalidate();
      onSettingsChanged();
    },
  });

  const importMut = useMutation({
    mutationFn: () => importPreviewEnvFromProduction(serviceId),
    onSuccess: async (res) => {
      await invalidate();
      onSettingsChanged();
      toast.success(
        res.imported
          ? `Imported ${res.imported} production variable${res.imported === 1 ? '' : 's'} into preview`
          : 'No production variables to import',
      );
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Import failed'),
  });

  const productionVars = (vars ?? []).filter((v) => !v.isPreview);
  const previewVars = (vars ?? []).filter((v) => v.isPreview);

  const onChanged = () => {
    void invalidate();
    onSettingsChanged();
  };

  return (
    <div className="space-y-4">
      {access.blocked ? <AccessGateBanner reason={access.block} /> : null}
      <EnvSection
        title="Production"
        description="Used only by production deploys. The same key can exist in Preview with a different value."
        serviceId={serviceId}
        isPreview={false}
        vars={productionVars}
        canWrite={canWrite}
        onChanged={onChanged}
        onDelete={(id) => delMut.mutate(id)}
      />

      <EnvSection
        title="Preview"
        description="Used only by PR preview deploys. Import from production to copy keys, then change values as needed."
        serviceId={serviceId}
        isPreview
        vars={previewVars}
        canWrite={canWrite}
        onChanged={onChanged}
        onDelete={(id) => delMut.mutate(id)}
        headerExtra={
          <ConfirmButton
            onConfirm={() => importMut.mutate()}
            title="Import from production?"
            description="Copies all production variables into the preview set and overwrites any matching preview keys. Preview deployments only use the preview set — import if you want production values as a starting point. Preview-only keys that don’t exist in production are kept."
            confirmLabel="Import"
            variant="outline"
            confirmVariant="default"
            disabled={!canWrite || importMut.isPending || productionVars.length === 0}
          >
            Import from production
          </ConfirmButton>
        }
      />
    </div>
  );
}

function EnvSection({
  title,
  description,
  serviceId,
  isPreview,
  vars,
  canWrite,
  onChanged,
  onDelete,
  headerExtra,
}: {
  title: string;
  description: string;
  serviceId: string;
  isPreview: boolean;
  vars: Array<{
    id: string;
    key: string;
    value: string;
    isPreview: boolean;
    isBuildtime: boolean;
    isRuntime: boolean;
  }>;
  canWrite: boolean;
  onChanged: () => void;
  onDelete: (id: string) => void;
  headerExtra?: ReactNode;
}) {
  const [devMode, setDevMode] = useState(false);
  const [key, setKey] = useState('');
  const [value, setValue] = useState('');
  const [isBuildtime, setIsBuildtime] = useState(true);
  const [isRuntime, setIsRuntime] = useState(true);
  const [editingIds, setEditingIds] = useState<Set<string>>(() => new Set());
  const switchId = `dev-mode-${isPreview ? 'preview' : 'production'}`;

  const developerModeToggle = (
    <div className="flex shrink-0 items-center gap-2">
      <Label htmlFor={switchId} className="text-muted-foreground text-sm font-normal">
        Developer mode
      </Label>
      <Switch
        id={switchId}
        checked={devMode && canWrite}
        disabled={!canWrite}
        onCheckedChange={(checked) => {
          if (!canWrite) return;
          setDevMode(checked);
        }}
      />
    </div>
  );

  const headerActions = (
    <div className="flex flex-wrap items-center justify-end gap-2">
      {headerExtra}
      {developerModeToggle}
    </div>
  );

  const addMut = useMutation({
    mutationFn: () =>
      upsertEnv(serviceId, { key, value, isBuildtime, isRuntime, isPreview }),
    onSuccess: async () => {
      setKey('');
      setValue('');
      toast.success('Saved');
      onChanged();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed'),
  });

  if (devMode && canWrite) {
    return (
      <EnvDeveloperEditor
        title={title}
        serviceId={serviceId}
        isPreview={isPreview}
        canWrite={canWrite}
        actions={headerActions}
        onSaved={onChanged}
      />
    );
  }

  type EnvVar = (typeof vars)[number];
  const stopEditing = (id: string) =>
    setEditingIds((ids) => {
      const next = new Set(ids);
      next.delete(id);
      return next;
    });

  return (
    <Panel title={title} description={description} actions={headerActions} padded={false}>
      <div className="flex flex-wrap items-center gap-2 border-b p-4">
        <Input
          className="min-w-40 flex-1 font-mono"
          placeholder="KEY"
          aria-label="Key"
          value={key}
          disabled={!canWrite}
          onChange={(e) => setKey(e.target.value)}
        />
        <Input
          className="min-w-40 flex-1 font-mono"
          placeholder="value"
          aria-label="Value"
          value={value}
          disabled={!canWrite}
          onChange={(e) => setValue(e.target.value)}
        />
        <label className="flex items-center gap-2 text-base">
          <Switch checked={isBuildtime} disabled={!canWrite} onCheckedChange={setIsBuildtime} /> Build
        </label>
        <label className="flex items-center gap-2 text-base">
          <Switch checked={isRuntime} disabled={!canWrite} onCheckedChange={setIsRuntime} /> Runtime
        </label>
        <Button onClick={() => addMut.mutate()} disabled={!canWrite || !key || addMut.isPending}>
          Add {isPreview ? 'preview' : 'production'} variable
        </Button>
      </div>
      <DataTable<EnvVar>
        className="rounded-none border-0"
        rows={vars}
        rowKey={(v) => v.id}
        emptyState={
          <p className="text-muted-foreground p-6 text-center text-base">
            No {isPreview ? 'preview' : 'production'} variables.
          </p>
        }
        columns={[
          {
            key: 'key',
            header: 'Key',
            className: 'w-1/3',
            cell: (v) => (
              <span className="flex min-w-0 flex-wrap items-center gap-2">
                <span className="font-mono font-medium break-all">{v.key}</span>
                {v.isBuildtime && <Badge variant="secondary">Build</Badge>}
                {v.isRuntime && <Badge variant="secondary">Runtime</Badge>}
              </span>
            ),
          },
          {
            key: 'value',
            header: 'Value',
            cell: (v) => (
              <EnvValueCell
                serviceId={serviceId}
                env={v}
                canWrite={canWrite}
                editing={editingIds.has(v.id)}
                onDone={() => stopEditing(v.id)}
                onChanged={onChanged}
              />
            ),
          },
          {
            key: 'actions',
            header: <span className="sr-only">Actions</span>,
            align: 'right',
            className: 'w-40',
            cell: (v) =>
              canWrite && !editingIds.has(v.id) ? (
                <span className="inline-flex items-center justify-end gap-1.5">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setEditingIds((ids) => new Set(ids).add(v.id))}
                  >
                    Edit
                  </Button>
                  <ConfirmButton
                    size="sm"
                    onConfirm={() => onDelete(v.id)}
                    title={`Delete ${v.key}?`}
                    description="The variable will be removed from this service. A redeploy is required to apply."
                  >
                    <Trash2 className="size-3.5" /> Delete
                  </ConfirmButton>
                </span>
              ) : null,
          },
        ]}
      />
    </Panel>
  );
}

/**
 * Value cell of an env row: masked at rest, expands into an editable form
 * (Vercel-style) while its row is being edited.
 */
function EnvValueCell({
  serviceId,
  env,
  canWrite,
  editing,
  onDone,
  onChanged,
}: {
  serviceId: string;
  env: { id: string; key: string; value: string; isPreview: boolean; isBuildtime: boolean; isRuntime: boolean };
  canWrite: boolean;
  editing: boolean;
  onDone: () => void;
  onChanged: () => void;
}) {
  const [form, setForm] = useState<{ value: string; isBuildtime: boolean; isRuntime: boolean } | null>(null);

  // Fetch decrypted values only while a row is being edited (and writes are allowed).
  const {
    data: revealed,
    isLoading: revealLoading,
  } = useQuery({
    queryKey: ['env-revealed', serviceId],
    queryFn: () => listEnv(serviceId, true),
    enabled: editing && canWrite,
  });
  const revealedValue = revealed?.find((r) => r.id === env.id)?.value;
  // Derive the edit state lazily from the revealed value; `form` only holds
  // user modifications, avoiding a setState-in-effect.
  const effective =
    form ??
    (revealedValue !== undefined
      ? { value: revealedValue, isBuildtime: env.isBuildtime, isRuntime: env.isRuntime }
      : null);

  const saveMut = useMutation({
    mutationFn: () =>
      upsertEnv(serviceId, {
        key: env.key,
        value: effective?.value ?? '',
        isPreview: env.isPreview,
        isBuildtime: effective?.isBuildtime ?? env.isBuildtime,
        isRuntime: effective?.isRuntime ?? env.isRuntime,
      }),
    onSuccess: () => {
      onDone();
      setForm(null);
      onChanged();
      toast.success('Variable saved');
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed'),
  });

  if (editing && canWrite) {
    return (
      <div className="space-y-2">
        <Input
          className="font-mono"
          aria-label={`Value of ${env.key}`}
          value={effective?.value ?? ''}
          placeholder={revealLoading || effective === null ? 'Loading value…' : ''}
          disabled={revealLoading || effective === null}
          onChange={(e) => effective && setForm({ ...effective, value: e.target.value })}
        />
        <div className="flex flex-wrap items-center gap-4 text-base">
          <label className="flex items-center gap-2">
            <Switch
              checked={effective?.isBuildtime ?? env.isBuildtime}
              onCheckedChange={(c) => effective && setForm({ ...effective, isBuildtime: c })}
            />
            Build
          </label>
          <label className="flex items-center gap-2">
            <Switch
              checked={effective?.isRuntime ?? env.isRuntime}
              onCheckedChange={(c) => effective && setForm({ ...effective, isRuntime: c })}
            />
            Runtime
          </label>
          <div className="ml-auto flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                onDone();
                setForm(null);
              }}
            >
              Cancel
            </Button>
            <Button size="sm" onClick={() => saveMut.mutate()} disabled={effective === null || saveMut.isPending}>
              Save
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return <span className="text-muted-foreground block min-w-0 truncate font-mono">{env.value}</span>;
}

/**
 * Developer mode: the production or preview variable set as an editable
 * .env document. Saving replaces that set (missing keys are removed).
 */
function EnvDeveloperEditor({
  title,
  serviceId,
  isPreview,
  canWrite,
  onSaved,
  actions,
}: {
  title: string;
  serviceId: string;
  isPreview: boolean;
  canWrite: boolean;
  onSaved: () => void;
  actions?: ReactNode;
}) {
  const [raw, setRaw] = useState<string | null>(null);
  const { data: revealed } = useQuery({
    queryKey: ['env-revealed', serviceId],
    queryFn: () => listEnv(serviceId, true),
    enabled: canWrite,
  });

  // Derive the initial document from the revealed vars; `raw` only holds
  // user edits, avoiding a setState-in-effect.
  const doc =
    raw ??
    (revealed
      ? revealed
          .filter((v) => v.isPreview === isPreview)
          .map((v) => `${v.key}=${v.value}`)
          .join('\n')
      : null);

  const saveMut = useMutation({
    mutationFn: () => bulkSaveEnv(serviceId, doc ?? '', isPreview),
    onSuccess: (res) => {
      setRaw(null);
      onSaved();
      toast.success(`Saved ${res.saved} variable${res.saved === 1 ? '' : 's'}${res.deleted ? `, removed ${res.deleted}` : ''}`);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed'),
  });

  return (
    <Panel
      title={title}
      actions={actions}
      contentClassName="space-y-2"
      footer={
        <Button
          size="sm"
          onClick={() => saveMut.mutate()}
          disabled={!canWrite || doc === null || saveMut.isPending}
        >
          Save all
        </Button>
      }
    >
      <p className="text-muted-foreground text-sm">
        Edit {isPreview ? 'preview' : 'production'} variables as one .env document (KEY=value per line, #
        comments ignored). Saving replaces this set — variables removed here are deleted.
      </p>
      <Textarea
        className="max-h-[60vh] min-h-72 overflow-y-auto font-mono text-sm break-all [field-sizing:fixed]"
        value={doc ?? ''}
        placeholder={doc === null ? 'Loading variables…' : 'KEY=value'}
        disabled={!canWrite || doc === null}
        onChange={(e) => setRaw(e.target.value)}
        spellCheck={false}
      />
    </Panel>
  );
}
