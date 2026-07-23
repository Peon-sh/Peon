import axios from 'axios';
import { ApiRequestError } from '@/lib/http/api-error';

export const api = axios.create({
  baseURL: '/api',
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' },
});

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
