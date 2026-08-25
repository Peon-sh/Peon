import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('posthog-js', () => ({
  default: {
    capture: vi.fn(),
    identify: vi.fn(),
    reset: vi.fn(),
  },
}));

import posthog from 'posthog-js';
import {
  AnalyticsEvents,
  captureEvent,
  identifyUser,
  resetAnalytics,
} from '@/lib/analytics';

describe('analytics helpers', () => {
  beforeEach(() => {
    vi.stubGlobal('window', {});
    process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN = 'phc_test';
    vi.clearAllMocks();
  });

  afterEach(() => {
    delete process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN;
    vi.unstubAllGlobals();
  });

  it('captures named onboarding events when enabled', () => {
    captureEvent(AnalyticsEvents.onboardingStarted, { billing_enabled: true });
    expect(posthog.capture).toHaveBeenCalledWith('onboarding_started', {
      billing_enabled: true,
    });
  });

  it('identifies and resets users', () => {
    identifyUser({
      id: 'u1',
      email: 'a@b.co',
      name: 'Ada',
      isOnboarded: false,
    });
    expect(posthog.identify).toHaveBeenCalledWith('u1', {
      email: 'a@b.co',
      name: 'Ada',
      is_onboarded: false,
    });
    resetAnalytics();
    expect(posthog.reset).toHaveBeenCalled();
  });

  it('no-ops without a project token', () => {
    delete process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN;
    captureEvent(AnalyticsEvents.onboardingCompleted);
    expect(posthog.capture).not.toHaveBeenCalled();
  });
});
