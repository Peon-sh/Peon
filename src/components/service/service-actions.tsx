'use client';

import { useQuery } from '@tanstack/react-query';
import { Play, Square, RotateCw, Rocket, RefreshCw, PauseCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ConfirmButton } from '@/components/app/confirm';
import { type ServiceDetail, type ServiceControlAction } from '@/services/api/service';
import { listDeployments } from '@/services/api/deployment';

/**
 * Deploy / control buttons for the service page header. Gating is the same as
 * the overview panel had: suspended services only offer Resume, running ones
 * Stop / Restart / Suspend, and Start appears once a production deploy exists.
 */
export function ServiceActions({
  svc,
  onDeploy,
  onForceDeploy,
  onControl,
  busy,
}: {
  svc: ServiceDetail;
  onDeploy: () => void;
  onForceDeploy: () => void;
  onControl: (action: ServiceControlAction) => void;
  busy: boolean;
}) {
  const { data: deployments } = useQuery({
    queryKey: ['deployments', svc.id],
    queryFn: () => listDeployments(svc.id),
  });
  const hasDeployment = !!deployments?.find((d) => !d.isPreview && d.status === 'FINISHED');
  // Status alone, not suspendedAt: the optimistic cache patch after a control
  // action only updates status (see OverviewSection).
  const isSuspended = svc.status === 'SUSPENDED';
  const isRunning = !isSuspended && ['RUNNING', 'STARTING'].includes(svc.status);

  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      {isSuspended ? (
        <Button variant="outline" onClick={() => onControl('resume')} disabled={busy}>
          <Play className="size-3.5" /> Resume
        </Button>
      ) : isRunning ? (
        <>
          <Button variant="outline" onClick={() => onControl('stop')} disabled={busy}>
            <Square className="size-3.5" /> Stop
          </Button>
          <Button variant="outline" onClick={() => onControl('restart')} disabled={busy}>
            <RotateCw className="size-3.5" /> Restart
          </Button>
          <ConfirmButton
            variant="outline"
            confirmVariant="default"
            confirmLabel="Suspend"
            title="Suspend this service?"
            description="Containers stop and stay stopped. Deploys, git webhooks, scheduled tasks, and backups are paused until you resume. Configuration, domains, and volumes are kept."
            onConfirm={() => onControl('suspend')}
            disabled={busy}
          >
            <PauseCircle className="size-3.5" /> Suspend
          </ConfirmButton>
        </>
      ) : hasDeployment ? (
        <Button variant="outline" onClick={() => onControl('start')} disabled={busy}>
          <Play className="size-3.5" /> Start
        </Button>
      ) : null}
      <Button
        variant="outline"
        onClick={onForceDeploy}
        disabled={busy || isSuspended}
        title={
          isSuspended
            ? 'Resume the service before deploying'
            : 'Clear cached source and rebuild without Docker/Nixpacks cache'
        }
      >
        <RefreshCw className="size-3.5" /> Force rebuild
      </Button>
      <Button
        onClick={onDeploy}
        disabled={busy || isSuspended}
        title={isSuspended ? 'Resume the service before deploying' : undefined}
      >
        <Rocket className="size-3.5" /> {hasDeployment ? 'Redeploy' : 'Deploy now'}
      </Button>
    </div>
  );
}
