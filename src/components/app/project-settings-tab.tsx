'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Modal,
  ModalBody,
  ModalContent,
  ModalDescription,
  ModalFooter,
  ModalHeader,
  ModalTitle,
  ModalTrigger,
} from '@/components/app/modal';
import { Panel, Section } from '@/components/app/page';
import { deleteProject, updateProject } from '@/services/api/project';
import { useAuthStore } from '@/store/auth';

export type ProjectSettingsData = {
  id: string;
  name: string;
  description: string | null;
  _count: { services: number };
  services?: Array<{ id: string; name: string }>;
};

export function ProjectSettingsTab({
  project,
  canManage,
}: {
  project: ProjectSettingsData;
  canManage: boolean;
}) {
  const router = useRouter();
  const qc = useQueryClient();
  const workspaceId = useAuthStore((s) => s.currentWorkspaceId);
  const [name, setName] = useState(project.name);
  const [description, setDescription] = useState(project.description ?? '');
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [confirmName, setConfirmName] = useState('');

  const saveMut = useMutation({
    mutationFn: () =>
      updateProject(project.id, {
        name: name.trim(),
        description: description.trim() || null,
      }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['project', project.id] });
      await qc.invalidateQueries({ queryKey: ['projects', workspaceId] });
      toast.success('Project settings saved');
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed'),
  });

  const deleteMut = useMutation({
    mutationFn: () => deleteProject(project.id),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['projects', workspaceId] });
      toast.success('Project deleted');
      router.push('/projects');
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed'),
  });

  const services = project.services ?? [];
  const serviceCount = project._count.services;
  const hasServices = serviceCount > 0;
  const nameMatches = confirmName.trim() === project.name;

  return (
    <div className="space-y-6">
      <Section title="general" description="name and description for this project">
        <Panel
          contentClassName="space-y-4 p-4"
          footer={
            canManage ? (
              <Button
                size="sm"
                onClick={() => saveMut.mutate()}
                disabled={!name.trim() || saveMut.isPending}
              >
                Save changes
              </Button>
            ) : (
              <p className="text-muted-foreground w-full text-left text-[11px]">
                You need project manage access to edit these settings.
              </p>
            )
          }
        >
          <div className="space-y-2">
            <Label htmlFor="project-name">Name</Label>
            <Input
              id="project-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={!canManage}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="project-description">Description</Label>
            <Input
              id="project-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={!canManage}
            />
          </div>
        </Panel>
      </Section>

      {canManage ? (
        <Panel
          title={<span className="text-destructive">danger zone</span>}
          className="border-destructive/40"
          contentClassName="space-y-4 p-4"
          footer={
            <Modal
              open={deleteOpen}
              onOpenChange={(open) => {
                setDeleteOpen(open);
                if (!open) setConfirmName('');
              }}
            >
              <ModalTrigger asChild>
                <Button size="sm" variant="destructive" disabled={hasServices}>
                  <Trash2 className="size-4" /> Delete project
                </Button>
              </ModalTrigger>
              <ModalContent size="sm">
                <ModalHeader>
                  <ModalTitle>Delete &quot;{project.name}&quot;?</ModalTitle>
                </ModalHeader>
                <ModalBody>
                  {hasServices ? (
                    <ModalDescription>
                      Remove all services first. This project still has {serviceCount} service
                      {serviceCount === 1 ? '' : 's'}.
                    </ModalDescription>
                  ) : (
                    <>
                      <ModalDescription>
                        This permanently deletes the project. Type the project name to confirm.
                      </ModalDescription>
                      <div className="mt-4 space-y-2">
                        <Label htmlFor="confirm-project-name">Project name</Label>
                        <Input
                          id="confirm-project-name"
                          value={confirmName}
                          onChange={(e) => setConfirmName(e.target.value)}
                          placeholder={project.name}
                          autoComplete="off"
                        />
                      </div>
                    </>
                  )}
                </ModalBody>
                <ModalFooter>
                  <Button type="button" variant="outline" onClick={() => setDeleteOpen(false)}>
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    variant="destructive"
                    disabled={hasServices || !nameMatches || deleteMut.isPending}
                    onClick={() => deleteMut.mutate()}
                  >
                    Delete project
                  </Button>
                </ModalFooter>
              </ModalContent>
            </Modal>
          }
        >
          <div className="space-y-2">
            <p className="text-[12.5px] font-semibold">Delete this project</p>
            {hasServices ? (
              <div className="space-y-2">
                <p className="text-muted-foreground text-[12px]">
                  Delete or move these services before you can delete the project:
                </p>
                <ul className="text-muted-foreground list-inside list-disc text-[12px]">
                  {services.map((s) => (
                    <li key={s.id}>{s.name}</li>
                  ))}
                  {services.length === 0 && serviceCount > 0 ? (
                    <li>
                      {serviceCount} service{serviceCount === 1 ? '' : 's'}
                    </li>
                  ) : null}
                </ul>
              </div>
            ) : (
              <p className="text-muted-foreground text-[12px]">
                Permanently deletes the project. This cannot be undone.
              </p>
            )}
          </div>
        </Panel>
      ) : null}
    </div>
  );
}
