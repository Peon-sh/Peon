'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Store, ExternalLink } from 'lucide-react';
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
import { SearchableSelect } from '@/components/ui/searchable-select';
import {
  createServiceFromTemplate,
  listServers,
  listTemplates,
  type TemplateSummary,
} from '@/services/api/service';
import { useAuthStore } from '@/store/auth';
import { cn } from '@/lib/utils';

/**
 * One-click service marketplace: browse the vendored template catalog
 * (~330 services), pick one, choose a server, and deploy a pre-configured
 * compose stack with generated secrets and hostnames.
 */
export function TemplateMarketplaceDialog({ projectId }: { projectId: string }) {
  const qc = useQueryClient();
  const workspaceId = useAuthStore((s) => s.currentWorkspaceId);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('all');
  const [selected, setSelected] = useState<TemplateSummary | null>(null);
  const [name, setName] = useState('');
  const [serverId, setServerId] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['templates'],
    queryFn: () => listTemplates(),
    enabled: open,
    staleTime: 5 * 60_000,
  });

  const { data: servers } = useQuery({
    queryKey: ['servers', workspaceId],
    queryFn: () => listServers(workspaceId!),
    enabled: open && !!workspaceId,
  });

  const filtered = useMemo(() => {
    const templates = data?.templates ?? [];
    const q = search.toLowerCase().trim();
    return templates.filter((t) => {
      if (category !== 'all' && (t.category ?? '') !== category) return false;
      if (!q) return true;
      return `${t.slug} ${t.slogan} ${t.tags.join(' ')}`.toLowerCase().includes(q);
    });
  }, [data?.templates, search, category]);

  const createMut = useMutation({
    mutationFn: () =>
      createServiceFromTemplate(projectId, {
        slug: selected!.slug,
        name: name || undefined,
        serverId,
      }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['services', projectId] });
      toast.success(`${selected?.name} created from template`);
      setOpen(false);
      setSelected(null);
      setName('');
      setServerId('');
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed'),
  });

  return (
    <Modal
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) setSelected(null);
      }}
    >
      <ModalTrigger asChild>
        <Button variant="outline">
          <Store className="size-4" /> Marketplace
        </Button>
      </ModalTrigger>
      <ModalContent size="xl">
        <ModalHeader>
          <ModalTitle>Service marketplace</ModalTitle>
        </ModalHeader>
        <ModalBody>
          <ModalDescription className="mb-4">
            {data ? `${data.templates.length} one-click services.` : 'Loading catalog…'} Secrets and
            hostnames are generated automatically.
          </ModalDescription>

          {selected ? (
            <div className="space-y-3">
              <div className="border-border-bright rounded-lg border p-4">
                <div className="font-heading text-[13px] font-semibold">{selected.name}</div>
                <p className="text-muted-foreground mt-1 text-[12px]">{selected.slogan}</p>
                {selected.documentation && (
                  <a
                    href={selected.documentation}
                    target="_blank"
                    rel="noreferrer"
                    className="text-phosphor mt-2 inline-flex items-center gap-1 text-[11px] hover:underline"
                  >
                    documentation <ExternalLink className="size-3" />
                  </a>
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="tpl-name">Service name</Label>
                <Input
                  id="tpl-name"
                  placeholder={selected.slug}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Server</Label>
                <SearchableSelect
                  value={serverId}
                  onValueChange={setServerId}
                  placeholder="Select server"
                  options={(servers ?? []).map((s) => ({
                    value: s.id,
                    label: `${s.name} (${s.ip})`,
                    keywords: s.ip,
                  }))}
                />
                {!servers?.length && (
                  <p className="text-muted-foreground text-[11px]">
                    Add and validate a server before creating deployable services.
                  </p>
                )}
              </div>
            </div>
          ) : (
            <>
              <div className="mb-4 flex gap-2">
                <Input
                  placeholder="search services…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="min-w-0 flex-1"
                  autoFocus
                />
                <div className="w-48 shrink-0">
                  <SearchableSelect
                    value={category}
                    onValueChange={setCategory}
                    placeholder="Select category"
                    options={[
                      { value: 'all', label: 'all categories' },
                      ...(data?.categories ?? []).map((c) => ({ value: c, label: c })),
                    ]}
                  />
                </div>
              </div>

              <div className="-mx-1 min-h-0 px-1">
                {isLoading ? (
                  <div className="bg-accent h-40 animate-pulse rounded-lg" />
                ) : (
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {filtered.map((t) => (
                      <button
                        key={t.slug}
                        type="button"
                        onClick={() => setSelected(t)}
                        className={cn(
                          'border-border-bright hover:border-phosphor-dim hover:bg-secondary',
                          'rounded-lg border p-3 text-left transition-colors',
                        )}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-heading truncate text-[12.5px] font-semibold">
                            {t.name}
                          </span>
                          {t.category && (
                            <span className="text-muted-foreground shrink-0 text-[10px]">
                              {t.category}
                            </span>
                          )}
                        </div>
                        <p className="text-muted-foreground mt-1 line-clamp-2 text-[11px]">
                          {t.slogan}
                        </p>
                      </button>
                    ))}
                    {filtered.length === 0 && (
                      <p className="text-muted-foreground col-span-2 py-10 text-center text-[12px]">
                        no templates match “{search}”
                      </p>
                    )}
                  </div>
                )}
              </div>
            </>
          )}
        </ModalBody>
        {selected ? (
          <ModalFooter>
            <Button variant="ghost" onClick={() => setSelected(null)}>
              Back
            </Button>
            <Button onClick={() => createMut.mutate()} disabled={!serverId || createMut.isPending}>
              {createMut.isPending ? 'Creating…' : 'Create service'}
            </Button>
          </ModalFooter>
        ) : null}
      </ModalContent>
    </Modal>
  );
}
