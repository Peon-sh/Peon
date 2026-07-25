import { describe, expect, it } from 'vitest';
import { buildGitSyncScript } from '../sync-repo-script';

describe('buildGitSyncScript', () => {
  it('fetches the branch tip instead of resetting to a possibly stale origin ref', () => {
    const script = buildGitSyncScript({
      src: '/data/peon/services/app/src',
      repo: 'https://github.com/acme/app.git',
      branch: 'main',
    });
    expect(script).toContain('COMMIT_SHA=""');
    expect(script).toContain('git fetch --depth 1 origin "$BRANCH"');
    expect(script).toContain('git checkout -B "$BRANCH" FETCH_HEAD');
    expect(script).not.toContain('git reset --hard origin/');
    expect(script).not.toContain('FORCE_CLEAN=1');
  });

  it('wipes the source tree when forceClean is set', () => {
    const script = buildGitSyncScript({
      src: '/data/peon/services/app/src',
      repo: 'https://github.com/acme/app.git',
      branch: 'main',
      forceClean: true,
    });
    expect(script).toContain('FORCE_CLEAN=1');
    expect(script).toContain('Force rebuild: clearing cached source');
    expect(script).toContain('rm -rf "$SRC"');
  });

  it('fetches and checks out a specific commit when commitSha is set (rollback)', () => {
    const script = buildGitSyncScript({
      src: '/data/peon/services/app/src',
      repo: 'https://github.com/acme/app.git',
      branch: 'main',
      commitSha: 'abc123def456',
      forceClean: true,
    });
    expect(script).toContain('COMMIT_SHA="abc123def456"');
    expect(script).toContain('Checking out commit $COMMIT_SHA');
    expect(script).toContain('git fetch --depth 1 origin "$COMMIT_SHA"');
    expect(script).toContain('git checkout -f FETCH_HEAD');
  });
});
