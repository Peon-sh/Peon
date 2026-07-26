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

describe('updateServerSchema hostKeyFingerprint', () => {
  const fingerprint = 'SHA256:xgaHZJqeRCRLgfyYleqvphpKFa/cJFqZZ3s0bWVSvDc';

  it('normalizes a pasted ssh-keygen -lf line', () => {
    const parsed = updateServerSchema.parse({
      hostKeyFingerprint: `256 ${fingerprint} peon-test (ED25519)`,
    });
    expect(parsed.hostKeyFingerprint).toBe(fingerprint);
  });

  it('accepts clearing the trusted host key', () => {
    const parsed = updateServerSchema.parse({ hostKeyFingerprint: null });
    expect(parsed.hostKeyFingerprint).toBeNull();
  });

  it('rejects a fingerprint it cannot parse', () => {
    expect(() => updateServerSchema.parse({ hostKeyFingerprint: 'not-a-fingerprint' })).toThrow();
    expect(() =>
      updateServerSchema.parse({ hostKeyFingerprint: '16:27:ac:a5:76:28:2d:36' }),
    ).toThrow();
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
