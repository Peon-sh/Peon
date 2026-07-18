import { describe, expect, it } from 'vitest';
import { isSafeAppRedirect, postAuthPath } from '../post-auth-path';

describe('postAuthPath', () => {
  it('sends unfinished users to onboarding', () => {
    expect(postAuthPath({ isOnboarded: false }, '/projects')).toBe('/onboarding');
  });

  it('honours safe preferred redirects', () => {
    expect(postAuthPath({ isOnboarded: true }, '/projects')).toBe('/projects');
  });

  it('ignores static asset redirects like the web manifest', () => {
    expect(postAuthPath({ isOnboarded: true }, '/site.webmanifest')).toBe('/dashboard');
  });

  it('ignores open redirects and auth pages', () => {
    expect(postAuthPath({ isOnboarded: true }, '//evil.com')).toBe('/dashboard');
    expect(postAuthPath({ isOnboarded: true }, '/login')).toBe('/dashboard');
    expect(postAuthPath({ isOnboarded: true }, '/api/auth/me')).toBe('/dashboard');
  });
});

describe('isSafeAppRedirect', () => {
  it('rejects asset-like paths', () => {
    expect(isSafeAppRedirect('/site.webmanifest')).toBe(false);
    expect(isSafeAppRedirect('/robots.txt')).toBe(false);
  });
});
