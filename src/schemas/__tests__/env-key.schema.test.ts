import { describe, expect, it } from 'vitest';
import { upsertEnvSchema } from '../service.schema';
import {
  createSharedVariableSchema,
  updateSharedVariableSchema,
} from '../shared-variables.schema';

// These three boundaries used to carry their own copy of the key pattern. They
// now share one definition, so check they still agree on what is allowed.
const INVALID_KEYS = ['1FOO', 'FOO-BAR', 'FOO BAR', 'FOO;id', 'FOO$(id)', ''];

describe('upsertEnvSchema key', () => {
  it('accepts a valid name', () => {
    expect(upsertEnvSchema.parse({ key: 'FOO_BAR', value: 'x' }).key).toBe('FOO_BAR');
  });

  it('rejects names that are not identifiers', () => {
    for (const key of INVALID_KEYS) {
      expect(() => upsertEnvSchema.parse({ key, value: 'x' }), key).toThrow();
    }
  });
});

describe('shared variable key', () => {
  it('accepts a valid name on create and update', () => {
    expect(createSharedVariableSchema.parse({ key: 'FOO_BAR', value: 'x' }).key).toBe('FOO_BAR');
    expect(updateSharedVariableSchema.parse({ key: 'FOO_BAR' }).key).toBe('FOO_BAR');
  });

  it('rejects names that are not identifiers on create and update', () => {
    for (const key of INVALID_KEYS) {
      expect(() => createSharedVariableSchema.parse({ key, value: 'x' }), key).toThrow();
      expect(() => updateSharedVariableSchema.parse({ key }), key).toThrow();
    }
  });
});
