'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Database, Pencil, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalTitle,
} from '@/components/app/modal';
import { Input } from '@/components/ui/input';
import { FormField, PageContainer, PageHeader } from '@/components/app/page';
import { DataTable } from '@/components/app/data-table';
import { EmptyState } from '@/components/app/empty-state';
import { ConfirmButton } from '@/components/app/confirm';
import { useAuthStore } from '@/store/auth';
import {
  listStorages,
  getStorage,
  createStorage,
  updateStorage,
  deleteStorage,
  testStorage,
  type Storage,
  type CreateStoragePayload,
} from '@/services/api/storages';

const EMPTY: CreateStoragePayload = {
  name: '',
  region: 'us-east-1',
  endpoint: '',
  bucket: '',
  accessKey: '',
  secretKey: '',
};

export default function StoragesPage() {
  const { currentWorkspaceId } = useAuthStore();
  const wsId = currentWorkspaceId!;
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loadingStorageId, setLoadingStorageId] = useState<string | null>(null);
  const [form, setForm] = useState<CreateStoragePayload>({ ...EMPTY });

  const { data: storages, isLoading } = useQuery({
    queryKey: ['storages', wsId],
    queryFn: () => listStorages(wsId),
    enabled: !!wsId,
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ['storages', wsId] });
  const set = (k: keyof CreateStoragePayload, v: string) => setForm((f) => ({ ...f, [k]: v }));
  const isEditing = editingId !== null;

  const resetForm = () => {
    setEditingId(null);
    setLoadingStorageId(null);
    setForm({ ...EMPTY });
  };

  const openCreate = () => {
    resetForm();
    setOpen(true);
  };

  const openEdit = async (storage: Storage) => {
    setEditingId(storage.id);
    setForm({
      name: storage.name,
      region: storage.region,
      endpoint: storage.endpoint ?? '',
      bucket: storage.bucket,
      accessKey: '',
      secretKey: '',
    });
    setOpen(true);
    setLoadingStorageId(storage.id);

    try {
      const details = await getStorage(storage.id);
      setForm({
        name: details.name,
        region: details.region,
        endpoint: details.endpoint ?? '',
        bucket: details.bucket,
        accessKey: details.accessKey,
        secretKey: '',
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load storage');
      setOpen(false);
      resetForm();
    } finally {
      setLoadingStorageId((id) => (id === storage.id ? null : id));
    }
  };

  const createMut = useMutation({
    mutationFn: () => createStorage(wsId, form),
    onSuccess: async () => {
      await invalidate();
      setOpen(false);
      resetForm();
      toast.success('Storage created');
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed'),
  });

  const updateMut = useMutation({
    mutationFn: () => {
      if (!editingId) {
        throw new Error('No storage selected');
      }
      return updateStorage(editingId, {
        name: form.name,
        region: form.region,
        endpoint: form.endpoint || null,
        bucket: form.bucket,
        accessKey: form.accessKey,
        ...(form.secretKey ? { secretKey: form.secretKey } : {}),
      });
    },
    onSuccess: async () => {
      await invalidate();
      setOpen(false);
      resetForm();
      toast.success('Storage updated');
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed'),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteStorage(id),
    onSuccess: async () => {
      await invalidate();
      toast.success('Storage deleted');
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed'),
  });

  const testMut = useMutation({
    mutationFn: (id: string) => testStorage(id),
    onSuccess: (res) =>
      res.reachable ? toast.success('Bucket reachable') : toast.error(res.error ?? 'Unreachable'),
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed'),
  });

  const createDialog = (
    <Modal
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) resetForm();
      }}
    >
      <ModalContent>
        <ModalHeader>
          <ModalTitle>{isEditing ? 'Edit S3 storage' : 'Add S3 storage'}</ModalTitle>
        </ModalHeader>
        <ModalBody className="space-y-4">
          {(
            [
              ['name', 'Name'],
              ['endpoint', 'Endpoint (optional)'],
              ['region', 'Region'],
              ['bucket', 'Bucket'],
              ['accessKey', 'Access key'],
              ['secretKey', 'Secret key'],
            ] as const
          ).map(([k, label]) => (
            <FormField
              key={k}
              label={isEditing && k === 'secretKey' ? 'Secret key (replace)' : label}
              htmlFor={`st-${k}`}
              className="lg:grid-cols-1 lg:gap-2"
              description={
                k === 'endpoint'
                  ? 'Leave blank for Amazon S3. For MinIO, paste its URL (for example http://192.168.1.10:9000). Localhost and cloud-metadata addresses are blocked.'
                  : isEditing && k === 'secretKey'
                    ? 'Leave this blank unless you want to replace the stored secret key.'
                    : undefined
              }
            >
              <Input
                id={`st-${k}`}
                type={k === 'secretKey' ? 'password' : 'text'}
                placeholder={
                  isEditing && k === 'secretKey'
                    ? 'Leave blank to keep the current secret key'
                    : undefined
                }
                value={(form[k] as string) ?? ''}
                onChange={(e) => set(k, e.target.value)}
                disabled={isEditing && loadingStorageId === editingId && k === 'accessKey'}
              />
            </FormField>
          ))}
        </ModalBody>
        <ModalFooter>
          <Button
            onClick={() => (isEditing ? updateMut.mutate() : createMut.mutate())}
            disabled={
              !form.name ||
              !form.bucket ||
              !form.accessKey ||
              (!isEditing && !form.secretKey) ||
              createMut.isPending ||
              updateMut.isPending ||
              (isEditing && loadingStorageId === editingId)
            }
          >
            {isEditing ? 'Save changes' : 'Add storage'}
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );

  const addButton = (
    <Button onClick={openCreate}>
      <Plus className="size-4" /> Add storage
    </Button>
  );

  return (
    <PageContainer>
      {createDialog}
      <PageHeader
        title="Storage"
        description="S3-compatible buckets for backups"
        actions={addButton}
      />

      <DataTable
        columns={[
          { key: 'name', header: 'Name', cell: (s) => <span className="font-medium">{s.name}</span> },
          { key: 'bucket', header: 'Bucket', cell: (s) => <span className="font-mono">{s.bucket}</span> },
          {
            key: 'region',
            header: 'Region',
            cell: (s) => <span className="text-muted-foreground font-mono">{s.region}</span>,
          },
          {
            key: 'actions',
            header: '',
            align: 'right',
            cell: (s) => (
              <div className="flex items-center justify-end gap-2">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => openEdit(s)}
                  disabled={loadingStorageId === s.id}
                >
                  <Pencil className="size-4" /> Edit
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => testMut.mutate(s.id)}
                  disabled={testMut.isPending}
                >
                  Test
                </Button>
                <ConfirmButton
                  title={`Delete storage "${s.name}"?`}
                  description="Removes this S3 connection from Peon. Existing backups that reference it may fail until reassigned."
                  confirmLabel="Delete"
                  variant="ghost"
                  disabled={deleteMut.isPending}
                  onConfirm={() => deleteMut.mutate(s.id)}
                >
                  <Trash2 className="size-4" /> Delete
                </ConfirmButton>
              </div>
            ),
          },
        ]}
        rows={storages ?? []}
        rowKey={(s) => s.id}
        isLoading={isLoading}
        emptyState={
          <EmptyState
            icon={Database}
            title="No storage yet"
            description="Add an S3-compatible bucket to store backups and assets."
            action={addButton}
          />
        }
      />
    </PageContainer>
  );
}
