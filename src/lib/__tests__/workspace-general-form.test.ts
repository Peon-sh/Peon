import { describe, expect, it } from 'vitest';
import {
  seedWorkspaceGeneralForm,
  wouldSkipWorkspaceFormSync,
} from '../workspace-general-form';

const workspace = {
  id: 'ws_1',
  name: 'Peon',
  slug: 'peon',
  personal: false,
  description: 'prod',
  _count: { projects: 1, memberships: 1 },
};

describe('seedWorkspaceGeneralForm', () => {
  it('seeds name and description from list data', () => {
    expect(seedWorkspaceGeneralForm(workspace)).toEqual({
      name: 'Peon',
      description: 'prod',
    });
  });

  it('treats null description as empty string', () => {
    expect(seedWorkspaceGeneralForm({ ...workspace, description: null })).toEqual({
      name: 'Peon',
      description: '',
    });
  });
});

describe('wouldSkipWorkspaceFormSync (legacy bug)', () => {
  it('skips sync when remounting against the same cached object reference', () => {
    // Warm cache: first render initializes snapshot = current (same ref).
    expect(wouldSkipWorkspaceFormSync(workspace, workspace)).toBe(true);
  });

  it('does not skip when current arrives after an empty first render', () => {
    expect(wouldSkipWorkspaceFormSync(undefined, workspace)).toBe(false);
  });
});
