import { describe, it, expect, beforeEach } from 'vitest';
import { assertAuthRateLimit } from '../auth-rate-limit';
import { clearRateLimitStore } from '@/lib/rate-limit';
import { RateLimitError } from '@/lib/errors';

function headersWithIp(ip: string): Headers {
  return new Headers({ 'x-forwarded-for': ip });
}

describe('assertAuthRateLimit', () => {
  beforeEach(() => {
    clearRateLimitStore();
  });

  it('rate limits login by email independently of ip', () => {
    const email = 'user@peon.test';
    for (let i = 0; i < 10; i += 1) {
      assertAuthRateLimit('login', headersWithIp(`203.0.113.${i}`), email);
    }
    expect(() => assertAuthRateLimit('login', headersWithIp('203.0.113.99'), email)).toThrow(
      RateLimitError,
    );
  });

  it('rate limits login by ip independently of email', () => {
    const ipHeaders = headersWithIp('198.51.100.10');
    for (let i = 0; i < 20; i += 1) {
      assertAuthRateLimit('login', ipHeaders, `user-${i}@peon.test`);
    }
    expect(() => assertAuthRateLimit('login', ipHeaders, 'other@peon.test')).toThrow(RateLimitError);
  });
});
