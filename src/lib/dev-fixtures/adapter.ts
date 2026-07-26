import type { AxiosAdapter, AxiosRequestConfig, AxiosResponse } from 'axios';
import {
  fixtureDeployments,
  fixtureEnvVars,
  fixtureError,
  fixtureLogs,
  fixtureMembers,
  fixtureProjects,
  fixtureServers,
  fixtureServices,
  fixtureUser,
  fixtureWorkspaces,
} from './index';

/**
 * Axios adapter that answers from fixtures instead of the network.
 *
 * ## Why an adapter rather than editing the API clients
 *
 * Axios lets you replace the transport wholesale. Installing this as the adapter
 * means **no file under `src/services/api/` changes and no component changes at
 * all** — every request the UI makes is intercepted at one point. That is the
 * cleanest possible expression of "do not scatter `if (UI_MODE)` through the
 * codebase": there is exactly one conditional, in `lib/http/axios.ts`.
 *
 * ## Behaviour
 *
 * - Reads return fixture data in the real `{ success, data }` envelope.
 * - Writes return a plausible success without persisting; the UI proceeds as if
 *   the mutation worked. React Query will refetch and get the original fixture,
 *   which is correct for layout work and honest about not being a real backend.
 * - Unmatched routes return an empty array rather than 404, so a screen this
 *   file has not been taught about still renders its empty state instead of
 *   erroring.
 *
 * ## Forcing UI states
 *
 * Append `?__fixture=loading|empty|error` to the browser URL. `loading` never
 * resolves, `empty` returns `[]`, `error` returns the real API error envelope.
 */

/** Milliseconds of simulated latency, so skeletons are actually visible. */
const LATENCY_MS = 120;

function ok<T>(data: T, config: AxiosRequestConfig): AxiosResponse {
  return {
    data: { success: true, data },
    status: 200,
    statusText: 'OK',
    headers: {},
    config: config as never,
  };
}

function fail(config: AxiosRequestConfig): AxiosResponse {
  return {
    data: fixtureError,
    status: 500,
    statusText: 'Internal Server Error',
    headers: {},
    config: config as never,
  };
}

/** Read the forced state from the browser URL, if any. */
function forcedState(): 'loading' | 'empty' | 'error' | null {
  if (typeof window === 'undefined') return null;
  const value = new URLSearchParams(window.location.search).get('__fixture');
  return value === 'loading' || value === 'empty' || value === 'error' ? value : null;
}

type Handler = (match: RegExpMatchArray, config: AxiosRequestConfig) => unknown;

/**
 * Ordered route table. First match wins, so put specific patterns before
 * general ones. Paths are matched without the `/api` baseURL.
 */
