import { describe, expect, it } from 'vitest';
import { isAgentLive, tokensMatch, generateAgentToken } from '@/services/internal/server/agent';
import { encrypt } from '@/lib/crypto/encryption';

describe('agent helpers', () => {
  it('generateAgentToken returns a non-empty token', () => {
    expect(generateAgentToken().length).toBeGreaterThan(20);
  });

  it('tokensMatch accepts encrypted stored tokens', () => {
    process.env.ENCRYPTION_KEY = 'ZGV2LW9ubHktMzJieXRlLWtleS1jaGFuZ2UtbWUtMDEyMzQ1Ng==';
    const plain = 'test-agent-token-value';
    const stored = encrypt(plain);
    expect(tokensMatch(stored, plain)).toBe(true);
    expect(tokensMatch(stored, 'wrong')).toBe(false);
  });

  it('isAgentLive respects stale window', () => {
    const now = new Date('2026-07-16T12:00:00Z');
    expect(isAgentLive(new Date('2026-07-16T11:58:00Z'), now)).toBe(true);
    expect(isAgentLive(new Date('2026-07-16T11:50:00Z'), now)).toBe(false);
    expect(isAgentLive(null, now)).toBe(false);
  });
});
