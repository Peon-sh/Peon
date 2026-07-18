import { describe, expect, it } from 'vitest';
import { friendlyS3Error } from '../errors';

describe('friendlyS3Error', () => {
  it('maps 404 / NoSuchBucket to a bucket-not-found message', () => {
    expect(
      friendlyS3Error({
        name: 'UnknownError',
        message: 'UnknownError',
        $metadata: { httpStatusCode: 404 },
      }),
    ).toMatch(/bucket not found/i);
  });

  it('maps 403 to access denied', () => {
    expect(
      friendlyS3Error({
        name: 'AccessDenied',
        message: 'Access Denied',
        $metadata: { httpStatusCode: 403 },
      }),
    ).toMatch(/access denied/i);
  });

  it('replaces bare UnknownError with a generic reachable hint', () => {
    expect(friendlyS3Error({ name: 'UnknownError', message: 'UnknownError' })).toMatch(
      /could not reach the bucket/i,
    );
  });

  it('keeps a useful SDK message', () => {
    expect(friendlyS3Error(new Error('The specified bucket does not exist'))).toMatch(
      /does not exist/i,
    );
  });
});
