export type SetupStepId = 'key' | 'server' | 'github' | 'project';

export const SETUP_STEP_ORDER: readonly SetupStepId[] = ['key', 'server', 'github', 'project'];

export interface SetupStepsInput {
  keys: number;
  servers: number;
  githubConnected: boolean;
  projects: number;
}

export interface SetupStepsResult {
  steps: Array<{ id: SetupStepId; done: boolean }>;
  firstIncomplete: SetupStepId | null;
  allDone: boolean;
}

/** Derive onboarding completion from workspace counts. Pure; recomputed every render. */
export function deriveSetupSteps(input: SetupStepsInput): SetupStepsResult {
  const done: Record<SetupStepId, boolean> = {
    key: input.keys > 0,
    server: input.servers > 0,
    github: input.githubConnected,
    project: input.projects > 0,
  };
  const steps = SETUP_STEP_ORDER.map((id) => ({ id, done: done[id] }));
  const firstIncomplete = steps.find((s) => !s.done)?.id ?? null;
  return { steps, firstIncomplete, allDone: firstIncomplete === null };
}
