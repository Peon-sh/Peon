import { describe, expect, it } from 'vitest';
import { SERVICE_CONTROL_ACTIONS } from '@/lib/service-control';
import { controlSchema } from '../service.schema';

describe('controlSchema', () => {
  // Driven off the shared list so an action added there is validated here too.
  it('accepts every shared control action', () => {
    for (const action of SERVICE_CONTROL_ACTIONS) {
      expect(controlSchema.parse({ action }).action).toBe(action);
    }
  });

  it('covers the container lifecycle plus suspend and resume', () => {
    expect([...SERVICE_CONTROL_ACTIONS]).toEqual([
      'start',
      'stop',
      'restart',
      'suspend',
      'resume',
    ]);
  });

  it('rejects an unknown action', () => {
    expect(() => controlSchema.parse({ action: 'pause' })).toThrow();
  });

  it('requires an action', () => {
    expect(() => controlSchema.parse({})).toThrow();
  });
});
