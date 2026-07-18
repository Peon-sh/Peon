import './env';

export type ApiResponse<T = unknown> = {
  status: number;
  body: T;
  headers: Headers;
};

type RequestOpts = {
  body?: unknown;
  headers?: Record<string, string>;
  searchParams?: Record<string, string>;
};

/** Shared cookie jar for the live Next.js API server under test. */
export const cookieJar = new Map<string, string>();

export function clearCookies(): void {
  cookieJar.clear();
}

export function baseUrl(): string {
  return (process.env.PEON_TEST_BASE_URL ?? 'http://127.0.0.1:3100').replace(/\/$/, '');
}

function applySetCookie(res: Response): void {
  const headers = res.headers as Headers & { getSetCookie?: () => string[] };
  const raw = typeof headers.getSetCookie === 'function' ? headers.getSetCookie() : [];
  const fallback = res.headers.get('set-cookie');
  const cookies = raw.length ? raw : fallback ? [fallback] : [];
  for (const entry of cookies) {
    const [pair] = entry.split(';');
    const eq = pair.indexOf('=');
    if (eq <= 0) continue;
    const name = pair.slice(0, eq).trim();
    const value = pair.slice(eq + 1).trim();
    if (!value || value === '' || entry.toLowerCase().includes('max-age=0')) {
      cookieJar.delete(name);
    } else {
      cookieJar.set(name, value);
    }
  }
}

export async function api<T = { success?: boolean; data?: unknown; message?: string; code?: string }>(
  method: string,
  path: string,
  opts?: RequestOpts,
): Promise<ApiResponse<T>> {
  const url = new URL(path.startsWith('http') ? path : `${baseUrl()}${path.startsWith('/') ? path : `/${path}`}`);
  if (opts?.searchParams) {
    for (const [k, v] of Object.entries(opts.searchParams)) {
      url.searchParams.set(k, v);
    }
  }

  const headers = new Headers(opts?.headers);
  if (cookieJar.size > 0) {
    headers.set(
      'cookie',
      [...cookieJar.entries()].map(([k, v]) => `${k}=${v}`).join('; '),
    );
  }

  let body: string | undefined;
  if (opts?.body !== undefined) {
    headers.set('content-type', 'application/json');
    body = JSON.stringify(opts.body);
  }

  const res = await fetch(url, { method, headers, body, redirect: 'manual' });
  applySetCookie(res);

  const text = await res.text();
  let parsed: T;
  try {
    parsed = text ? (JSON.parse(text) as T) : (null as T);
  } catch {
    parsed = text as unknown as T;
  }
  return { status: res.status, body: parsed, headers: res.headers };
}

export const http = {
  get: <T = any>(path: string, opts?: RequestOpts) => api<T>('GET', path, opts),
  post: <T = any>(path: string, opts?: RequestOpts) => api<T>('POST', path, opts),
  put: <T = any>(path: string, opts?: RequestOpts) => api<T>('PUT', path, opts),
  patch: <T = any>(path: string, opts?: RequestOpts) => api<T>('PATCH', path, opts),
  delete: <T = any>(path: string, opts?: RequestOpts) => api<T>('DELETE', path, opts),
};
