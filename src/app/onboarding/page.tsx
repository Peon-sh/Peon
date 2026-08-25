'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowRight, Check, CreditCard, FolderKanban, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { LogoMark } from '@/components/logo';
import { useAuthStore } from '@/store/auth';
import { completeOnboarding } from '@/services/api/auth';
import { updateWorkspace } from '@/services/api/workspace';
import { createProject } from '@/services/api/project';
import { getBillingSummary } from '@/services/api/billing';
import { publicEnv } from '@/lib/env';
import { InAppSubscribeForm } from '@/components/billing/in-app-subscribe-form';
import { yearlyDiscountPercent } from '@/lib/billing/pricing';
import { markWelcomeTutorialPending } from '@/lib/welcome-tutorial';
import { AnalyticsEvents, captureEvent } from '@/lib/analytics';

const BASE_STEPS = [
  { id: 'workspace', label: 'Workspace', icon: Sparkles },
  { id: 'plan', label: 'Plan', icon: CreditCard },
  { id: 'project', label: 'Project', icon: FolderKanban },
] as const;

type StepId = (typeof BASE_STEPS)[number]['id'];
type PlanOutcome = 'subscribed' | 'skipped' | 'already_entitled' | 'billing_disabled';
type ProjectOutcome = 'created' | 'skipped';

