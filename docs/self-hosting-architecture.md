# Peon Self-Hosting Architecture — Phase 0 Audit

**Status:** Phase 0 complete. This document records the *current* state of the repository as verified by reading the code on 2026-07-27, before any refactor work. It confirms or corrects the assumptions in the refactor brief.

**Method:** static reading only. No code was executed (see [Working constraints](#working-constraints)). Every claim below cites a file and line. Where the brief's assumption differs from the code, the difference is called out explicitly.

---

## Working constraints

The supervising developer's machine is 4 CPU / 8 GB RAM, and **no project code may be executed on it**. Consequences for this refactor:

- All validation runs in GitHub Actions, not locally.
- No checklist item is marked `[x]` on the agent's authority. Completion requires evidence from a CI run or an explicit developer confirmation.
- Tests are written to be runnable by CI; the agent does not run them.
- Heavy artifacts (Docker builds, Chromium, integration suites) are CI-only.

---

## 1. What Peon is today

A Next.js 16 control plane plus SQS-driven workers that SSH into customer Linux servers and drive Docker there. ~55k lines TypeScript, 47 Prisma models, 24 migrations, 126 REST routes, 107 MCP tools, 333 service templates, 83 unit test files, 11 integration suites.

**The control plane never runs customer containers.** Verified three ways:

- Every deployment requires a target server — `deploy/engine.ts:416`: `if (!svc.serverId) throw new Error('Service has no target server.')`
- Every Docker command is a shell string sent through `sshPool` (`src/lib/ssh/pool.ts`)
- `grep child_process` across `src/`, `worker/`, `prisma/` returns hits **only** in `src/test/integration/global-setup.ts`

`dockerode` is declared at `package.json:57` and **imported nowhere**. It is a phantom dependency. This is relevant to Phase 7: a local executor can be built without adding a new dependency, though the recommendation below is to shell out to the `docker` CLI rather than use dockerode.

---

## 2. Assumptions in the brief — confirmed, corrected, or new

### 2.1 CONFIRMED

| Brief's claim | Evidence |
|---|---|
| AWS SQS is a hard requirement | `lib/queue/sqs.ts:29` — `queueUrl()` throws `Queue URL for "<name>" is not configured` when unset. Enqueue is on the critical path for deploys, backups, tasks, server ops **and signup** (OTP is an `email.send` job — `lib/email/enqueue.ts`) |
| `peon-pipelines` vs `peon` DB-name mismatch | `.env.example` `DATABASE_URL=...localhost:5432/peon-pipelines`; `docker-compose.yml` `POSTGRES_DB: peon` |
| `full` profile does not start Postgres | `docker-compose.yml` — `postgres` is `profiles: ["db"]`, app/worker/schedule/socket are `profiles: ["full"]`. No `depends_on` anywhere |
| Compose never runs migrations | `app` service is `command: ["pnpm","start"]`; `docker/Dockerfile` ends `CMD ["pnpm","start"]`. Only `nixpacks.toml` runs `prisma migrate deploy` at start |
| No automatic secret generation | `.env.example` ships literal `change-me-long-random-string` |
| First user depends on email | `AuthService.signup` (`auth.ts:111`) requires `OTPService.verify(...)` before `createUser`. First-user detection exists (`auth.ts:114`: `const isFirstUser = (await countUsers()) === 0`) but is gated behind the OTP |
| No control-plane TLS | Compose publishes `3000:3000` raw. Traefik/Caddy compose files are written only to *managed* servers (`lib/scripts/server.ts`) |
| No prebuilt images | Both Dockerfiles build from source; no registry reference anywhere; `.github/workflows/deploy-worker.yml` pushes to a private ECR for the maintainer's own deployment, not a public image |
| Chromium is heavy and always present in the worker image | `docker/Dockerfile.worker:62` — `RUN pnpm exec playwright install --with-deps chromium`, unconditional |
| `ENCRYPTION_KEY` silently accepts anything | `lib/crypto/encryption.ts:20` — if the value is not 32 base64 bytes it falls back to `sha256(raw)`. Zod only requires `min(1)` (`lib/env.ts`) |
| Deploy engine is large and must not be duplicated | `deploy/engine.ts` is 953 lines |

### 2.2 CORRECTED — the brief overestimates the work

**(a) An email provider abstraction already exists.** The brief asks to "create/use provider architecture" for email. It is already built:

- `lib/email/types.ts` — `EmailDriver { send(message): Promise<void> }`
- `lib/email/factory.ts` — `getEmailDriver()` switches on `EMAIL_DRIVER`
- `lib/email/drivers/test.ts`, `lib/email/drivers/ses.ts`

**Phase 6 is therefore "add an SMTP driver", not "build an abstraction".** Roughly one new file (`drivers/smtp.ts`), one `nodemailer` dependency, one env block, one factory case. Also note `InstanceSettings.emailConfig Json?` (`schema.prisma:1087`) exists and is **unused** — a DB-level email config was planned and never wired. Decide in Phase 6 whether to use it or drop it.

**(b) A storage abstraction partially exists, and local fallback is already implemented in one place.** Two distinct storage concepts already coexist:

- **Platform storage** — `S3_BUCKET` env, used for avatars and deployment screenshots. Gated by `isPlatformS3Configured()`.
- **Per-workspace storage** — `S3Storage` Prisma rows with encrypted credentials, user-configured backup destinations. `s3ClientFor(storage)` already supports `endpoint` + `forcePathStyle`, so **MinIO and other S3-compatible stores already work** for backups today.

Critically, `deploy/screenshot.ts:30` already documents: *"persist a lifetime-public S3 URL (or a local path when platform S3 is not configured)"*. A local fallback exists for screenshots. Phase 6 should **generalize this existing pattern**, not invent one.

**(c) The SSH layer is already a single clean seam.** The brief worries about `if local ... else ssh ...` spreading through deployment logic. The current shape makes that avoidable cheaply. All remote I/O goes through one singleton, `sshPool`:

| File | `sshPool.*` call sites |
|---|---|
| `services/internal/deploy/engine.ts` | 27 |
| `services/internal/server/operations.ts` | 16 |
| `services/internal/backup/engine.ts` | 7 |
| `services/internal/service/runtime.ts` | 6 |
| `services/internal/server/server.ts` | 2 |
| `services/internal/server/runtime.ts` | 2 |
| `services/internal/task/engine.ts` | 1 |
| `services/internal/service/previews.ts` | 1 |
| `services/internal/deploy/preview.ts` | 1 |
| `services/external/s3/backup.ts` | 1 |
| **Total** | **64 across 10 files** |

The surface is `exec`, `execStream`, `putContent`, `putFile`, `getFile`, `ping`, `pingWithError`, `disconnect`, `reapIdle`. That *is* the `ServerExecutor` interface — it already exists in all but name.

**There is also an existing precedent for swapping the implementation:** every `sshPool` method already short-circuits on `isE2eMode()` (`pool.ts:150`, `:163`, `:186`, …) returning canned results. The codebase has already accepted "the pool decides how the command actually runs". `LocalServerExecutor` is the same move, done properly.

`worker/terminal-server.ts` is the one consumer that does **not** use the pool — it builds its own `NodeSSH` for the PTY (`terminal-server.ts:20`). Local-mode terminals will need separate treatment (`docker exec -it` / a local PTY).

**(d) The OS validation the brief asks about already exists and is strict.** `server/operations.ts:34` — `SUPPORTED_OS_IDS` (16 distro IDs), Docker Engine major ≥ 24 enforced at `:178`, `git`/`curl`/`jq` required at `:76`. No architecture (`arm64`/`amd64`) check exists anywhere — grep for `arm64|amd64|aarch64|uname -m` across `src/` and `worker/` returns **zero hits**.

### 2.3 NEW — risks the brief does not mention

These were found during the audit and must be scheduled, not discovered mid-refactor.

**(N1) Backups are read into RAM as base64. This will OOM.**
`services/external/s3/backup.ts:21`:
```ts
const res = await sshPool.exec(target, `base64 ${remotePath}`);
const body = Buffer.from(res.stdout.replace(/\s+/g, ''), 'base64');
```
The entire database dump is base64-encoded on the remote host, transferred as one string into the worker's heap, then decoded into a second Buffer. A 2 GB dump needs roughly 2.7 GB for the string plus 2 GB for the Buffer. On the 8 GB target machine, or a small self-host VPS, this kills the worker. **This must be fixed inside Phase 6 (storage), not deferred** — it is the single largest memory risk in the codebase and it sits directly on the standalone-backup path. Fix: stream over SFTP to the storage provider (`getFile` already streams to disk at `backup/engine.ts:163`; the S3 path bypasses it).

**(N2) `BASE_DIR` is hardcoded and is the central local-mode path trap.**
`services/internal/deploy/helpers.ts:8` — `export const BASE_DIR = '/data/peon/services';`

Under SSH this is unambiguous: the worker writes the path and the Docker daemon reads the same path, both on the remote host. Under **containerized local execution** there are three filesystem views — the worker container, the host, and the Docker daemon — and `docker compose up -d` resolves relative bind mounts against **the daemon's** view. If the worker writes a compose file to `/data/peon/services/x` inside its container and the daemon resolves that path on the host, deployments fail or, worse, silently mount the wrong directory. Mitigation, to be enforced in Phase 7/8:
- Make the base path configurable (`PEON_DATA_DIR`).
- In local mode, mount it at **the identical absolute path** inside the worker container and on the host, so all three views agree.
- Add unit tests over path resolution (already scheduled as Phase 7 tasks).

Related hardcoded paths to audit at the same time: `/data/peon/proxy` (`scripts/server.ts:64`), `/data/peon/backups` (`backup/engine.ts:41`), `/data/peon/ping-pong` (agent volume), `.data/deployment-previews` (`screenshot.ts:11`, relative to `process.cwd()`).

**(N3) The integration suite hardcodes SQS env and `PEON_E2E=1`.**
`vitest.integration.config.ts` sets `SQS_DEPLOYMENT_QUEUE_URL` / `SQS_TASKS_QUEUE_URL` and `PEON_E2E: '1'`. The queue-provider work must keep this suite green, and should eventually gain a variant that exercises the Postgres queue for real rather than stubbing enqueue.

**(N4) `InstanceSettings` has unused fields relevant to this work.**
`publicPortMin: 9000` / `publicPortMax: 9100` (`schema.prisma:1082`) are declared and never read — presumably intended for allocating host ports to services without a domain. Single-server mode needs exactly this (control plane and customer apps sharing one host). Decide in Phase 8 whether to implement or remove.

**(N5) Local mode has a root-privilege gap that SSH mode sidesteps.**
`Server.user` defaults to `"root"` (`schema.prisma:329`) and the provisioning scripts call `apt-get` / `systemctl` with **no `sudo`** (`scripts/server.ts:24`). Remote mode simply requires a root SSH login. A local executor runs as whatever user the worker process is, which in a container is typically root-in-container but not root-on-host, and which for a bare-metal `pnpm worker` may be an unprivileged user. Local mode must either require Docker group membership and skip the OS-package steps entirely (preferred — the host is already provisioned by the installer), or define a privilege-escalation story. **Recommendation: local servers skip `validate()`'s install path entirely and assert Docker reachability instead.**

**(N6) There is no `isRegistrationEnabled` enforcement on the signup path.**
`InstanceSettings.isRegistrationEnabled` defaults `true` (`schema.prisma:1076`). The audit did not find a check in `AuthService.signup`. Verify in Phase 1 — the bootstrap flow must not become an open-registration hole on a public IP.

---

## 3. Current process and provider inventory

### Processes

| Process | Entry | Scaling | Notes |
|---|---|---|---|
| Web | `next start` | horizontal | UI + 126 API routes + `/mcp` + webhooks + agent push |
| Worker | `worker/index.ts` | horizontal | Polls both queues; `WORKER_MAX_CONCURRENCY` default 5 |
| Schedule | `worker/schedule.ts` | **exactly one** | `worker/scheduler.ts:16` dedupes via in-memory `Map`; two instances double-fire every backup and cron task |
| Socket | `worker/socket.ts` | one per port | Terminal PTY bridge, `TERMINAL_WS_PORT` default 8081 |

### Queue

`lib/queue/messages.ts` defines 10 job types across 2 logical queues (`deployments`, `tasks`), routed by `queueForMessage()`. Producer is `enqueue()` (`lib/queue/sqs.ts:28`). Consumer is `worker/index.ts` with a handler registry (`worker/handlers/index.ts`).

Worker semantics today, which the Postgres provider must preserve:
- Message deleted on success
- Message deleted on `NotFoundError` — stale target, retry can never succeed (`worker/index.ts:36`)
- All other failures left for SQS visibility-timeout redelivery
- `VisibilityTimeout: 900` (15 min) on receive (`lib/queue/sqs.ts:52`)
- Long-poll `WaitTimeSeconds` from `WORKER_POLL_WAIT_SECONDS` (default 20)
- Max 10 messages per receive (`SQS_RECEIVE_MAX`)

There is **no retry limit, no dead-letter handling, and no attempt counter in the application** — SQS owns all of it today. The Postgres provider must add `attempts`, a max-attempts cap, and a terminal failed state, which is strictly more capability than exists now.

### Storage

| Purpose | Mechanism | Local fallback today |
|---|---|---|
| Deployment screenshots | Platform S3 (`S3_BUCKET`) | **Yes** — local path (`screenshot.ts:30`) |
| Profile avatars | Platform S3, browser PUT via presigned URL | No |
| Database backups | Per-workspace `S3Storage` rows, optional | Partial — dump stays on the managed server if `saveS3` is false |

### Email

`EMAIL_DRIVER` = `test` \| `aws-ses`. Delivered asynchronously via the `email.send` queue job. **Signup is blocked without a working queue**, because the OTP is enqueued rather than sent inline.

### Execution

Single seam, `sshPool` (§2.2c). Host-key verification is TOFU with optional pinning (`lib/ssh/host-key.ts`) — added recently, must not regress.

---

## 4. Security posture to preserve

Verified present; the refactor must not regress any of these:

| Guarantee | Location |
|---|---|
| Session revocation checked per request (`sid` vs `AuthSession`) | `proxy.ts:15` → `lib/auth/jwt.ts` |
| Workspace/project RBAC, single source of truth | `lib/auth/access.ts` |
| MCP tokens scoped to one workspace | `lib/mcp/access.ts` |
| Chat approval for mutating tools | `chat/agent.ts` + `mcp/catalog/classify.ts` |
| Secrets encrypted at rest (AES-256-GCM) | `lib/crypto/encryption.ts` |
| Git ref validation before any deploy | `deploy/engine.ts:81` → `lib/git/ref.ts` |
| Deployment cancellation via conditional writes | `deploy/engine.ts` — 9 × `assertNotCancelled`, terminal writes gated on `status: IN_PROGRESS` |
| GitHub webhook HMAC + timing-safe compare | `lib/webhooks/github.ts` |
| Agent token timing-safe compare | `server/agent.ts:56` |
| SSH host-key verification (TOFU + pinning) | `lib/ssh/host-key.ts`, `lib/ssh/host-key-store.ts` |
| Shell quoting for remote commands | `lib/shell/quote.ts` |

**Known defect to fix (Phase 16, pulled forward to Phase 1):** `ENCRYPTION_KEY` accepts any string (§2.1). Production must reject a malformed key; development may use a documented fixed key.

---

## 5. Target architecture (decisions taken in Phase 0)

These decisions are recorded here and in `IMPLEMENTATION_LOG.md`. They may be revised with justification.

**D1 — `ServerExecutor` wraps the existing pool, it does not replace it.**
`SshServerExecutor` delegates to today's `sshPool` unchanged. The 64 call sites migrate from `sshPool.exec(target, …)` to `executor.exec(…)` mechanically. SSH behavior must be byte-identical after the wrap; that is the acceptance gate before `LocalServerExecutor` is written.

**D2 — `LocalServerExecutor` shells out to the `docker` CLI, not dockerode.**
The deploy engine emits shell command *strings* (`docker compose up -d`, `docker inspect --format=…`). Reusing them verbatim through `child_process.spawn` keeps one code path. dockerode would require rewriting 27 call sites in `engine.ts` into an API-shaped path — exactly the duplication the brief forbids. dockerode should be removed from `package.json` as an unused dependency.

**D3 — Queue: Postgres via `SELECT … FOR UPDATE SKIP LOCKED`, no new runtime dependency.**
Postgres is already required. `SKIP LOCKED` gives correct atomic multi-worker claiming in standard SQL. A library (pg-boss, graphile-worker) would bring its own schema, migrations and polling loop, duplicating the handler registry and shutdown logic that already exist in `worker/index.ts`. The needed surface — claim, lease, retry, attempts, fail — is roughly 150 lines against one new table. Revisit if lease/heartbeat semantics prove subtle.

**D4 — No Redis.** Nothing in the current architecture needs it.

**D5 — Local server is a new `Server.executionMode` enum (`REMOTE` default, `LOCAL` new), not a magic hostname.**
A `localhost` IP with SSH already "works" (`lib/ssh/host.ts:39` permits `localhost`) but requires sshd and a key — the hack the brief rightly rejects. An explicit column keeps RBAC, destinations, settings, tags and the whole `Server` surface intact while changing only how commands execute. Default `REMOTE` preserves every existing row.

**D6 — Docker socket goes to the worker only, never the web process.**
Restated from the brief as a hard invariant, to be asserted by a test that fails if `docker-compose*.yml` mounts the socket into a web service.

**D7 — UI-only mode uses a fixture data layer at the API-client boundary** (`src/services/api/*`), not per-component conditionals. That boundary is already the single path the UI uses to reach the server (`lib/http/axios.ts`). One switch there covers every screen.

---

## 6. What Phase 0 did NOT verify

Stated plainly so it is not mistaken for coverage:

- Nothing was executed. No typecheck, no test run, no `docker compose config`.
- Idle-memory figures for any mode — the brief requires these to be **measured**, not invented. They will be measured in CI once the modes exist, and recorded in `docs/development.md`.
- Whether the current `docker compose --profile db --profile full up -d` path actually boots after the Phase 1 fixes — that is Phase 1's CI acceptance gate.
- Whether `isRegistrationEnabled` is enforced (N6) — flagged for Phase 1.
- Behavior of the 333-entry template catalog under local execution.

---

## 7. Where to go next

`CHECKLIST.md` is the source of truth for task state. `IMPLEMENTATION_LOG.md` records what changed each phase and why. Phase 1 (Compose and bootstrap bug fixes) is the first implementation phase because every other phase's CI smoke test depends on a Compose stack that actually boots.
