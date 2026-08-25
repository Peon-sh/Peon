import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  WELCOME_TUTORIAL_STORAGE_KEY,
  dismissWelcomeTutorial,
  markWelcomeTutorialPending,
  shouldShowWelcomeTutorial,
} from '@/lib/welcome-tutorial';

describe('welcome tutorial storage', () => {
  const store = new Map<string, string>();

  beforeEach(() => {
    store.clear();
    vi.stubGlobal('window', {});
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => {
        store.set(key, value);
      },
      removeItem: (key: string) => {
        store.delete(key);
      },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('is hidden until marked pending', () => {
    expect(shouldShowWelcomeTutorial()).toBe(false);
    markWelcomeTutorialPending();
    expect(shouldShowWelcomeTutorial()).toBe(true);
    expect(store.get(WELCOME_TUTORIAL_STORAGE_KEY)).toBe('1');
  });

  it('stays hidden after dismiss', () => {
    markWelcomeTutorialPending();
    dismissWelcomeTutorial();
    expect(shouldShowWelcomeTutorial()).toBe(false);
    expect(store.get(WELCOME_TUTORIAL_STORAGE_KEY)).toBe('0');
  });
});