const ROUTES: Array<[RegExp, Handler]> = [
  // --- identity ---
  [/^\/auth\/me$/, () => ({ user: fixtureUser, workspaces: fixtureWorkspaces })],
  [/^\/auth\/sessions$/, () => []],

  // --- workspaces ---
  [/^\/workspaces$/, () => fixtureWorkspaces],
  [/^\/workspaces\/([^/]+)\/projects$/, (m) =>
    fixtureProjects.filter((p) => p.workspaceId === m[1] || m[1] === 'ws_fixture')],
  [/^\/workspaces\/([^/]+)\/servers$/, () => fixtureServers],
  [/^\/workspaces\/([^/]+)\/members$/, () => fixtureMembers],
  [/^\/workspaces\/([^/]+)\/invitations$/, () => []],
  [/^\/workspaces\/([^/]+)\/tokens$/, () => []],
  [/^\/workspaces\/([^/]+)\/private-keys$/, () => []],
  [/^\/workspaces\/([^/]+)\/sources$/, () => []],
  [/^\/workspaces\/([^/]+)\/storages$/, () => []],
  [/^\/workspaces\/([^/]+)\/shared-variables$/, () => []],
  [/^\/workspaces\/([^/]+)\/tags$/, () => []],
  [/^\/workspaces\/([^/]+)\/notifications$/, () => []],
  [/^\/workspaces\/([^/]+)\/audit$/, () => ({ entries: [], total: 0 })],
  [/^\/workspaces\/([^/]+)\/billing$/, () => ({ subscription: null, entitled: true })],
  [/^\/workspaces\/([^/]+)\/deployments\/active$/, () =>
    fixtureDeployments.filter((d) => d.status === 'IN_PROGRESS' || d.status === 'QUEUED')],
  [/^\/workspaces\/([^/]+)$/, (m) =>
    fixtureWorkspaces.find((w) => w.id === m[1]) ?? fixtureWorkspaces[0]],

  // --- projects ---
  [/^\/projects\/([^/]+)\/services$/, (m) =>
    fixtureServices.filter((s) => s.projectId === m[1])],
  [/^\/projects\/([^/]+)\/members$/, () => fixtureMembers],
  [/^\/projects\/([^/]+)$/, (m) =>
    fixtureProjects.find((p) => p.id === m[1]) ?? fixtureProjects[0]],

  // --- services ---
  [/^\/services\/([^/]+)\/deployments$/, (m) =>
    fixtureDeployments.filter((d) => d.serviceId === m[1])],
  [/^\/services\/([^/]+)\/env$/, () => fixtureEnvVars],
  [/^\/services\/([^/]+)\/logs$/, () => ({ container: 'peon-web', lines: fixtureLogs })],
  [/^\/services\/([^/]+)\/volumes$/, () => []],
  [/^\/services\/([^/]+)\/tasks$/, () => []],
  [/^\/services\/([^/]+)\/backups$/, () => []],
  [/^\/services\/([^/]+)\/webhooks$/, () => []],
  [/^\/services\/([^/]+)\/previews$/, () => []],
  [/^\/services\/([^/]+)\/config$/, () => ({ values: {} })],
  [/^\/services\/([^/]+)$/, (m) =>
    fixtureServices.find((s) => s.id === m[1]) ?? fixtureServices[0]],

  // --- servers ---
  [/^\/servers\/([^/]+)\/destinations$/, () => [{ id: 'dst_1', name: 'default', network: 'peon' }]],
  [/^\/servers\/([^/]+)\/logs$/, () => ({ lines: fixtureLogs })],
  [/^\/servers\/([^/]+)$/, (m) =>
    fixtureServers.find((s) => s.id === m[1]) ?? fixtureServers[0]],

  // --- deployments ---
  [/^\/deployments\/([^/]+)$/, (m) =>
    fixtureDeployments.find((d) => d.id === m[1]) ?? fixtureDeployments[0]],

  // --- platform ---
  [/^\/templates$/, () => []],
  [/^\/instance\/settings$/, () => ({
    settings: { instanceName: 'Peon (UI mode)', isRegistrationEnabled: true },
    oauth: [],
  })],
  [/^\/llm\/models$/, () => []],
  [/^\/chat\/threads$/, () => []],
  [/^\/health$/, () => ({ status: 'ok', ts: Date.now() })],
];

function resolvePath(config: AxiosRequestConfig): string {
  const url = config.url ?? '';
  // Strip the baseURL and any query string.
  return url.replace(/^\/api/, '').split('?')[0] ?? '';
}

function handleRead(config: AxiosRequestConfig): AxiosResponse {
  const path = resolvePath(config);
  for (const [pattern, handler] of ROUTES) {
    const match = path.match(pattern);
    if (match) return ok(handler(match, config), config);
  }
  // Unknown route: empty rather than 404, so unfamiliar screens still render.
  return ok([], config);
}

/**
 * Writes are acknowledged but not persisted. Echo the request body so optimistic
 * UI updates have something coherent to display.
 */
function handleWrite(config: AxiosRequestConfig): AxiosResponse {
  let body: unknown = {};
  try {
    body = typeof config.data === 'string' ? JSON.parse(config.data) : (config.data ?? {});
  } catch {
    body = {};
  }
  const payload = body && typeof body === 'object' ? body : {};
  return ok({ id: `fixture_${Date.now()}`, ...(payload as object) }, config);
}

export const fixtureAdapter: AxiosAdapter = async (config) => {
  const state = forcedState();

  if (state === 'loading') {
    // Never settles: leaves the UI in its loading state for inspection.
    return new Promise<AxiosResponse>(() => {});
  }

  await new Promise((r) => setTimeout(r, LATENCY_MS));

  if (state === 'error') {
    return Promise.reject(
      Object.assign(new Error('Fixture error'), {
        isAxiosError: true,
        response: fail(config),
        config,
      }),
    );
  }

  if (state === 'empty') return ok([], config);

  const method = (config.method ?? 'get').toLowerCase();
  return method === 'get' ? handleRead(config) : handleWrite(config);
};
