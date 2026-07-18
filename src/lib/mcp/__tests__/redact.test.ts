import { describe, expect, it } from 'vitest';
import { redactByKeys, redactObject, redactText, redactValue } from '../catalog/redact';

describe('catalog redact', () => {
  it('redacts sensitive object keys', () => {
    expect(
      redactObject({
        key: 'DATABASE_URL',
        value: 'postgres://secret',
        serviceId: 'svc1',
      }),
    ).toEqual({
      key: 'DATABASE_URL',
      value: '[REDACTED]',
      serviceId: 'svc1',
    });
  });

  it('redacts by explicit keys', () => {
    expect(redactByKeys({ raw: 'FOO=bar', serviceId: 's1' }, ['raw'])).toEqual({
      raw: '[REDACTED]',
      serviceId: 's1',
    });
  });

  it('redacts nested values and env-like text', () => {
    expect(redactValue({ nested: { password: 'x' } })).toEqual({
      nested: { password: '[REDACTED]' },
    });
    expect(redactText('export API_KEY=supersecretvalue')).toContain('API_KEY=[REDACTED]');
  });
});
