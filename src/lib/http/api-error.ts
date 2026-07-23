/** Client-side API failure with optional Stripe/billing/auth codes from the server. */
export class ApiRequestError extends Error {
  code: string;
  status?: number;

  constructor(message: string, code = 'UNKNOWN', status?: number) {
    super(message);
    this.name = 'ApiRequestError';
    this.code = code;
    this.status = status;
  }
}

export function isApiRequestError(error: unknown): error is ApiRequestError {
  return error instanceof ApiRequestError;
}

/** Human-readable message for query / mutation failures. */
export function apiErrorMessage(error: unknown, fallback = 'Something went wrong'): string {
  if (isApiRequestError(error)) return error.message || fallback;
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

/** Billing / permission codes that should never look like a loading state. */
export function isAccessOrBillingError(error: unknown): boolean {
  if (!isApiRequestError(error)) return false;
  return (
    error.status === 402 ||
    error.status === 403 ||
    error.code === 'BILLING_REQUIRED' ||
    error.code === 'BILLING_READ_ONLY' ||
    error.code === 'PROJECTS_OVER_LIMIT' ||
    error.code === 'SEATS_EXHAUSTED' ||
    error.code === 'FORBIDDEN' ||
    error.code === 'UNAUTHORIZED'
  );
}
