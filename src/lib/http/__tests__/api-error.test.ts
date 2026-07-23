import { describe, expect, it } from 'vitest';
import {
  ApiRequestError,
  apiErrorMessage,
  isAccessOrBillingError,
} from '@/lib/http/api-error';

describe('apiErrorMessage', () => {
  it('prefers ApiRequestError message', () => {
    expect(apiErrorMessage(new ApiRequestError('No access', 'FORBIDDEN', 403))).toBe('No access');
  });

  it('falls back for unknown values', () => {
    expect(apiErrorMessage(null)).toBe('Something went wrong');
  });
});

describe('isAccessOrBillingError', () => {
  it('detects billing and forbidden codes', () => {
    expect(isAccessOrBillingError(new ApiRequestError('x', 'BILLING_READ_ONLY', 403))).toBe(true);
    expect(isAccessOrBillingError(new ApiRequestError('x', 'FORBIDDEN', 403))).toBe(true);
    expect(isAccessOrBillingError(new ApiRequestError('x', 'BILLING_REQUIRED', 402))).toBe(true);
    expect(isAccessOrBillingError(new Error('network'))).toBe(false);
  });
});
