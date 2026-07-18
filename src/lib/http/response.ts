import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { AppError, ValidationError } from '@/lib/errors';

export function ok<T>(data: T, init?: number | ResponseInit) {
  const status = typeof init === 'number' ? init : (init?.status ?? 200);
  return NextResponse.json({ success: true, data }, { status });
}

export function created<T>(data: T) {
  return ok(data, 201);
}

export function fail(message: string, status = 400, code = 'BAD_REQUEST', details?: unknown) {
  return NextResponse.json(
    { success: false, message, code, ...(details ? { details } : {}) },
    { status },
  );
}

/** Convert thrown errors into a consistent JSON response. */
export function handleError(error: unknown) {
  if (error instanceof ZodError) {
    return fail('Validation failed', 422, 'VALIDATION_ERROR', error.issues);
  }
  if (error instanceof ValidationError) {
    return fail(error.message, error.status, error.code, error.details);
  }
  if (error instanceof AppError) {
    return fail(error.message, error.status, error.code);
  }
  console.error('[unhandled route error]', error);
  return fail('Internal server error', 500, 'INTERNAL_ERROR');
}

/** Wrap a route handler with automatic error handling. */
export function route<Args extends unknown[]>(
  handler: (...args: Args) => Promise<Response>,
) {
  return async (...args: Args): Promise<Response> => {
    try {
      return await handler(...args);
    } catch (error) {
      return handleError(error);
    }
  };
}
