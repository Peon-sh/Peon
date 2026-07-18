import { describe, expect, it } from 'vitest';
import { deleteServerSchema, updateServerSchema } from '../server.schema';

describe('updateServerSchema privateKeyId', () => {
  it('accepts changing the SSH key', () => {
    const parsed = updateServerSchema.parse({ privateKeyId: 'cmkey123' });
    expect(parsed.privateKeyId).toBe('cmkey123');
  });

  it('accepts clearing the SSH key', () => {
    const parsed = updateServerSchema.parse({ privateKeyId: null });
    expect(parsed.privateKeyId).toBeNull();
  });

  it('rejects an empty SSH key id', () => {
    expect(() => updateServerSchema.parse({ privateKeyId: '' })).toThrow();
  });
});

describe('deleteServerSchema', () => {
  it('requires confirmName', () => {
    expect(() => deleteServerSchema.parse({})).toThrow();
    expect(() => deleteServerSchema.parse({ confirmName: '' })).toThrow();
  });

  it('defaults deleteResources to false', () => {
    const parsed = deleteServerSchema.parse({ confirmName: 'prod-1' });
    expect(parsed.confirmName).toBe('prod-1');
    expect(parsed.deleteResources).toBe(false);
  });

  it('accepts deleteResources true', () => {
    const parsed = deleteServerSchema.parse({
      confirmName: 'prod-1',
      deleteResources: true,
    });
    expect(parsed.deleteResources).toBe(true);
  });
});
