import axios from 'axios';

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

/** Unwrap the `data` envelope, throwing a readable error on failure. */
export async function unwrap<T>(promise: Promise<{ data: ApiSuccess<T> | ApiError }>): Promise<T> {
  try {
    const res = await promise;
    if (res.data.success) return res.data.data;
    throw new Error(res.data.message);
  } catch (err) {
    if (axios.isAxiosError(err) && err.response?.data?.message) {
      throw new Error(err.response.data.message);
    }
    throw err;
  }
}
