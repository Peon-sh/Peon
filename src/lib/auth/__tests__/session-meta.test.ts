import { describe, expect, it } from 'vitest';
import { extractSessionMeta, parseUserAgent } from '../session-meta';

describe('parseUserAgent', () => {
  it('parses Chrome on macOS', () => {
    const ua =
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
    const parsed = parseUserAgent(ua);
    expect(parsed.browser).toMatch(/^Chrome /);
    expect(parsed.browserEngine).toBe('Blink');
    expect(parsed.os).toMatch(/^macOS/);
    expect(parsed.deviceType).toBe('desktop');
    expect(parsed.deviceName).toBe('Mac');
  });

  it('parses iPhone Safari', () => {
    const ua =
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Mobile/15E148 Safari/604.1';
    const parsed = parseUserAgent(ua);
    expect(parsed.deviceType).toBe('mobile');
    expect(parsed.deviceName).toBe('iPhone');
    expect(parsed.os).toMatch(/^iOS/);
  });

  it('handles empty UA', () => {
    expect(parseUserAgent(null).deviceType).toBe('unknown');
  });
});

describe('extractSessionMeta', () => {
  it('reads IP, language, country, and client hints', () => {
    const headers = new Headers({
      'user-agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      'x-forwarded-for': '203.0.113.10, 10.0.0.1',
      'accept-language': 'en-US,en;q=0.9',
      'cf-ipcountry': 'IN',
      'sec-ch-ua': '"Google Chrome";v="131", "Chromium";v="131"',
      'sec-ch-ua-platform': '"macOS"',
      'sec-ch-ua-mobile': '?0',
    });
    const meta = extractSessionMeta(headers);
    expect(meta.ip).toBe('203.0.113.10');
    expect(meta.acceptLanguage).toBe('en-US');
    expect(meta.country).toBe('IN');
    expect(meta.browser).toContain('Google Chrome');
    expect(meta.platform).toBe('macOS');
    expect(meta.deviceType).toBe('desktop');
  });
});
