'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { HardDrive, Trash2 } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { listVolumes, createVolume, deleteVolume } from '@/services/api/service';
import { FormField, FormSection } from '@/components/app/page';
import { DataTable } from '@/components/app/data-table';
import { EmptyState } from '@/components/app/empty-state';
import { ConfirmButton } from '@/components/app/confirm';

export function StorageSection({ serviceId }: { serviceId: string }) {
  const qc = useQueryClient();
  const { data: volumes, isPending: volumesPending, isError: volumesIsError, error: volumesError } = useQuery({
    queryKey: ['volumes', serviceId],
    queryFn: () => listVolumes(serviceId),
  });
  const [name, setName] = useState('');
  const [mountPath, setMountPath] = useState('');
  const invalidate = () => qc.invalidateQueries({ queryKey: ['volumes', serviceId] });

  const addMut = useMutation({
    mutationFn: () => createVolume(serviceId, { name, mountPath }),
    onSuccess: async () => {
      await invalidate();
      setName('');
      setMountPath('');
      toast.success('Volume added');
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed'),
  });
  const delMut = useMutation({
    mutationFn: (id: string) => deleteVolume(serviceId, id),
    onSuccess: invalidate,
  });

  return (
    <div className="space-y-4">
      {volumesIsError ? (
        <Alert variant="destructive">
          <AlertDescription>{volumesError instanceof Error ? volumesError.message : 'Failed to load volumes'}</AlertDescription>
        </Alert>
      ) : (
        <DataTable
          rows={volumes ?? []}
          rowKey={(v) => v.id}
          isLoading={volumesPending}
          emptyState={
            <EmptyState
              icon={HardDrive}
              title="No volumes"
              description="Persistent volumes keep data across deploys."
            />
          }
          columns={[
            { key: 'name', header: 'Name', cell: (v) => <span className="font-mono">{v.name}</span> },
            {
              key: 'mountPath',
              header: 'Mount path',
              cell: (v) => <span className="font-mono">{v.mountPath}</span>,
            },
            {
              key: 'actions',
              header: <span className="sr-only">Actions</span>,
              align: 'right',
              cell: (v) => (
                <ConfirmButton
                  size="sm"
                  onConfirm={() => delMut.mutate(v.id)}
                  title={`Delete volume ${v.name}?`}
                  description="The volume mapping is removed from the service configuration. Data on the server is not deleted automatically."
                >
                  <Trash2 className="size-3.5" /> Delete
                </ConfirmButton>
              ),
            },
          ]}
        />
      )}
      <FormSection
        title="Add persistent volume"
        footer={
          <Button size="sm" onClick={() => addMut.mutate()} disabled={!name || !mountPath || addMut.isPending}>
            Add volume
          </Button>
        }
      >
        <FormField label="Name" htmlFor="volume-name">
          <Input id="volume-name" placeholder="data" value={name} onChange={(e) => setName(e.target.value)} />
        </FormField>
        <FormField label="Mount path" htmlFor="volume-mount-path" description="Absolute path inside the container.">
          <Input
            id="volume-mount-path"
            className="font-mono"
            placeholder="/data"
            value={mountPath}
            onChange={(e) => setMountPath(e.target.value)}
          />
        </FormField>
      </FormSection>
    </div>
  );
}
