import { describe, expect, it } from 'vitest';
import {
  normalizeDockerfileLocation,
  normalizeRepoPath,
  resolveDockerfileBuildPath,
} from '../paths';

describe('normalizeRepoPath', () => {
  it('adds a leading slash and strips trailing slashes', () => {
    expect(normalizeRepoPath('docker')).toBe('/docker');
    expect(normalizeRepoPath('/docker/')).toBe('/docker');
    expect(normalizeRepoPath('/')).toBe('/');
    expect(normalizeRepoPath('')).toBe('/');
  });

  it('rejects path traversal', () => {
    expect(() => normalizeRepoPath('../etc')).toThrow(/traversal/);
  });
});

describe('normalizeDockerfileLocation', () => {
  it('defaults to /Dockerfile', () => {
    expect(normalizeDockerfileLocation(null)).toBe('/Dockerfile');
    expect(normalizeDockerfileLocation('')).toBe('/Dockerfile');
  });

  it('normalizes custom worker Dockerfiles', () => {
    expect(normalizeDockerfileLocation('docker/Dockerfile.worker')).toBe('/docker/Dockerfile.worker');
    expect(normalizeDockerfileLocation('/docker/Dockerfile.worker')).toBe('/docker/Dockerfile.worker');
  });
});

describe('resolveDockerfileBuildPath', () => {
  it('concatenates workdir and dockerfile location', () => {
    expect(resolveDockerfileBuildPath('/data/svc/src', '/docker/Dockerfile.worker')).toBe(
      '/data/svc/src/docker/Dockerfile.worker',
    );
    expect(resolveDockerfileBuildPath('/data/svc/src/', 'Dockerfile')).toBe(
      '/data/svc/src/Dockerfile',
    );
  });
});
