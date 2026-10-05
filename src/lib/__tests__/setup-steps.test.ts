import { describe, expect, it } from 'vitest';
import { deriveSetupSteps } from '../setup-steps';

const none = { keys: 0, servers: 0, githubConnected: false, projects: 0 };

describe('deriveSetupSteps', () => {
  it('returns steps in order key, server, github, project', () => {
    expect(deriveSetupSteps(none).steps.map((s) => s.id)).toEqual(['key', 'server', 'github', 'project']);
  });

  it('marks everything done when all four exist', () => {
    const r = deriveSetupSteps({ keys: 1, servers: 2, githubConnected: true, projects: 3 });
    expect(r.allDone).toBe(true);
    expect(r.firstIncomplete).toBeNull();
    expect(r.steps.every((s) => s.done)).toBe(true);
  });

  it('starts at key when nothing exists', () => {
    const r = deriveSetupSteps(none);
    expect(r.firstIncomplete).toBe('key');
    expect(r.allDone).toBe(false);
    expect(r.steps.some((s) => s.done)).toBe(false);
  });

  it('moves to server when only keys exist', () => {
    const r = deriveSetupSteps({ ...none, keys: 1 });
    expect(r.firstIncomplete).toBe('server');
    expect(r.steps.find((s) => s.id === 'key')?.done).toBe(true);
    expect(r.steps.find((s) => s.id === 'server')?.done).toBe(false);
  });

  it('moves to github when keys and servers exist', () => {
    expect(deriveSetupSteps({ ...none, keys: 1, servers: 1 }).firstIncomplete).toBe('github');
  });

  it('moves to project when keys, servers and github exist', () => {
    const r = deriveSetupSteps({ keys: 1, servers: 1, githubConnected: true, projects: 0 });
    expect(r.firstIncomplete).toBe('project');
    expect(r.allDone).toBe(false);
  });

  it('reports the first incomplete step even when later steps are done', () => {
    expect(deriveSetupSteps({ keys: 0, servers: 1, githubConnected: true, projects: 1 }).firstIncomplete).toBe('key');
  });
});
