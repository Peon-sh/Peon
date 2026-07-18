import { describe, expect, it } from 'vitest';
import { resolveComposeStartCommand } from '../start-command';

describe('resolveComposeStartCommand', () => {
  it('returns undefined when unset', () => {
    expect(resolveComposeStartCommand(null, '/docker/Dockerfile.worker')).toBeUndefined();
    expect(resolveComposeStartCommand('  ', null)).toBeUndefined();
  });

  it('skips redundant package-manager worker commands for Dockerfile.worker', () => {
    expect(resolveComposeStartCommand('pnpm worker', '/docker/Dockerfile.worker')).toBeUndefined();
    expect(resolveComposeStartCommand('npm worker', 'docker/Dockerfile.worker')).toBeUndefined();
    expect(resolveComposeStartCommand('yarn worker', '/Dockerfile.worker')).toBeUndefined();
    expect(resolveComposeStartCommand('pnpm schedule', '/docker/Dockerfile.worker')).toBeUndefined();
    expect(resolveComposeStartCommand('pnpm socket', '/docker/Dockerfile.worker')).toBeUndefined();
  });

  it('keeps custom worker commands and non-worker dockerfiles', () => {
    expect(resolveComposeStartCommand('node --import tsx worker/index.ts', '/docker/Dockerfile.worker')).toBe(
      'node --import tsx worker/index.ts',
    );
    expect(resolveComposeStartCommand('pnpm worker', '/Dockerfile')).toBe('pnpm worker');
    expect(resolveComposeStartCommand('pnpm start', null)).toBe('pnpm start');
  });
});
