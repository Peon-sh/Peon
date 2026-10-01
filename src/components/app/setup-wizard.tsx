'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { CircleCheck } from 'lucide-react';
import { Panel } from '@/components/app/page';
import { AddServerForm } from '@/components/app/add-server-form';
import { GithubStep, KeyStep, ProjectStep } from '@/components/app/setup-wizard-steps';
import { useSetupStatus, writeGithubSkipped } from '@/components/app/use-setup-status';
import { SETUP_STEP_ORDER, type SetupStepId } from '@/lib/setup-steps';
import { cn } from '@/lib/utils';

export const SETUP_WIZARD_PANEL_ID = 'setup-wizard';

// ── Wizard ──

const TITLES: Record<SetupStepId, string> = {
  key: 'Add an SSH key',
  server: 'Connect a server',
  github: 'Connect GitHub',
  project: 'Create a project',
};

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

interface SetupWizardProps {
  workspaceId: string;
  /** When set, open this step and scroll it into view. */
  forceStep?: 'server' | null;
  onForceStepHandled?: () => void;
}

/** Inline dashboard onboarding: SSH key → server → GitHub → project. Renders nothing once all four exist. */
export function SetupWizard({ workspaceId: wsId, forceStep = null, onForceStepHandled }: SetupWizardProps) {
  const status = useSetupStatus(wsId);

  const [selected, setSelected] = useState<SetupStepId | null>(null);
  const [createdKey, setCreatedKey] = useState<{ id: string; publicKey: string | null } | null>(null);

  // Adjust state during render when a new forceStep arrives (no effect round-trip).
  const [handledForce, setHandledForce] = useState<SetupWizardProps['forceStep']>(null);
  if (forceStep !== handledForce) {
    setHandledForce(forceStep);
    if (forceStep) setSelected(forceStep);
  }

  useEffect(() => {
    if (!forceStep) return;
    const frame = window.requestAnimationFrame(() => {
      document
        .getElementById(SETUP_WIZARD_PANEL_ID)
        ?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
    });
    onForceStepHandled?.();
    return () => window.cancelAnimationFrame(frame);
  }, [forceStep, onForceStepHandled]);

  if (!status.loaded || status.allDone) return null;
  const { keys, servers, sources, projects, steps, firstIncomplete, githubSkipped } = status;

  const doneById = Object.fromEntries(steps.map((s) => [s.id, s.done])) as Record<SetupStepId, boolean>;
  const current = selected ?? firstIncomplete;

  /** Open the next incomplete step after `from`, falling back to the first incomplete one. */
  const advance = (from: SetupStepId) => {
    const after = SETUP_STEP_ORDER.slice(SETUP_STEP_ORDER.indexOf(from) + 1);
    setSelected(after.find((id) => !doneById[id]) ?? firstIncomplete);
  };

  /** Persist the skip, then open the next incomplete step. With none left the wizard hides itself. */
  const skipGithub = () => {
    writeGithubSkipped(wsId);
    const remaining = SETUP_STEP_ORDER.filter((id) => id !== 'github' && !doneById[id]);
    setSelected(remaining.find((id) => id === 'project') ?? remaining[0] ?? null);
  };

  const summaries: Record<SetupStepId, string> = {
    key: plural(keys.length, 'key'),
    server: plural(servers.length, 'server'),
    github: githubSkipped ? 'Skipped' : 'Connected',
    project: plural(projects.length, 'project'),
  };

  // Read once when the server step mounts; the form owns the selection afterwards.
  const defaultKeyId = createdKey?.id ?? keys[0]?.id;

  const bodies: Record<SetupStepId, ReactNode> = {
    key: (
      <KeyStep
        workspaceId={wsId}
        publicKey={createdKey?.publicKey ?? null}
        onCreated={(key) => {
          setCreatedKey({ id: key.id, publicKey: key.publicKey });
          setSelected('key');
        }}
        onContinue={() => advance('key')}
      />
    ),
    server: (
      <AddServerForm
        workspaceId={wsId}
        defaultPrivateKeyId={defaultKeyId}
        onCreated={() => advance('server')}
      />
    ),
    github: (
      <GithubStep
        workspaceId={wsId}
        platformConfigured={sources.platformGithubConfigured === true}
        onSkip={skipGithub}
      />
    ),
    project: <ProjectStep workspaceId={wsId} />,
  };

  const currentIndex = current ? SETUP_STEP_ORDER.indexOf(current) : -1;
  const doneCount = steps.filter((s) => s.done).length;

  return (
    <Panel
      id={SETUP_WIZARD_PANEL_ID}
      title="Set up your workspace"
      description={`Four steps to your first deployment · ${doneCount} of ${steps.length} done`}
      actions={
        <span className="bg-primary/10 text-primary rounded-full px-2 py-0.5 text-xs font-medium">
          Getting started
        </span>
      }
      padded={false}
      className="border-primary/40 bg-primary/5 ring-primary/20 ring-1"
    >
      <ol className="divide-y">
        {steps.map((step, i) => {
          const isCurrent = step.id === current;
          // A skipped GitHub step is satisfied but not done: number marker, "Skipped" summary.
          const showCheck = step.done && !(step.id === 'github' && githubSkipped);
          const isLater = !step.done && !isCurrent && i > currentIndex;
          return (
            <li key={step.id} data-step={step.id} data-current={isCurrent || undefined}>
              <button
                type="button"
                aria-expanded={isCurrent}
                onClick={() => setSelected(step.id)}
                className={cn(
                  'hover:bg-secondary flex w-full items-center gap-3 px-4 py-3 text-left',
                  isLater && 'text-muted-foreground',
                )}
              >
                {showCheck ? (
                  <CircleCheck className="text-success size-6 shrink-0" aria-label="Done" />
                ) : (
                  <span
                    className={cn(
                      'flex size-6 shrink-0 items-center justify-center rounded-full border text-xs font-medium',
                      isCurrent && 'border-primary text-primary',
                    )}
                  >
                    {i + 1}
                  </span>
                )}
                <span className="min-w-0 flex-1 truncate text-base font-medium">{TITLES[step.id]}</span>
                {step.done ? (
                  <span className="text-muted-foreground shrink-0 text-sm">{summaries[step.id]}</span>
                ) : null}
              </button>
              {isCurrent ? <div className="px-4 pt-1 pb-4 pl-13">{bodies[step.id]}</div> : null}
            </li>
          );
        })}
      </ol>
    </Panel>
  );
}
