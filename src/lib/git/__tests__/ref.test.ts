import { describe, expect, it } from 'vitest';
import { assertSafeGitRefName, isSafeGitRefName } from '../ref';

describe('isSafeGitRefName', () => {
  it('accepts ordinary branch names', () => {
    for (const ref of ['main', 'feature/x', 'release/v1.2.3', 'fix-123_a', 'a.b']) {
      expect(isSafeGitRefName(ref), ref).toBe(true);
    }
  });

  it('rejects shell metacharacters git itself allows in a refname', () => {
    const hostile = [
      'feature$(id -un)',
      'feature`whoami`',
      'feature${IFS}x',
      'a;rm -rf /',
      'a|b',
      'a&b',
      'a b',
      'a\nb',
      "a'b",
      'a"b',
      'a>b',
    ];
    for (const ref of hostile) {
      expect(isSafeGitRefName(ref), ref).toBe(false);
    }
  });

  it('rejects refs git would parse as an option or a refspec', () => {
    expect(isSafeGitRefName('-x')).toBe(false);
    expect(isSafeGitRefName('--upload-pack=touch /tmp/pwn')).toBe(false);
    expect(isSafeGitRefName('src:dst')).toBe(false);
  });

  it('rejects malformed refnames', () => {
    for (const ref of ['', '/a', 'a/', 'a//b', 'a..b', '.a', 'a.', 'x.lock']) {
      expect(isSafeGitRefName(ref), JSON.stringify(ref)).toBe(false);
    }
    expect(isSafeGitRefName('a'.repeat(256))).toBe(false);
    expect(isSafeGitRefName('a'.repeat(255))).toBe(true);
  });

  it('rejects non-string input', () => {
    expect(isSafeGitRefName(null)).toBe(false);
    expect(isSafeGitRefName(undefined)).toBe(false);
  });
});

describe('assertSafeGitRefName', () => {
  it('returns the ref when it is safe', () => {
    expect(assertSafeGitRefName('feature/x')).toBe('feature/x');
  });

  it('throws with the offending value and label', () => {
    expect(() => assertSafeGitRefName('feature$(id -un)')).toThrow(/Invalid branch/);
    expect(() => assertSafeGitRefName('a b', 'head branch')).toThrow(/Invalid head branch/);
  });
});
