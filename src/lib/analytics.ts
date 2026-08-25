import posthog from 'posthog-js';

/** True when the browser PostHog SDK was initialized (token present). */
export function isPosthogEnabled(): boolean {
  return !!process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN?.trim();
}

export function captureEvent(
  event: string,
  properties?: Record<string, string | number | boolean | null | undefined>,
): void {
  if (typeof window === 'undefined' || !isPosthogEnabled()) return;
  posthog.capture(event, properties);
}

export function identifyUser(
  user: { id: string; email: string; name: string | null; isOnboarded: boolean },
): void {
  if (typeof window === 'undefined' || !isPosthogEnabled()) return;
  posthog.identify(user.id, {
    email: user.email,
    name: user.name ?? undefined,
    is_onboarded: user.isOnboarded,
  });
}

export function resetAnalytics(): void {
  if (typeof window === 'undefined' || !isPosthogEnabled()) return;
  posthog.reset();
}

/** Onboarding funnel + step events. Keep names stable for PostHog insights. */
export const AnalyticsEvents = {
  onboardingStarted: 'onboarding_started',
  onboardingWorkspaceCompleted: 'onboarding_workspace_completed',
  onboardingPlanContinued: 'onboarding_plan_continued',
  onboardingProjectContinued: 'onboarding_project_continued',
  onboardingCompleted: 'onboarding_completed',
} as const;