export default function OnboardingPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const { user, workspaces, currentWorkspaceId } = useAuthStore();
  const workspace = workspaces.find((w) => w.id === currentWorkspaceId) ?? workspaces[0] ?? null;
  const wsId = workspace?.id ?? '';
  const billingOn = publicEnv.billingEnabled;
  const startedRef = useRef(false);

  const steps = billingOn
    ? BASE_STEPS
    : BASE_STEPS.filter((s) => s.id !== 'plan');

  const [step, setStep] = useState<StepId>('workspace');
  const [done, setDone] = useState<Partial<Record<StepId, boolean>>>({});
  const [planSkipped, setPlanSkipped] = useState(false);
  const [planOutcome, setPlanOutcome] = useState<PlanOutcome | null>(
    billingOn ? null : 'billing_disabled',
  );

  const { data: billing } = useQuery({
    queryKey: ['billing', wsId],
    queryFn: () => getBillingSummary(wsId),
    enabled: !!wsId && billingOn,
  });

  const entitled = !billingOn || !!billing?.entitled;

  const stepIndex = steps.findIndex((s) => s.id === step);

  useEffect(() => {
    if (!user || startedRef.current) return;
    startedRef.current = true;
    captureEvent(AnalyticsEvents.onboardingStarted, {
      billing_enabled: billingOn,
      workspace_id: wsId || undefined,
    });
  }, [user, billingOn, wsId]);

  const finishMut = useMutation({
    mutationFn: async (_vars: {
      destination?: string;
      projectOutcome: ProjectOutcome;
    }) => completeOnboarding(),
    onSuccess: async (_data, vars) => {
      captureEvent(AnalyticsEvents.onboardingCompleted, {
        plan_outcome: planOutcome ?? (billingOn ? 'skipped' : 'billing_disabled'),
        project_outcome: vars.projectOutcome,
        destination: vars.destination ?? '/dashboard',
      });
      markWelcomeTutorialPending();
      await qc.invalidateQueries({ queryKey: ['auth', 'me'] });
      router.replace(vars.destination || '/dashboard');
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Something went wrong'),
  });

  const finish = (opts?: { destination?: string; projectOutcome?: ProjectOutcome }) => {
    const projectOutcome = opts?.projectOutcome ?? 'skipped';
    if (projectOutcome === 'skipped') {
      captureEvent(AnalyticsEvents.onboardingProjectContinued, { outcome: 'skipped' });
    }
    finishMut.mutate({
      destination: opts?.destination,
      projectOutcome,
    });
  };

  if (!user || !workspace) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-muted-foreground animate-pulse text-sm">Loading…</div>
      </div>
    );
  }

  return (
    <div className="bg-background min-h-screen">
      <div className="mx-auto flex max-w-xl flex-col gap-8 px-4 py-10 sm:py-16">
        <div className="space-y-4 text-center">
          <div className="inline-flex items-center justify-center gap-2.5 font-semibold">
            <LogoMark size={32} />
            <span className="font-heading text-lg font-bold tracking-tight uppercase">Peon</span>
          </div>
          <div className="space-y-1">
            <p className="text-phosphor font-mono text-xs uppercase tracking-widest">
              Welcome to Peon
            </p>
            <h1 className="font-heading text-2xl font-extrabold tracking-tight uppercase">
              Let&apos;s get you deploying
            </h1>
            <p className="text-muted-foreground text-sm">
              Name your workspace
              {billingOn ? ', optionally start Peon Pro,' : ''} then create your first project.
            </p>
          </div>
        </div>

        <ol className="flex items-center gap-1">
          {steps.map((s, i) => {
            const Icon = s.icon;
            const state = done[s.id] ? 'done' : i === stepIndex ? 'current' : 'todo';
            return (
              <li key={s.id} className="flex flex-1 items-center gap-1">
                <button
                  type="button"
                  onClick={() => i <= stepIndex && setStep(s.id)}
                  className={`flex w-full flex-col items-center gap-1.5 rounded-md px-1 py-2 text-[11px] transition-colors ${
                    state === 'current'
                      ? 'text-foreground'
                      : state === 'done'
                        ? 'text-phosphor'
                        : 'text-muted-foreground'
                  }`}
                >
                  <span
                    className={`grid size-8 place-items-center rounded-full border ${
                      state === 'current'
                        ? 'border-foreground'
                        : state === 'done'
                          ? 'border-phosphor-dim bg-secondary'
                          : 'border-border'
                    }`}
                  >
                    {state === 'done' ? <Check className="size-3.5" /> : <Icon className="size-3.5" />}
                  </span>
                  {s.label}
                </button>
                {i < steps.length - 1 && <span className="bg-border h-px w-4 shrink-0" />}
              </li>
            );
          })}
        </ol>

        <div className="bg-card rounded-lg border p-6">
          {step === 'workspace' && (
            <WorkspaceStep
              workspaceId={wsId}
              initialName={workspace.name}
              onDone={() => {
                captureEvent(AnalyticsEvents.onboardingWorkspaceCompleted, {
                  workspace_id: wsId,
                });
                setDone((d) => ({ ...d, workspace: true }));
                if (billingOn) {
                  setStep('plan');
                } else {
                  setPlanOutcome('billing_disabled');
                  captureEvent(AnalyticsEvents.onboardingPlanContinued, {
                    outcome: 'billing_disabled',
                  });
                  setStep('project');
                }
              }}
            />
          )}
          {step === 'plan' && billingOn && (
            <PlanStep
              workspaceId={wsId}
              entitled={entitled}
              onSubscribed={() => {
                setPlanOutcome('subscribed');
                captureEvent(AnalyticsEvents.onboardingPlanContinued, { outcome: 'subscribed' });
                setDone((d) => ({ ...d, plan: true }));
                setPlanSkipped(false);
                setStep('project');
              }}
              onAlreadyEntitled={() => {
                setPlanOutcome('already_entitled');
                captureEvent(AnalyticsEvents.onboardingPlanContinued, {
                  outcome: 'already_entitled',
                });
                setDone((d) => ({ ...d, plan: true }));
                setPlanSkipped(false);
                setStep('project');
              }}
              onSkip={() => {
                setPlanOutcome('skipped');
                captureEvent(AnalyticsEvents.onboardingPlanContinued, { outcome: 'skipped' });
                setPlanSkipped(true);
                setDone((d) => ({ ...d, plan: true }));
                finish({ projectOutcome: 'skipped' });
              }}
            />
          )}
          {step === 'project' && entitled && !planSkipped && (
            <ProjectStep
              workspaceId={wsId}
              finishing={finishMut.isPending}
              onDone={(projectId) => {
                captureEvent(AnalyticsEvents.onboardingProjectContinued, {
                  outcome: 'created',
                  project_id: projectId,
                });
                setDone((d) => ({ ...d, project: true }));
                finish({ destination: `/projects/${projectId}`, projectOutcome: 'created' });
              }}
              onSkip={() => finish({ projectOutcome: 'skipped' })}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function StepHeading({ title, description }: { title: string; description: string }) {
  return (
    <div className="mb-5 space-y-1 text-center">
      <h2 className="text-base font-semibold">{title}</h2>
      <p className="text-muted-foreground text-sm text-balance">{description}</p>
    </div>
  );
}

function WorkspaceStep({
  workspaceId,
  initialName,
  onDone,
}: {
  workspaceId: string;
  initialName: string;
  onDone: () => void;
}) {
  const qc = useQueryClient();
  const [name, setName] = useState(initialName);

  const saveMut = useMutation({
    mutationFn: async () => {
      if (name.trim() && name.trim() !== initialName) {
        await updateWorkspace(workspaceId, { name: name.trim() });
        await qc.invalidateQueries({ queryKey: ['auth', 'me'] });
      }
    },
    onSuccess: onDone,
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed to update workspace'),
  });

  return (
    <div>
      <StepHeading
        title="Name your workspace"
        description="We created a personal workspace for you. Workspaces group your servers, projects, and team members — rename it if you like."
      />
      <div className="space-y-2">
        <Label htmlFor="ob-ws-name">Workspace name</Label>
        <Input
          id="ob-ws-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Acme Inc"
        />
      </div>
      <div className="mt-6 flex justify-end">
        <Button onClick={() => saveMut.mutate()} disabled={!name.trim() || saveMut.isPending}>
          Continue <ArrowRight className="size-4" />
        </Button>
      </div>
    </div>
  );
}

function PlanStep({
  workspaceId,
  entitled,
  onSubscribed,
  onAlreadyEntitled,
  onSkip,
}: {
  workspaceId: string;
  entitled: boolean;
  onSubscribed: () => void;
  onAlreadyEntitled: () => void;
  onSkip: () => void;
}) {
  const discount = yearlyDiscountPercent();

  if (entitled) {
    return (
      <div className="space-y-4 text-center">
        <StepHeading
          title="You're on Peon Pro"
          description="Your workspace already has an active subscription. Continue to create a project."
        />
        <Button onClick={onAlreadyEntitled}>
          Continue <ArrowRight className="size-4" />
        </Button>
      </div>
    );
  }

  return (
    <div>
      <StepHeading
        title="Start Peon Pro"
        description={`Project seats power your servers. Monthly $3 or yearly $30 (save ~${discount}%).`}
      />
      <InAppSubscribeForm
        workspaceId={workspaceId}
        onSuccess={onSubscribed}
        returnPath="/onboarding"
      />
      <div className="mt-4 flex justify-center">
        <Button variant="ghost" onClick={onSkip}>
          Skip for now
        </Button>
      </div>
    </div>
  );
}

function ProjectStep({
  workspaceId,
  finishing,
  onDone,
  onSkip,
}: {
  workspaceId: string;
  finishing: boolean;
  onDone: (projectId: string) => void;
  onSkip: () => void;
}) {
  const qc = useQueryClient();
  const [name, setName] = useState('');

  const createMut = useMutation({
    mutationFn: () => createProject(workspaceId, { name: name.trim() }),
    onSuccess: async (project) => {
      await qc.invalidateQueries({ queryKey: ['projects', workspaceId] });
      toast.success('Project created');
      onDone(project.id);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed to create project'),
  });

  return (
    <div>
      <StepHeading
        title="Create your first project"
        description="Projects group related services — an app, its database, its workers. We'll take you there next to connect your git repository and deploy. You can also skip and do this later."
      />
      <div className="space-y-2">
        <Label htmlFor="ob-p-name">Project name</Label>
        <Input
          id="ob-p-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="my-app"
        />
      </div>
      <div className="mt-6 flex items-center justify-between">
        <Button variant="ghost" onClick={onSkip} disabled={finishing}>
          Skip for now
        </Button>
        <Button
          onClick={() => createMut.mutate()}
          disabled={!name.trim() || createMut.isPending || finishing}
        >
          {createMut.isPending || finishing ? 'Creating…' : 'Create project'}{' '}
          <ArrowRight className="size-4" />
        </Button>
      </div>
    </div>
  );
}
