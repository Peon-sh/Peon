import { describe, expect, it } from 'vitest';
import {
  isDnsHostname,
  isIpv4Literal,
  isIpv6Literal,
  isValidSshHost,
  normalizeSshHost,
  sshConnectHostOptions,
} from '../host';

describe('normalizeSshHost', () => {
  it('trims and unwraps bracketed IPv6', () => {
    expect(normalizeSshHost('  [2001:db8::1]  ')).toBe('2001:db8::1');
    expect(normalizeSshHost('[2001:db8::1]:22')).toBe('2001:db8::1');
  });

  it('strips user@ prefix', () => {
    expect(normalizeSshHost('root@h1.example.com')).toBe('h1.example.com');
  });
});

describe('host classification', () => {
  it('detects IPv4 / IPv6 / hostname', () => {
    expect(isIpv4Literal('203.0.113.10')).toBe(true);
    expect(isIpv6Literal('2a01:4f9:c013:e2e::1')).toBe(true);
    expect(isIpv6Literal('[2a01:4f9:c013:e2e::1]')).toBe(true);
    expect(isDnsHostname('h1.anantparmar.com')).toBe(true);
    expect(isDnsHostname('localhost')).toBe(true);
    expect(isDnsHostname('203.0.113.10')).toBe(false);
  });

  it('accepts valid hosts and rejects junk', () => {
    expect(isValidSshHost('h1.example.com')).toBe(true);
    expect(isValidSshHost('2a01:4f9:c013:e2e::1')).toBe(true);
    expect(isValidSshHost('not a host!!')).toBe(false);
    expect(isValidSshHost('')).toBe(false);
    // Invalid IPv4 must not be accepted as a "hostname"
    expect(isValidSshHost('172.81.134.2222222')).toBe(false);
    expect(isDnsHostname('172.81.134.2222222')).toBe(false);
  });
});

describe('sshConnectHostOptions', () => {
  it('forces IPv6 for literal addresses', () => {
    expect(sshConnectHostOptions('2a01:4f9:c013:e2e::1')).toEqual({
      host: '2a01:4f9:c013:e2e::1',
      forceIPv6: true,
    });
    expect(sshConnectHostOptions('[2001:db8::10]')).toEqual({
      host: '2001:db8::10',
      forceIPv6: true,
    });
  });

  it('forces IPv4 for literal addresses', () => {
    expect(sshConnectHostOptions('10.0.0.5')).toEqual({
      host: '10.0.0.5',
      forceIPv4: true,
    });
  });

  it('leaves hostnames unforced so DNS can return A or AAAA', () => {
    expect(sshConnectHostOptions('h1.anantparmar.com')).toEqual({
      host: 'h1.anantparmar.com',
    });
  });
});
