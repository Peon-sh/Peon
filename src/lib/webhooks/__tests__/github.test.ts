import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  githubAppEventsWebhookUrl,
  githubAppSetupUrl,
  isWatchPathsTriggered,
  parseGithubPullRequestPayload,
  parseGithubPushPayload,
  shouldSkipDeploy,
  verifyGithubSignature,
} from '../github';

describe('github webhook helpers', () => {
  it('builds the App events URL', () => {
    expect(githubAppEventsWebhookUrl('https://app.peon.sh/')).toBe(
      'https://app.peon.sh/webhooks/source/github/events',
    );
  });

  it('builds a source-scoped Setup URL for post-install redirect', () => {
    expect(githubAppSetupUrl('https://app.peon.sh/', 'cmrexgc3m000b1js5i88ylb6g')).toBe(
      'https://app.peon.sh/sources/cmrexgc3m000b1js5i88ylb6g',
    );
  });

  it('verifies GitHub HMAC signatures', () => {
    const body = '{"ref":"refs/heads/main"}';
    const secret = 'super-secret';
    const sig = 'sha256=' + createHmac('sha256', secret).update(body).digest('hex');
    expect(verifyGithubSignature(body, sig, secret)).toBe(true);
    expect(verifyGithubSignature(body, sig, 'wrong')).toBe(false);
    expect(verifyGithubSignature(body, null, secret)).toBe(false);
  });

  it('parses push payloads', () => {
    const push = parseGithubPushPayload({
      ref: 'refs/heads/main',
      after: 'abc123',
      repository: { id: 42, full_name: 'Peon-sh/Peon-Website' },
      head_commit: { message: 'ship it' },
      commits: [
        {
          message: 'ship it',
          added: ['src/a.ts'],
          removed: [],
          modified: ['README.md'],
        },
      ],
    });
    expect(push).toMatchObject({
      branch: 'main',
      commitSha: 'abc123',
      commitMessage: 'ship it',
      repositoryId: 42,
      fullName: 'Peon-sh/Peon-Website',
    });
    expect(push.changedFiles).toEqual(['src/a.ts', 'README.md']);
  });

  it('skips deploy when every commit has [skip ci]', () => {
    expect(shouldSkipDeploy(['fix [skip ci]', 'chore [skip cd]'])).toBe(true);
    expect(shouldSkipDeploy(['fix [skip ci]', 'real change'])).toBe(false);
    expect(shouldSkipDeploy([])).toBe(false);
  });

  it('matches watch paths', () => {
    expect(isWatchPathsTriggered(null, ['a.ts'])).toBe(true);
    expect(isWatchPathsTriggered('src/\ndocs/', ['src/app.ts'])).toBe(true);
    expect(isWatchPathsTriggered('src/*', ['src/app.ts'])).toBe(true);
    expect(isWatchPathsTriggered('docs/', ['src/app.ts'])).toBe(false);
  });

  it('parses pull_request payloads', () => {
    const pr = parseGithubPullRequestPayload({
      action: 'synchronize',
      pull_request: {
        number: 7,
        title: 'feat: preview',
        draft: false,
        base: { ref: 'main' },
        head: { ref: 'feature/x', sha: 'deadbeef' },
      },
      repository: { id: 99, full_name: 'acme/app' },
    });
    expect(pr).toMatchObject({
      action: 'synchronize',
      pullRequestId: 7,
      baseBranch: 'main',
      headBranch: 'feature/x',
      commitSha: 'deadbeef',
      repositoryId: 99,
      owner: 'acme',
      repo: 'app',
    });
  });
});
