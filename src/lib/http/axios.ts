import axios from 'axios';
import { ApiRequestError } from '@/lib/http/api-error';
import { isUiFixtureMode } from '@/lib/dev-fixtures';

export const api = axios.create({
  baseURL: '/api',
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' },
});

/**
 * UI-only development mode.
 *
 * This is the **single** conditional that activates fixtures. Swapping axios's
 * adapter replaces the transport for every request the UI makes, so no file
 * under `src/services/api/` and no component needs to know this mode exists.
 *
 * `isUiFixtureMode()` returns false in production unconditionally, so a
 * production bundle can never reach the fixture adapter regardless of how the
 * environment is configured.
 */
if (isUiFixtureMode()) {
  // Assigned synchronously so no request can slip out before the adapter is
  // installed; the fixture module itself is imported lazily on first use so it
  // is not pulled into normal builds.
  api.defaults.adapter = async (config) => {
    const { fixtureAdapter } = await import('@/lib/dev-fixtures/adapter');
    return fixtureAdapter(config);
  };
  if (typeof window !== 'undefined') {
    console.info(
      '[peon] UI fixture mode: all API calls are served from src/lib/dev-fixtures. ' +
        'Append ?__fixture=loading|empty|error to force a UI state.',
    );
  }
}

export interface ApiSuccess<T> {
  success: true;
  data: T;
}

export interface ApiError {
  success: false;
  message: string;
  code: string;
  details?: unknown;
}

function toApiRequestError(err: unknown): Error {
  if (axios.isAxiosError(err)) {
    const data = err.response?.data as Partial<ApiError> | undefined;
    if (data?.message) {
      return new ApiRequestError(
        data.message,
        typeof data.code === 'string' ? data.code : 'HTTP_ERROR',
        err.response?.status,
      );
    }
    return new ApiRequestError(err.message || 'Request failed', 'HTTP_ERROR', err.response?.status);
  }
  if (err instanceof Error) return err;
  return new ApiRequestError('Request failed');
}

/** Unwrap the `data` envelope, throwing a readable error on failure. */
export async function unwrap<T>(promise: Promise<{ data: ApiSuccess<T> | ApiError }>): Promise<T> {
  try {
    const res = await promise;
    if (res.data.success) return res.data.data;
    throw new ApiRequestError(res.data.message, res.data.code);
  } catch (err) {
    if (err instanceof ApiRequestError) throw err;
    throw toApiRequestError(err);
  }
}
