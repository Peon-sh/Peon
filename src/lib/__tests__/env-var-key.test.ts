import { describe, expect, it } from 'vitest';
import { AppError } from '../errors';
import { assertValidEnvVarKey, isValidEnvVarKey, MAX_ENV_VAR_KEY_LENGTH } from '../env-var-key';

describe('isValidEnvVarKey', () => {
  it('accepts ordinary variable names', () => {
    for (const key of ['FOO', '_FOO', 'FOO_BAR_1', 'A', 'NEXT_PUBLIC_API_URL', '_']) {
      expect(isValidEnvVarKey(key), key).toBe(true);
    }
    expect(isValidEnvVarKey('A'.repeat(MAX_ENV_VAR_KEY_LENGTH))).toBe(true);
  });

  it('rejects names a shell would not treat as an assignment', () => {
    const bad = [
      '1FOO',
      'FOO-BAR',
      'FOO BAR',
      'FOO.BAR',
      'FOO=BAR',
      'FOO;id',
      'FOO|id',
      'FOO&id',
      'FOO$(id)',
      'FOO`id`',
      'FOO\nBAR',
      'FOO\tBAR',
      '',
    ];
    for (const key of bad) {
      expect(isValidEnvVarKey(key), JSON.stringify(key)).toBe(false);
    }
    expect(isValidEnvVarKey('A'.repeat(MAX_ENV_VAR_KEY_LENGTH + 1))).toBe(false);
  });

  it('rejects non-string input', () => {
    expect(isValidEnvVarKey(null)).toBe(false);
    expect(isValidEnvVarKey(undefined)).toBe(false);
    expect(isValidEnvVarKey(42)).toBe(false);
  });
});

describe('assertValidEnvVarKey', () => {
  it('returns the key when it is valid', () => {
    expect(assertValidEnvVarKey('FOO_BAR')).toBe('FOO_BAR');
  });

  it('throws a 400 naming the offending key', () => {
    try {
      assertValidEnvVarKey('FOO BAR');
      throw new Error('expected assertValidEnvVarKey to throw');
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      expect((err as AppError).status).toBe(400);
      expect((err as AppError).message).toContain('FOO BAR');
    }
  });
});
