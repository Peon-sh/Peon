import { describe, expect, it } from 'vitest';
import { githubInstallationSettingsUrl } from '../github-urls';

describe('githubInstallationSettingsUrl', () => {
  it('uses org settings path only when accountType is Organization', () => {
    expect(
      githubInstallationSettingsUrl({
        installationId: '145665644',
        organization: 'Peon-sh',
        accountType: 'Organization',
      }),
    ).toBe('https://github.com/organizations/Peon-sh/settings/installations/145665644');
  });

  it('uses user settings path for user installs even when login is set', () => {
    expect(
      githubInstallationSettingsUrl({
        installationId: '146934374',
        organization: 'hironate',
        accountType: 'User',
      }),
    ).toBe('https://github.com/settings/installations/146934374');
  });

  it('does not treat a personal login as an org when type is unknown', () => {
    expect(
      githubInstallationSettingsUrl({
        installationId: '146934374',
        organization: 'hironate',
      }),
    ).toBe('https://github.com/settings/installations/146934374');
  });

  it('falls back to user settings when no organization', () => {
    expect(githubInstallationSettingsUrl({ installationId: '42' })).toBe(
      'https://github.com/settings/installations/42',
    );
  });
});
