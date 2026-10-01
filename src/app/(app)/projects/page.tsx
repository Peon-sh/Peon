'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, FolderKanban } from 'lucide-react';
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
import { Textarea } from '@/components/ui/textarea';
import { FormField, PageContainer, PageHeader } from '@/components/app/page';
import { DataTable } from '@/components/app/data-table';
import { LocalDateTime } from '@/components/app/local-datetime';
import { EmptyState } from '@/components/app/empty-state';
import { PlanPaywallDialog } from '@/components/billing/plan-paywall-dialog';
import { currentWorkspace, useAuthStore } from '@/store/auth';
import { listProjects, createProject } from '@/services/api/project';
import { getBillingSummary } from '@/services/api/billing';
import { publicEnv } from '@/lib/env';

export default function ProjectsPage() {
  const { currentWorkspaceId } = useAuthStore();
  const workspace = currentWorkspace();
  const roleCanCreate = workspace?.role === 'OWNER' || workspace?.role === 'ADMIN';
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [paywallOpen, setPaywallOpen] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');

  const { data: billing } = useQuery({
    queryKey: ['billing', currentWorkspaceId],
    queryFn: () => getBillingSummary(currentWorkspaceId!),
    enabled: !!currentWorkspaceId && publicEnv.billingEnabled,
  });

  const billingBlocksCreate =
    publicEnv.billingEnabled && billing && !billing.canCreateProject;
  const showPaywallInstead = roleCanCreate && !!billingBlocksCreate;

  const { data: projects, isLoading } = useQuery({
    queryKey: ['projects', currentWorkspaceId],
    queryFn: () => listProjects(currentWorkspaceId!),
    enabled: !!currentWorkspaceId,
  });

  const createMut = useMutation({
    mutationFn: () => createProject(currentWorkspaceId!, { name, description }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['projects', currentWorkspaceId] });
      await qc.invalidateQueries({ queryKey: ['billing', currentWorkspaceId] });
      setOpen(false);
      setName('');
      setDescription('');
      toast.success('Project created');
    },
    onError: (e) => {
      const msg = e instanceof Error ? e.message : 'Failed';
      toast.error(msg);
      if (msg.toLowerCase().includes('peon pro') || msg.toLowerCase().includes('seat')) {
        setOpen(false);
        setPaywallOpen(true);
      }
    },
  });

  const onNewProject = () => {
    if (showPaywallInstead) {
      setPaywallOpen(true);
      return;
    }
    setOpen(true);
  };

  const createDialog = (
    <Modal open={open} onOpenChange={setOpen}>
      <ModalContent>
        <ModalHeader>
          <ModalTitle>Create project</ModalTitle>
        </ModalHeader>
        <ModalBody className="space-y-4">
          <FormField label="Name" htmlFor="p-name" className="lg:grid-cols-1 lg:gap-2">
            <Input
              id="p-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="my-awesome-app"
            />
          </FormField>
          <FormField label="Description" htmlFor="p-desc" className="lg:grid-cols-1 lg:gap-2">
            <Textarea
              id="p-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What lives in this project?"
            />
          </FormField>
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
      {currentWorkspaceId && (
        <PlanPaywallDialog
          open={paywallOpen}
          onOpenChange={setPaywallOpen}
          workspaceId={currentWorkspaceId}
          reason={billing?.entitled ? 'seats' : 'subscribe'}
        />
      )}

      <PageHeader
        title="Projects"
        description="Groups of deployable services"
        actions={
          roleCanCreate ? (
            <Button onClick={onNewProject}>
              <Plus className="size-4" />{' '}
              {showPaywallInstead ? 'Subscribe to create' : 'New project'}
            </Button>
          ) : undefined
        }
      />

      <DataTable
        columns={[
          {
            key: 'name',
            header: 'Name',
            cell: (p) => (
              <span className="flex min-w-0 flex-col">
                <span className="truncate font-medium">{p.name}</span>
                {p.description ? (
                  <span className="text-muted-foreground line-clamp-1 text-sm">{p.description}</span>
                ) : null}
              </span>
            ),
          },
          {
            key: 'services',
            header: 'Services',
            align: 'right',
            cell: (p) => <span className="font-mono">{p._count.services}</span>,
          },
          {
            key: 'updated',
            header: 'Created',
            cell: (p) => <LocalDateTime value={p.createdAt} />,
          },
        ]}
        rows={projects ?? []}
        rowKey={(p) => p.id}
        rowHref={(p) => `/projects/${p.id}`}
        isLoading={isLoading}
        emptyState={
          <EmptyState
            icon={FolderKanban}
            title="No projects yet"
            description="Create a project to group services that deploy together."
            action={
              roleCanCreate ? (
                <Button onClick={onNewProject}>
                  <Plus className="size-4" />{' '}
                  {showPaywallInstead ? 'Subscribe to create' : 'New project'}
                </Button>
              ) : undefined
            }
          />
        }
      />
    </PageContainer>
  );
}
