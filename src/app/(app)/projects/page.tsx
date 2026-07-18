'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, FolderKanban, Boxes, ArrowRight } from 'lucide-react';
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
import { Textarea } from '@/components/ui/textarea';
import { PageContainer } from '@/components/app/page';
import { EmptyState } from '@/components/app/empty-state';
import { currentWorkspace, useAuthStore } from '@/store/auth';
import { listProjects, createProject } from '@/services/api/project';

export default function ProjectsPage() {
  const { currentWorkspaceId } = useAuthStore();
  const workspace = currentWorkspace();
  const canCreateProject = workspace?.role === 'OWNER' || workspace?.role === 'ADMIN';
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');

  const { data: projects, isLoading } = useQuery({
    queryKey: ['projects', currentWorkspaceId],
    queryFn: () => listProjects(currentWorkspaceId!),
    enabled: !!currentWorkspaceId,
  });

  const createMut = useMutation({
    mutationFn: () => createProject(currentWorkspaceId!, { name, description }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['projects', currentWorkspaceId] });
      setOpen(false);
      setName('');
      setDescription('');
      toast.success('Project created');
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed'),
  });

  const createDialog = (
    <Modal open={open} onOpenChange={setOpen}>
      <ModalContent>
        <ModalHeader>
          <ModalTitle>Create project</ModalTitle>
        </ModalHeader>
        <ModalBody className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="p-name">Name</Label>
            <Input id="p-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="my-awesome-app" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="p-desc">Description</Label>
            <Textarea
              id="p-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What lives in this project?"
            />
          </div>
        </ModalBody>
        <ModalFooter>
          <Button onClick={() => createMut.mutate()} disabled={!name || createMut.isPending}>
            {createMut.isPending ? 'Creating…' : 'Create project'}
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
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="bg-accent h-40 animate-pulse rounded-lg" />
          ))}
        </div>
      ) : !projects?.length ? (
        <EmptyState
          icon={FolderKanban}
          title="No projects yet"
          description="projects group your apps, databases, and services. create your first one to get started."
          action={
            canCreateProject ? (
              <Button onClick={() => setOpen(true)}>
                <Plus className="size-4" /> New project
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((p) => (
            <Link key={p.id} href={`/projects/${p.id}`} className="group">
              <div className="bg-card hover:border-border-bright hover:bg-secondary flex h-full flex-col rounded-lg border p-4 transition-colors">
                <div className="flex items-start justify-between gap-3">
                  <span className="border-border-bright bg-secondary text-phosphor grid size-9 place-items-center rounded-md border">
                    <FolderKanban className="size-4" />
                  </span>
                  <ArrowRight className="text-faint size-4 transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
                </div>
                <div className="mt-3 space-y-1">
                  <p className="font-heading truncate font-bold">{p.name}</p>
                  <p className="text-muted-foreground line-clamp-2 text-[11px]">
                    {p.description || 'no description'}
                  </p>
                </div>
                <div className="text-muted-foreground border-border-bright mt-auto flex items-center gap-1.5 border-t border-dashed pt-3 text-[11px]">
                  <Boxes className="size-3.5" />
                  <span>
                    <b className="text-foreground">{p._count.services}</b>{' '}
                    {p._count.services === 1 ? 'service' : 'services'}
                  </span>
                </div>
              </div>
            </Link>
          ))}
          {canCreateProject ? (
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="border-border-bright text-muted-foreground hover:text-phosphor hover:border-phosphor-dim grid min-h-40 place-items-center rounded-lg border border-dashed transition-colors"
            >
              <span className="flex flex-col items-center gap-2 text-[12.5px]">
                <Plus className="size-4" /> new project
              </span>
            </button>
          ) : null}
        </div>
      )}
    </PageContainer>
  );
}
