import { afterEach, describe, expect, it } from 'vitest';
import { isUiFixtureMode, UI_FIXTURE_ENV } from '../index';

describe('UI fixture mode guard', () => {
  const snapshot = { ...process.env };

  afterEach(() => {
    process.env = { ...snapshot };
  });

  it('is off by default', () => {
    delete process.env[UI_FIXTURE_ENV];
    process.env.NODE_ENV = 'development';
    expect(isUiFixtureMode()).toBe(false);
  });

  it('activates in development when explicitly enabled', () => {
    process.env.NODE_ENV = 'development';
    process.env[UI_FIXTURE_ENV] = '1';
    expect(isUiFixtureMode()).toBe(true);
  });

  it('NEVER activates in production, even when explicitly enabled', () => {
    // Serving fabricated data from a production build would be a security
    // incident, so the guard does not trust configuration alone.
    process.env.NODE_ENV = 'production';
    process.env[UI_FIXTURE_ENV] = '1';
    expect(isUiFixtureMode()).toBe(false);
  });

  it('ignores truthy-looking values other than "1"', () => {
    process.env.NODE_ENV = 'development';
    for (const value of ['true', 'yes', 'on', '0', '']) {
      process.env[UI_FIXTURE_ENV] = value;
      expect(isUiFixtureMode()).toBe(false);
    }
  });

  it('is off in test environments unless asked for', () => {
    process.env.NODE_ENV = 'test';
    delete process.env[UI_FIXTURE_ENV];
    expect(isUiFixtureMode()).toBe(false);
  });
});
