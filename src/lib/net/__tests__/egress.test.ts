import { beforeEach, describe, expect, it, vi } from 'vitest';

const { lookup } = vi.hoisted(() => ({ lookup: vi.fn() }));

vi.mock('node:dns/promises', () => ({ lookup }));

import { assertSafeEgressUrl, assertSafeS3Endpoint, isAllowedEgressAddress } from '../egress';

function resolvesTo(...addresses: string[]) {
  lookup.mockResolvedValue(
    addresses.map((address) => ({ address, family: address.includes(':') ? 6 : 4 })),
  );
}

describe('isAllowedEgressAddress', () => {
  it('accepts routable IPv4', () => {
    for (const ip of ['1.1.1.1', '8.8.8.8', '140.82.121.5', '99.99.99.99']) {
      expect(isAllowedEgressAddress(ip), ip).toBe(true);
    }
  });

  it('accepts private LAN ranges so self-hosted targets stay reachable', () => {
    for (const ip of [
      '10.1.2.3',
      '172.16.0.1',
      '172.31.255.254',
      '192.168.1.1',
      '100.64.0.1',
      '100.127.255.255',
    ]) {
      expect(isAllowedEgressAddress(ip), ip).toBe(true);
    }
  });

  it('rejects metadata, loopback and unusable IPv4', () => {
    for (const ip of [
      '0.0.0.0',
      '127.0.0.1',
      '127.1.2.3',
      '169.254.169.254',
      '169.254.0.1',
      '100.100.100.200',
      '224.0.0.1',
      '255.255.255.255',
    ]) {
      expect(isAllowedEgressAddress(ip), ip).toBe(false);
    }
  });

  it('blocks only the Alibaba metadata address inside carrier NAT', () => {
    expect(isAllowedEgressAddress('100.100.100.200')).toBe(false);
    expect(isAllowedEgressAddress('100.100.100.201')).toBe(true);
    expect(isAllowedEgressAddress('100.100.100.199')).toBe(true);
  });

  it('accepts unique-local IPv6 but rejects loopback, link-local and multicast', () => {
    for (const ip of ['fc00::1', 'fd12:3456::1']) {
      expect(isAllowedEgressAddress(ip), ip).toBe(true);
    }
    for (const ip of ['::', '::1', 'fe80::1', 'ff02::1']) {
      expect(isAllowedEgressAddress(ip), ip).toBe(false);
    }
  });

  it('rejects AWS IPv6 instance metadata', () => {
    expect(isAllowedEgressAddress('fd00:ec2::254')).toBe(false);
    expect(isAllowedEgressAddress('fd00:ec2::255')).toBe(true);
  });

  it('accepts routable IPv6', () => {
    for (const ip of ['2606:4700:4700::1111', '2001:4860:4860::8888']) {
      expect(isAllowedEgressAddress(ip), ip).toBe(true);
    }
  });

  it('judges IPv4-carrying IPv6 forms by the address they reach', () => {
    expect(isAllowedEgressAddress('::ffff:169.254.169.254')).toBe(false);
    expect(isAllowedEgressAddress('::ffff:a9fe:a9fe')).toBe(false);
    expect(isAllowedEgressAddress('::ffff:127.0.0.1')).toBe(false);
    expect(isAllowedEgressAddress('64:ff9b::169.254.169.254')).toBe(false);
    expect(isAllowedEgressAddress('2002:a9fe:a9fe::1')).toBe(false);
    expect(isAllowedEgressAddress('::ffff:1.1.1.1')).toBe(true);
    expect(isAllowedEgressAddress('::ffff:192.168.1.1')).toBe(true);
  });

  it('rejects malformed input rather than defaulting to allowed', () => {
    for (const ip of ['', 'localhost', '1.2.3', '1.2.3.4.5', '999.1.1.1', 'gg::1']) {
      expect(isAllowedEgressAddress(ip), ip).toBe(false);
    }
  });
});

