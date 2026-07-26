/**
 * Deterministic fixture data for UI-only development.
 *
 * ## Why this exists
 *
 * Working on a Peon screen normally means running Postgres, a worker, a queue
 * and often a real server. On a low-resource machine that is prohibitive, and it
 * is entirely unnecessary for layout, states, forms and navigation work.
 *
 * ## Where it plugs in
 *
 * At the API-client boundary (`src/services/api/*`), **not** inside components.
 * That boundary is already the single path the UI uses to reach the server, so
 * one switch there covers every screen. There must be no `if (UI_MODE)` inside
 * `src/components/**` — a CI check asserts that.
 *
 * ## Safety
 *
 * `isUiFixtureMode()` returns false in production unconditionally, regardless of
 * env. Serving fabricated data from a production build would be a security
 * incident, not a bug, so the guard does not trust configuration alone.
 */

export const UI_FIXTURE_ENV = 'NEXT_PUBLIC_PEON_UI_MODE';

/**
 * True only when fixture mode is explicitly on **and** this is not a production
 * build. The `NODE_ENV` check is deliberately not overridable.
 */
export function isUiFixtureMode(): boolean {
  if (process.env.NODE_ENV === 'production') return false;
  return process.env[UI_FIXTURE_ENV] === '1';
}

/** Stable timestamps so snapshots and visual diffs do not churn. */
const T0 = '2026-01-15T10:00:00.000Z';
const T1 = '2026-01-15T11:30:00.000Z';
const T2 = '2026-01-16T09:15:00.000Z';

export const fixtureUser = {
  id: 'usr_fixture',
  email: 'dev@peon.local',
  name: 'Fixture Developer',
  profilePicture: null,
  hasPassword: true,
  isInstanceAdmin: true,
  isInstanceOwner: true,
  isOnboarded: true,
};

export const fixtureWorkspaces = [
  {
    id: 'ws_fixture',
    name: 'Fixture Workspace',
    slug: 'fixture-workspace',
    personal: false,
    role: 'OWNER' as const,
    createdAt: T0,
  },
  {
    id: 'ws_second',
    name: 'Second Workspace',
    slug: 'second-workspace',
    personal: true,
    role: 'MEMBER' as const,
    createdAt: T0,
  },
];

export const fixtureProjects = [
  {
    id: 'prj_web',
    name: 'Web Platform',
    description: 'Marketing site and dashboard',
    workspaceId: 'ws_fixture',
    createdAt: T0,
    serviceCount: 3,
  },
  {
    id: 'prj_api',
    name: 'API Services',
    description: null,
    workspaceId: 'ws_fixture',
    createdAt: T1,
    serviceCount: 2,
  },
  {
    id: 'prj_empty',
    name: 'Empty Project',
    description: 'Exercises the empty state',
    workspaceId: 'ws_fixture',
    createdAt: T2,
    serviceCount: 0,
  },
];

/** Covers both execution modes so the UI can be checked for either. */
export const fixtureServers = [
  {
    id: 'srv_local',
    uuid: 'srv-local-uuid',
    name: 'This server',
    description: 'The machine Peon is running on.',
    executionMode: 'LOCAL' as const,
    ip: 'local',
    port: 22,
    user: 'root',
    proxyType: 'TRAEFIK' as const,
    proxyStatus: 'running',
    isReachable: true,
    isUsable: true,
    highDiskUsage: false,
    workspaceId: 'ws_fixture',
    createdAt: T0,
  },
  {
    id: 'srv_remote',
    uuid: 'srv-remote-uuid',
    name: 'production-1',
    description: 'Hetzner CX41',
    executionMode: 'REMOTE' as const,
    ip: '203.0.113.10',
    port: 22,
    user: 'root',
    proxyType: 'TRAEFIK' as const,
    proxyStatus: 'running',
    isReachable: true,
    isUsable: true,
    highDiskUsage: false,
    workspaceId: 'ws_fixture',
    createdAt: T1,
  },
  {
    id: 'srv_down',
    uuid: 'srv-down-uuid',
    name: 'staging-1',
    description: 'Exercises the unreachable state',
    executionMode: 'REMOTE' as const,
    ip: '203.0.113.11',
    port: 22,
    user: 'root',
    proxyType: 'CADDY' as const,
    proxyStatus: 'exited',
    isReachable: false,
    isUsable: false,
    highDiskUsage: true,
    workspaceId: 'ws_fixture',
    createdAt: T1,
  },
];

