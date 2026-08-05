'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Loader2, Rocket, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { listActiveDeployments, type ActiveDeploymentItem } from '@/services/api/deployment';
import { useAuthStore } from '@/store/auth';
import { cn } from '@/lib/utils';

function statusLabel(status: ActiveDeploymentItem['status']) {
  return status === 'QUEUED' ? 'Queued' : 'Deploying';
}

const EMPTY_ACTIVE: ActiveDeploymentItem[] = [];

/**
 * Workspace-wide list of queued / in-progress deployments.
 * Polls while active; dismiss hides until a new deployment id appears.
 */
export function ActiveDeploymentsToast() {
  const workspaceId = useAuthStore((s) => s.currentWorkspaceId);
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(() => new Set());
  const [hidden, setHidden] = useState(false);
  const [tracked, setTracked] = useState<{ activeKey: string; knownIds: string[] }>({
    activeKey: '',
    knownIds: [],
  });

  const { data } = useQuery({
    queryKey: ['active-deployments', workspaceId],
    queryFn: () => listActiveDeployments(workspaceId!),
    enabled: !!workspaceId,
    refetchInterval: (query) => {
      const list = query.state.data;
      if (list && list.length > 0) return 2_000;
      return 8_000;
    },
  });
  const active = data ?? EMPTY_ACTIVE;
  const activeKey = active.map((d) => d.id).join(',');

  if (activeKey !== tracked.activeKey) {
    if (!activeKey) {
      setTracked({ activeKey, knownIds: [] });
      setHidden((current) => (current ? false : current));
      setDismissedIds((prev) => (prev.size === 0 ? prev : new Set()));
    } else {
      const nextIds = activeKey.split(',');
      const hasNew = nextIds.some((id) => !tracked.knownIds.includes(id));
      setTracked({ activeKey, knownIds: nextIds });
      if (hasNew) setHidden(false);
    }
  }

  const visible = active.filter((d) => !dismissedIds.has(d.id));

  if (!workspaceId || hidden || visible.length === 0) return null;

  return (
    <div
      className={cn(
        'pointer-events-auto w-full max-w-sm overflow-hidden rounded-lg border bg-card shadow-lg',
        'animate-in slide-in-from-bottom-4 fade-in duration-200',
      )}
      role="status"
      aria-live="polite"
    >
      <div className="flex items-center justify-between gap-2 border-b px-4 py-2.5">
        <div className="flex min-w-0 items-center gap-2">
          <Loader2 className="text-phosphor size-3.5 shrink-0 animate-spin" />
          <p className="truncate text-[13px] font-semibold">
            {visible.length === 1 ? 'Deployment running' : `${visible.length} deployments running`}
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="text-muted-foreground size-7 shrink-0 p-0"
          onClick={() => {
            setHidden(true);
            setDismissedIds(new Set(active.map((d) => d.id)));
          }}
          aria-label="Dismiss"
        >
          <X className="size-3.5" />
        </Button>
      </div>
      <ul className="max-h-64 divide-y overflow-y-auto">
        {visible.map((d) => (
          <li key={d.id}>
            <Link
              href={`/projects/${d.project.id}/services/${d.service.id}/deployments/${d.id}`}
              className="hover:bg-secondary flex items-start gap-3 px-4 py-3 transition-colors"
            >
              <div className="bg-phosphor/15 text-phosphor mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md">
                <Rocket className="size-3.5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[12.5px] font-medium">
                  {d.project.name}
                  <span className="text-muted-foreground font-normal"> / </span>
                  {d.service.name}
                </p>
                <p className="text-muted-foreground mt-0.5 truncate text-[11.5px]">
                  {statusLabel(d.status)}
                  {d.commitSha ? ` · ${d.commitSha.slice(0, 7)}` : ''}
                  {d.isPreview ? ' · preview' : ''}
                </p>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
