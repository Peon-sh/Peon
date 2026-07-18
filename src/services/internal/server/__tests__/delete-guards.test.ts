import { describe, expect, it } from 'vitest';
import { checkServerDelete } from '../delete-guards';

describe('checkServerDelete', () => {
  it('rejects when confirmName does not match', () => {
    const result = checkServerDelete({
      serverName: 'prod',
      confirmName: 'staging',
      resourceCount: 0,
      deleteResources: false,
    });
    expect(result).toMatchObject({ ok: false, reason: 'name_mismatch' });
  });

  it('trims confirmName before comparing', () => {
    expect(
      checkServerDelete({
        serverName: 'prod',
        confirmName: '  prod  ',
        resourceCount: 0,
        deleteResources: false,
      }),
    ).toEqual({ ok: true });
  });

  it('blocks when resources exist and deleteResources is false', () => {
    const result = checkServerDelete({
      serverName: 'prod',
      confirmName: 'prod',
      resourceCount: 2,
      deleteResources: false,
    });
    expect(result).toMatchObject({ ok: false, reason: 'has_resources' });
    expect(result.ok === false && result.message).toContain('2 resources');
  });

  it('allows cascade when deleteResources is true', () => {
    expect(
      checkServerDelete({
        serverName: 'prod',
        confirmName: 'prod',
        resourceCount: 3,
        deleteResources: true,
      }),
    ).toEqual({ ok: true });
  });

  it('allows empty servers', () => {
    expect(
      checkServerDelete({
        serverName: 'prod',
        confirmName: 'prod',
        resourceCount: 0,
        deleteResources: false,
      }),
    ).toEqual({ ok: true });
  });
});
