'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Database, Trash2 } from 'lucide-react';
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
import { Label } from '@/components/ui/label';
import { PageContainer } from '@/components/app/page';
import { EmptyState } from '@/components/app/empty-state';
import { ConfirmButton } from '@/components/app/confirm';
import { useAuthStore } from '@/store/auth';
import {
  listStorages,
  createStorage,
  deleteStorage,
  testStorage,
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
  const [form, setForm] = useState<CreateStoragePayload>(EMPTY);

  const { data: storages, isLoading } = useQuery({
    queryKey: ['storages', wsId],
    queryFn: () => listStorages(wsId),
    enabled: !!wsId,
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ['storages', wsId] });
  const set = (k: keyof CreateStoragePayload, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const createMut = useMutation({
    mutationFn: () => createStorage(wsId, form),
    onSuccess: async () => {
      await invalidate();
      setOpen(false);
      setForm(EMPTY);
      toast.success('Storage created');
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
    <Modal open={open} onOpenChange={setOpen}>
      <ModalContent>
        <ModalHeader>
          <ModalTitle>Create S3 storage</ModalTitle>
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
            <div key={k} className="space-y-2">
              <Label htmlFor={`st-${k}`}>{label}</Label>
              <Input
                id={`st-${k}`}
                type={k === 'secretKey' ? 'password' : 'text'}
                value={(form[k] as string) ?? ''}
                onChange={(e) => set(k, e.target.value)}
              />
            </div>
          ))}
        </ModalBody>
        <ModalFooter>
          <Button
            onClick={() => createMut.mutate()}
            disabled={
              !form.name ||
              !form.bucket ||
              !form.accessKey ||
              !form.secretKey ||
              createMut.isPending
            }
          >
            Create
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );

  return (
    <PageContainer>
      {createDialog}

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="bg-accent h-40 animate-pulse rounded-lg" />
          ))}
        </div>
      ) : !storages?.length ? (
        <EmptyState
          icon={Database}
          title="No storages yet"
          description="add an s3-compatible bucket to store backups and assets."
          action={
            <Button onClick={() => setOpen(true)}>
              <Plus className="size-4" /> New storage
            </Button>
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {storages.map((s) => (
            <div
              key={s.id}
              className="bg-card hover:border-border-bright hover:bg-secondary flex h-full flex-col overflow-hidden rounded-lg border transition-colors"
            >
              <div className="flex items-start gap-3 p-4">
                <span className="border-border-bright bg-secondary text-phosphor grid size-9 shrink-0 place-items-center rounded-md border">
                  <Database className="size-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[12.5px] font-semibold">{s.name}</p>
                  <p className="text-muted-foreground truncate text-[11px]">{s.bucket}</p>
                  <p className="text-muted-foreground text-[11px]">{s.region}</p>
                </div>
              </div>
              <div className="bg-secondary mt-auto flex items-center justify-end gap-2 border-t px-4 py-2.5">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => testMut.mutate(s.id)}
                  disabled={testMut.isPending}
                >
                  Test
                </Button>
                <ConfirmButton
                  title={`Delete storage "${s.name}"?`}
                  description="Removes this S3 connection from Peon. Existing backups that reference it may fail until reassigned."
                  confirmLabel="Delete"
                  size="sm"
                  disabled={deleteMut.isPending}
                  onConfirm={() => deleteMut.mutate(s.id)}
                >
                  <Trash2 className="size-4" /> Delete
                </ConfirmButton>
              </div>
            </div>
          ))}
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="border-border-bright text-muted-foreground hover:text-phosphor hover:border-phosphor-dim grid min-h-40 place-items-center rounded-lg border border-dashed transition-colors"
          >
            <span className="flex flex-col items-center gap-2 text-[12.5px]">
              <Plus className="size-4" /> new storage
            </span>
          </button>
        </div>
      )}
    </PageContainer>
  );
}
