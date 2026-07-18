import { describe, expect, it } from 'vitest';
import {
  DEFAULT_NODE_BUILD_VERSION,
  buildPackCliEnvArgs,
  buildPackDockerBuildArgs,
  buildPackEnvPrefix,
  buildPackNeedsNodeVersion,
  resolveNodeBuildVersion,
} from '../build-pack-env';

describe('buildPackNeedsNodeVersion', () => {
  it('is true for Nixpacks and Railpack', () => {
    expect(buildPackNeedsNodeVersion('NIXPACKS')).toBe(true);
    expect(buildPackNeedsNodeVersion('RAILPACK')).toBe(true);
  });

  it('is false for other packs', () => {
    expect(buildPackNeedsNodeVersion('DOCKERFILE')).toBe(false);
    expect(buildPackNeedsNodeVersion('STATIC')).toBe(false);
    expect(buildPackNeedsNodeVersion(null)).toBe(false);
  });
});

describe('buildPackEnvPrefix', () => {
  it('defaults Node to the current LTS major for Nixpacks and Railpack', () => {
    const prefix = buildPackEnvPrefix({});
    expect(prefix).toContain(`NIXPACKS_NODE_VERSION='${DEFAULT_NODE_BUILD_VERSION}'`);
    expect(prefix).toContain(`RAILPACK_NODE_VERSION='${DEFAULT_NODE_BUILD_VERSION}'`);
  });

  it('honors an explicit NIXPACKS_NODE_VERSION from service env', () => {
    const prefix = buildPackEnvPrefix({}, { NIXPACKS_NODE_VERSION: '24' });
    expect(prefix).toContain(`NIXPACKS_NODE_VERSION='24'`);
    expect(prefix).toContain(`RAILPACK_NODE_VERSION='24'`);
  });

  it('keeps a separate RAILPACK_NODE_VERSION override', () => {
    const prefix = buildPackEnvPrefix(
      {},
      { NIXPACKS_NODE_VERSION: '20', RAILPACK_NODE_VERSION: '22' },
    );
    expect(prefix).toContain(`NIXPACKS_NODE_VERSION='20'`);
    expect(prefix).toContain(`RAILPACK_NODE_VERSION='22'`);
  });

  it('includes install/build/start command overrides', () => {
    const prefix = buildPackEnvPrefix({
      installCommand: 'pnpm i',
      buildCommand: 'pnpm run build',
      startCommand: 'pnpm start',
    });
    expect(prefix).toContain(`NIXPACKS_INSTALL_CMD='pnpm i'`);
    expect(prefix).toContain(`NIXPACKS_BUILD_CMD='pnpm run build'`);
    expect(prefix).toContain(`NIXPACKS_START_CMD='pnpm start'`);
  });
});

describe('buildPackCliEnvArgs', () => {
  it('emits --env flags including the Node version', () => {
    const args = buildPackCliEnvArgs({}, { NIXPACKS_NODE_VERSION: '22' });
    expect(args).toContain(`--env 'NIXPACKS_NODE_VERSION=22'`);
    expect(args).toContain(`--env 'RAILPACK_NODE_VERSION=22'`);
  });

  it('passes NEXT_PUBLIC_* build-time vars so Next can inline them', () => {
    const args = buildPackCliEnvArgs(
      {},
      { NEXT_PUBLIC_GOOGLE_CLIENT_ID: 'abc.apps.googleusercontent.com' },
    );
    expect(args).toContain(`--env 'NEXT_PUBLIC_GOOGLE_CLIENT_ID=abc.apps.googleusercontent.com'`);
  });
});

describe('buildPackDockerBuildArgs', () => {
  it('emits --build-arg for app env but not Nixpacks control vars', () => {
    const args = buildPackDockerBuildArgs(
      {},
      {
        NEXT_PUBLIC_GOOGLE_CLIENT_ID: 'abc',
        NIXPACKS_NODE_VERSION: '22',
      },
    );
    expect(args).toContain(`--build-arg 'NEXT_PUBLIC_GOOGLE_CLIENT_ID=abc'`);
    expect(args).not.toContain('NIXPACKS_NODE_VERSION');
  });
});

describe('resolveNodeBuildVersion', () => {
  it('defaults to the current LTS major', () => {
    expect(resolveNodeBuildVersion({})).toBe(DEFAULT_NODE_BUILD_VERSION);
  });

  it('prefers NIXPACKS_NODE_VERSION', () => {
    expect(resolveNodeBuildVersion({ NIXPACKS_NODE_VERSION: '20' })).toBe('20');
  });
});
