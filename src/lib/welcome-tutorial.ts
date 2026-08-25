/** Set to `'1'` when onboarding finishes; cleared when the user dismisses the dialog. */
export const WELCOME_TUTORIAL_STORAGE_KEY = 'peon.welcomeTutorial';

export function shouldShowWelcomeTutorial(): boolean {
  if (typeof window === 'undefined') return false;
  return localStorage.getItem(WELCOME_TUTORIAL_STORAGE_KEY) === '1';
}

export function markWelcomeTutorialPending(): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(WELCOME_TUTORIAL_STORAGE_KEY, '1');
}

export function dismissWelcomeTutorial(): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(WELCOME_TUTORIAL_STORAGE_KEY, '0');
}
