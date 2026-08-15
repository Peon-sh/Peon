import { describe, expect, it } from 'vitest';
import { controlSchema } from '../service.schema';

describe('controlSchema', () => {
  it('accepts the container lifecycle actions', () => {
    for (const action of ['start', 'stop', 'restart'] as const) {
      expect(controlSchema.parse({ action }).action).toBe(action);
    }
  });

  it('accepts suspend and resume', () => {
    expect(controlSchema.parse({ action: 'suspend' }).action).toBe('suspend');
    expect(controlSchema.parse({ action: 'resume' }).action).toBe('resume');
  });

  it('rejects an unknown action', () => {
    expect(() => controlSchema.parse({ action: 'pause' })).toThrow();
  });

  it('requires an action', () => {
    expect(() => controlSchema.parse({})).toThrow();
  });
});