/** One service per ServiceKind and per interesting status. */
export const fixtureServices = [
  {
    id: 'svc_web',
    uuid: 'svc-web-uuid',
    name: 'web',
    kind: 'GIT_APP' as const,
    status: 'RUNNING' as const,
    projectId: 'prj_web',
    serverId: 'srv_local',
    fqdn: 'app.example.com',
    gitRepository: 'https://github.com/example/web',
    gitBranch: 'main',
    createdAt: T0,
  },
  {
    id: 'svc_api',
    uuid: 'svc-api-uuid',
    name: 'api',
    kind: 'DOCKERFILE' as const,
    status: 'DEGRADED' as const,
    projectId: 'prj_web',
    serverId: 'srv_remote',
    fqdn: 'api.example.com',
    gitRepository: 'https://github.com/example/api',
    gitBranch: 'main',
    createdAt: T0,
  },
  {
    id: 'svc_db',
    uuid: 'svc-db-uuid',
    name: 'postgres',
    kind: 'DATABASE' as const,
    status: 'RUNNING' as const,
    projectId: 'prj_web',
    serverId: 'srv_local',
    fqdn: null,
    databaseEngine: 'POSTGRESQL' as const,
    createdAt: T1,
  },
  {
    id: 'svc_stack',
    uuid: 'svc-stack-uuid',
    name: 'monitoring',
    kind: 'COMPOSE' as const,
    status: 'STOPPED' as const,
    projectId: 'prj_api',
    serverId: 'srv_remote',
    fqdn: null,
    createdAt: T1,
  },
  {
    id: 'svc_failed',
    uuid: 'svc-failed-uuid',
    name: 'worker',
    kind: 'DOCKER_IMAGE' as const,
    status: 'FAILED' as const,
    projectId: 'prj_api',
    serverId: 'srv_remote',
    fqdn: null,
    dockerRegistryImage: 'example/worker',
    dockerRegistryTag: 'latest',
    createdAt: T2,
  },
];

/** Every DeploymentStatus the UI renders differently. */
export const fixtureDeployments = [
  {
    id: 'dep_ok',
    uuid: 'dep-ok-uuid',
    serviceId: 'svc_web',
    status: 'FINISHED' as const,
    commitSha: 'a1b2c3d4e5f6',
    commitMessage: 'Fix header alignment on mobile',
    isPreview: false,
    createdAt: T2,
    startedAt: T2,
    finishedAt: T2,
  },
  {
    id: 'dep_running',
    uuid: 'dep-running-uuid',
    serviceId: 'svc_api',
    status: 'IN_PROGRESS' as const,
    commitSha: 'b2c3d4e5f6a1',
    commitMessage: 'Add rate limiting',
    isPreview: false,
    createdAt: T2,
    startedAt: T2,
    finishedAt: null,
  },
  {
    id: 'dep_queued',
    uuid: 'dep-queued-uuid',
    serviceId: 'svc_stack',
    status: 'QUEUED' as const,
    commitSha: null,
    commitMessage: null,
    isPreview: false,
    createdAt: T2,
    startedAt: null,
    finishedAt: null,
  },
  {
    id: 'dep_failed',
    uuid: 'dep-failed-uuid',
    serviceId: 'svc_failed',
    status: 'FAILED' as const,
    commitSha: 'c3d4e5f6a1b2',
    commitMessage: 'Bump dependencies',
    isPreview: false,
    createdAt: T1,
    startedAt: T1,
    finishedAt: T1,
  },
  {
    id: 'dep_cancelled',
    uuid: 'dep-cancelled-uuid',
    serviceId: 'svc_web',
    status: 'CANCELLED' as const,
    commitSha: 'd4e5f6a1b2c3',
    commitMessage: 'Experiment',
    isPreview: false,
    createdAt: T1,
    startedAt: T1,
    finishedAt: T1,
  },
  {
    id: 'dep_preview',
    uuid: 'dep-preview-uuid',
    serviceId: 'svc_web',
    status: 'FINISHED' as const,
    commitSha: 'e5f6a1b2c3d4',
    commitMessage: 'PR #42: new pricing page',
    isPreview: true,
    pullRequestId: 42,
    createdAt: T2,
    startedAt: T2,
    finishedAt: T2,
  },
];

export const fixtureMembers = [
  { userId: 'usr_fixture', email: 'dev@peon.local', name: 'Fixture Developer', role: 'OWNER' as const },
  { userId: 'usr_two', email: 'admin@peon.local', name: 'Ada Admin', role: 'ADMIN' as const },
  { userId: 'usr_three', email: 'member@peon.local', name: 'Mo Member', role: 'MEMBER' as const },
  { userId: 'usr_four', email: 'billing@peon.local', name: 'Bo Billing', role: 'BILLING_ADMIN' as const },
];

export const fixtureEnvVars = [
  { id: 'env_1', key: 'NODE_ENV', value: 'production', isPreview: false, isBuildtime: true, isRuntime: true },
  { id: 'env_2', key: 'DATABASE_URL', value: '••••••••', isPreview: false, isBuildtime: false, isRuntime: true },
  { id: 'env_3', key: 'FEATURE_FLAG', value: 'true', isPreview: false, isBuildtime: true, isRuntime: true },
];

export const fixtureLogs = [
  '2026-01-16T09:15:01.000Z Starting containers…',
  '2026-01-16T09:15:02.100Z Pulling image example/web:latest',
  '2026-01-16T09:15:08.400Z Created container peon-web',
  '2026-01-16T09:15:09.000Z Waiting for healthcheck to pass on the new container.',
  '2026-01-16T09:15:14.200Z Healthcheck passed.',
  '2026-01-16T09:15:14.300Z Rolling update complete — active container is peon-web.',
  '2026-01-16T09:15:14.400Z Deployment finished successfully.',
];

/** Named UI states so every screen can be driven without a backend. */
export type FixtureState = 'ready' | 'loading' | 'empty' | 'error';

export const FIXTURE_STATES: FixtureState[] = ['ready', 'loading', 'empty', 'error'];

/** Error shaped like the real API envelope, so error rendering is exercised. */
export const fixtureError = {
  success: false as const,
  message: 'Something went wrong while loading this resource.',
  code: 'INTERNAL_ERROR',
};