describe('assertSafeEgressUrl', () => {
  beforeEach(() => {
    lookup.mockReset();
  });

  it('allows a public https URL', async () => {
    resolvesTo('140.82.121.5');
    await expect(assertSafeEgressUrl('https://api.github.com/app')).resolves.toMatchObject({
      hostname: 'api.github.com',
    });
  });

  it('allows a self-hosted target on a private network', async () => {
    resolvesTo('10.0.0.5');
    await expect(assertSafeEgressUrl('https://github.internal/api/v3')).resolves.toBeInstanceOf(
      URL,
    );
  });

  it('rejects http unless explicitly allowed', async () => {
    resolvesTo('1.1.1.1');
    await expect(assertSafeEgressUrl('http://example.com')).rejects.toThrow('must use https');
    await expect(
      assertSafeEgressUrl('http://example.com', { allowHttp: true }),
    ).resolves.toBeInstanceOf(URL);
  });

  it('rejects non-HTTP schemes', async () => {
    for (const raw of ['file:///etc/passwd', 'gopher://x/', 'ftp://x/']) {
      await expect(assertSafeEgressUrl(raw, { allowHttp: true }), raw).rejects.toThrow();
    }
    expect(lookup).not.toHaveBeenCalled();
  });

  it('rejects a literal metadata address without touching DNS', async () => {
    await expect(
      assertSafeEgressUrl('http://169.254.169.254/latest/meta-data/', { allowHttp: true }),
    ).rejects.toThrow(/restricted address.*own network/);
    expect(lookup).not.toHaveBeenCalled();
  });

  it('rejects octal, decimal and hex spellings of a loopback address', async () => {
    for (const raw of [
      'http://0177.0.0.1/',
      'http://2130706433/',
      'http://0x7f.0.0.1/',
      'http://127.1/',
      'http://[::ffff:169.254.169.254]/',
    ]) {
      await expect(assertSafeEgressUrl(raw, { allowHttp: true }), raw).rejects.toThrow(
        'restricted address',
      );
    }
    expect(lookup).not.toHaveBeenCalled();
  });

  it('rejects a hostname that resolves to metadata', async () => {
    resolvesTo('169.254.169.254');
    await expect(assertSafeEgressUrl('https://metadata.attacker.test')).rejects.toThrow(
      'restricted address',
    );
  });

  it('rejects when any one of several answers is restricted', async () => {
    resolvesTo('1.1.1.1', '169.254.169.254');
    await expect(assertSafeEgressUrl('https://split.attacker.test')).rejects.toThrow(
      'restricted address',
    );
  });

  it('rejects bracketed IPv6 loopback', async () => {
    await expect(assertSafeEgressUrl('http://[::1]:8080/x', { allowHttp: true })).rejects.toThrow(
      'restricted address',
    );
  });

  it('rejects embedded credentials', async () => {
    resolvesTo('1.1.1.1');
    await expect(assertSafeEgressUrl('https://user:pw@example.com')).rejects.toThrow(
      'must not embed credentials',
    );
  });

  it('rejects an unresolvable host instead of allowing it', async () => {
    lookup.mockRejectedValue(new Error('ENOTFOUND'));
    await expect(assertSafeEgressUrl('https://nope.invalid')).rejects.toThrow(
      'could not be resolved',
    );
  });

  it('rejects a garbage URL', async () => {
    await expect(assertSafeEgressUrl('not a url')).rejects.toThrow('not a valid URL');
  });

  it('uses the label in messages', async () => {
    await expect(
      assertSafeEgressUrl('http://169.254.169.254', { allowHttp: true, label: 'Webhook URL' }),
    ).rejects.toThrow(/^Webhook URL/);
  });

  it('skips empty S3 endpoints and rejects metadata hosts', async () => {
    await expect(assertSafeS3Endpoint(null)).resolves.toBeUndefined();
    await expect(assertSafeS3Endpoint('  ')).resolves.toBeUndefined();
    await expect(assertSafeS3Endpoint('http://169.254.169.254')).rejects.toThrow(/^S3 endpoint/);
    await expect(assertSafeS3Endpoint('169.254.169.254')).rejects.toThrow(/^S3 endpoint/);
  });
});
