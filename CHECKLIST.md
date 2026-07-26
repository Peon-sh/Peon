# Peon Standalone Refactor — Checklist

Source of truth for the standalone self-hosting refactor. Updated continuously. Companion documents: [docs/self-hosting-architecture.md](docs/self-hosting-architecture.md) (Phase 0 audit, architectural decisions) and [IMPLEMENTATION_LOG.md](IMPLEMENTATION_LOG.md) (per-phase record).

## Status legend

| Mark | Meaning |
|---|---|
| `[ ]` | Not started |
| `[~]` | In progress |
| `[x]` | Complete **with evidence** |
| `[!]` | Blocked / needs investigation |

## Rule for marking `[x]`

Writing the code is not completion. A task moves to `[x]` only when there is evidence, and the evidence is named next to it:

- `ci:<job>` — a green GitHub Actions job
- `test:<file>` — a passing test committed in the repo and green in CI
- `review:<doc>` — an architecture review recorded in IMPLEMENTATION_LOG.md
- `dev:confirmed` — the supervising developer ran it and confirmed

**The agent does not execute code on the developer's machine.** No task may be marked `[x]` on the agent's own authority from having written it. Validation runs in CI. Where a task genuinely cannot be validated in CI, it stays `[~]` with a note saying what a human must check.

---

## PHASE 0 — Repository audit

- [x] Audit Compose files, Dockerfiles, entrypoints — `review:docs/self-hosting-architecture.md §2.1`
- [x] Audit worker architecture and job dispatch — `review:… §3`
- [x] Audit SQS queue implementation and semantics — `review:… §3`
- [x] Audit S3 / storage implementation — `review:… §2.2b`
- [x] Audit email implementation — `review:… §2.2a`
- [x] Audit SSH abstraction, count call sites — `review:… §2.2c` (64 sites / 10 files)
- [x] Audit deployment engine — `review:… §1`
- [x] Audit server provisioning and OS validation — `review:… §2.2d`
- [x] Audit scheduler, socket/terminal server — `review:… §3`
- [x] Audit environment validation — `review:… §2.1`
- [x] Audit Prisma models and migrations — `review:… §3`
- [x] Audit auth bootstrap / first-user path — `review:… §2.1`
- [x] Audit proxy architecture — `review:… §2.1`
- [x] Audit current CI and tests — `review:… §2.3 N3`
- [x] Audit current documentation — `review:… §2.1`
- [x] Record architectural decisions D1–D7 — `review:… §5`
- [x] Write `docs/self-hosting-architecture.md`
- [x] Write `CHECKLIST.md`, `IMPLEMENTATION_LOG.md`

---

## PHASE 1 — Fix existing Compose and bootstrap bugs

Goal: `docker compose up -d` on a clean machine produces a reachable, migrated Peon. This phase blocks every later CI smoke test.

**Code complete; awaiting CI.** Every item below is written and reviewed but not executed — see the evidence rule at the top of this file. `[~]` here means "written, pending CI", not "partially written".

- [~] Reconcile DB name — `.env.example` `peon-pipelines` vs Compose `peon`
  - Acceptance: a fresh clone using `.env.example` verbatim connects to the Compose Postgres without editing. → `ci:selfhost-smoke`
- [~] Make one command start database + app together
  - Done by removing the `db`/`full` profiles from postgres/app/worker so they start by default; `schedule` and `socket` stay behind `full`. → `ci:compose-validate`
- [~] Add `depends_on` with `condition: service_healthy` against the Postgres healthcheck
  - `migrate` gates on `postgres: service_healthy`; `app`/`worker` gate on `migrate: service_completed_successfully`. → `ci:selfhost-smoke`
- [~] Run `prisma migrate deploy` automatically before the app serves traffic
  - **Decision:** a one-shot `migrate` service, not a per-container entrypoint — stops N app replicas racing each other on migrate. → `ci:selfhost-smoke` asserts `_prisma_migrations` is populated
- [x] ~~Add an entrypoint for the web image~~ — **dropped as unnecessary**
  - The `migrate` service supersedes it. Adding an entrypoint too would run migrations N times. Recorded in IMPLEMENTATION_LOG.
- [~] Wire `/api/health` into the Compose healthcheck for the app service
  - Uses `node -e` with global fetch, so no curl/wget dependency in the Alpine image. → `ci:selfhost-smoke`
- [~] **`ENCRYPTION_KEY`: new-install validation without breaking legacy installs**
  - First attempt hard-failed production on any non-32-byte key, which would have
    bricked every existing self-host whose data is encrypted under the old
    SHA-256-derived key. **Rejected by the developer and redesigned.**
  - Legacy derivation is now permanent, documented compatibility — not a grace period.
  - Fresh-vs-existing is decided by a DB round-trip in `lib/crypto/preflight.ts`,
    not by the synchronous env schema which cannot know.
  - `test:src/lib/crypto/__tests__/encryption-key.test.ts` (18 cases) → `ci:unit`
  - `test:src/lib/crypto/__tests__/preflight.test.ts` (12 cases) → `ci:unit`
- [~] Rotation path: `ENCRYPTION_KEY_PREVIOUS` + `pnpm encryption:rotate`
  - Decrypt falls back to the previous key; script re-encrypts all 17 encrypted
    columns plus the `NotificationChannel.config` JSON values; idempotent, with
    `--dry-run`. Covered by the rotation cases in `encryption-key.test.ts`.
- [~] Keep `JWT_SECRET` placeholder rejection in `lib/env.ts`
  - Kept as a hard failure precisely because rotating it costs a re-login, not data.
  - `test:src/lib/__tests__/env-secrets.test.ts` (11 cases) → `ci:unit`
- [~] Document the upgrade and rotation behaviour → `docs/self-hosting.md`
- [~] **Enforce `InstanceSettings.isRegistrationEnabled` (audit N6)** — confirmed as a live vulnerability, not a gap
  - The setting was stored and rendered in the admin UI but read nowhere in the auth path. **Two** bypass vectors closed: email signup (`initiateSignup` + `completeSignup`) and Google auto-provision (`loginWithGoogle`).
  - `test:src/services/internal/instance/__tests__/registration.test.ts` (11 cases) → `ci:unit`
- [~] Update `.env.example` — required vs optional, generator commands
  - Also removed `NODE_ENV=development`, which silently overrode the images' production setting via `env_file`.
- [~] CI job: `docker compose config` validates every committed Compose file
  - Plus a D6 assertion that no web-tier service mounts `docker.sock`, parsed from `config --format json`. → `ci:compose-validate`
- [~] CI job: fresh-stack smoke test — boot, migrate, `GET /api/health` returns 200
  - → `ci:selfhost-smoke`
- [~] CI job: typecheck (was missing entirely from CI)
  - → `ci:typecheck`
- [~] Update README to match the new Compose semantics

---

## PHASE 2 — Provider abstractions (interfaces only, no behavior change)

Goal: introduce seams with zero functional change. Every existing test stays green.

- [ ] Define `QueueProvider` interface covering current SQS semantics (enqueue, receive, delete, visibility)
- [ ] Make the existing SQS implementation satisfy `QueueProvider` unchanged
  - Acceptance: `ci:unit` + `ci:integration` green with no test edits.
- [ ] Add `QUEUE_DRIVER` env, defaulting to `sqs` when SQS URLs are present (backward compatible)
  - Acceptance: an existing `.env` with SQS URLs and no `QUEUE_DRIVER` behaves exactly as before.
- [ ] Define `StorageProvider` interface (put, get, presign-or-equivalent, delete, publicUrl)
- [ ] Make platform S3 satisfy `StorageProvider`
  - Acceptance: avatar and screenshot paths unchanged; `ci:unit` green.
- [ ] Confirm `EmailDriver` already satisfies the provider shape; extend only if needed
  - Acceptance: documented in the log — no rewrite of the existing interface.
- [ ] Define `ServerExecutor` interface from the actual `sshPool` surface
  - Acceptance: interface covers exec, execStream, putContent, putFile, getFile, ping, pingWithError, disconnect.
- [ ] Implement `SshServerExecutor` as a thin delegate to today's `sshPool`
  - Acceptance: `test:` executor unit tests; behavior byte-identical to direct pool calls.
- [ ] Add a provider-resolution module (env → concrete providers), lazily evaluated like `serverEnv()`
  - Acceptance: importing it in the browser bundle does not throw.

---

## PHASE 3 — UI-only mode

Goal: full UI development with one web process, no database.

- [ ] Create `src/lib/dev-fixtures/` with deterministic fixture data
  - Acceptance: fixtures for user, workspace, projects, servers, services, deployments, databases, members, templates, settings, logs.
- [ ] Add loading / empty / error / success state fixtures per resource
  - Acceptance: every major screen can be driven into all four states without a backend.
- [ ] Add a fixture adapter at the `src/services/api/*` boundary (decision D7)
  - Acceptance: **zero** `if (UI_MODE)` conditionals inside `src/components/**` — enforced by a lint rule or test.
- [ ] Add `PEON_UI_MODE` env, development-only
  - Acceptance: `test:` — mode refuses to activate when `NODE_ENV=production`; app fails to boot rather than silently serving fixtures.
- [ ] Development-only mock session for UI mode
  - Acceptance: `test:` — mock session is rejected in production builds.
- [ ] Unobtrusive "UI DEVELOPMENT MODE" badge
- [ ] `docker-compose.ui.yml` — single web service
  - Acceptance: no Postgres, worker, scheduler, socket, Chromium, SSH or AWS in the file.
- [ ] `pnpm dev:ui` script equivalent for non-Docker use
- [ ] Compose Watch / bind mounts for hot reload, excluding `node_modules`, `.next`, `.git`, caches
  - Acceptance: editing a `.tsx` file does not rebuild the image.
- [ ] Ensure the UI image does not install Playwright/Chromium
  - Acceptance: `ci:` image-layer assertion or Dockerfile review recorded in the log.
- [ ] CI job: typecheck + build under `PEON_UI_MODE`
  - Acceptance: `ci:ui-mode` green.
- [ ] Measure and record idle RAM for UI mode
  - Acceptance: measured in CI, written to `docs/development.md`. **No invented numbers.**

---

## PHASE 4 — Lightweight development mode

Goal: real API + DB + worker on 4 CPU / 8 GB.

- [ ] `docker-compose.dev.yml` — web, worker, postgres only
- [ ] Default `concurrentBuilds = 1` in dev
- [ ] No Chromium, no LocalStack, no MinIO, no SQS emulator, no Docker-in-Docker
  - Acceptance: file review recorded in the log; CI asserts the service list.
- [ ] Persistent pnpm/Next cache volumes to avoid rebuilds
- [ ] Hot reload for web and worker
- [ ] Scheduler and socket opt-in, not default
  - Acceptance: documented; both start via an explicit profile.
- [ ] CI job: dev stack boots, worker processes one enqueued job end to end
  - Acceptance: `ci:dev-mode` green.
- [ ] Measure and record idle RAM per service
  - Acceptance: measured, in `docs/development.md`. Target ~1–1.5 GB, ceiling ~2 GB.

---

## PHASE 5 — Postgres queue / AWS independence

Goal: real asynchronous processing with no AWS.

- [ ] Prisma model + migration for the job table (type, payload, status, attempts, error, lease/visible_at, scheduled_at, timestamps)
- [ ] Implement `PostgresQueueProvider` using `SELECT … FOR UPDATE SKIP LOCKED` (decision D3)
- [ ] Atomic claim
  - Acceptance: `test:` two concurrent workers never claim the same job.
- [ ] Lease / visibility timeout with expiry reclaim
  - Acceptance: `test:` a job whose lease expires becomes claimable again.
- [ ] Retry with attempt counter and max-attempts cap
  - Acceptance: `test:` job fails N times then lands in a terminal failed state, not an infinite loop.
- [ ] Preserve current drop-on-`NotFoundError` semantics (`worker/index.ts:36`)
  - Acceptance: `test:` stale job is deleted, not retried.
- [ ] Worker crash recovery
  - Acceptance: `test:` job claimed by a killed worker is reclaimed after lease expiry.
- [ ] Malformed payload handling
  - Acceptance: `test:` invalid JSON is discarded and logged, never poison-loops.
- [ ] Scheduled / delayed execution support
  - Acceptance: `test:` a job with a future `scheduled_at` is not claimed early.
- [ ] Graceful shutdown drains in-flight jobs
- [ ] Wire `QUEUE_DRIVER=postgres` into the worker loop without duplicating the handler registry
  - Acceptance: `worker/handlers/*` untouched.
- [ ] Backward compatibility: existing SQS installs are never silently migrated
  - Acceptance: `test:` SQS URLs present and no `QUEUE_DRIVER` → SQS is selected.
- [ ] New installs default to `postgres`
- [ ] Document the migration path SQS → Postgres in `docs/infrastructure-providers.md`
- [ ] CI job: full queue test suite
  - Acceptance: `ci:queue` green.

---

## PHASE 6 — Local storage + SMTP

- [ ] Implement `LocalStorageProvider` writing under the configured data dir
- [ ] Add `STORAGE_DRIVER=local|s3`, defaulting to `local` for new installs
  - Acceptance: existing installs with `S3_BUCKET` keep S3 behavior.
- [ ] Serve locally-stored assets (avatars, screenshots) through an authenticated route
  - Acceptance: `test:` local asset URLs respect workspace RBAC.
- [ ] Generalize the existing screenshot local fallback into the provider (audit §2.2b)
- [ ] **Fix backup OOM (audit N1)** — stream backups instead of base64-into-RAM
  - Acceptance: `test:` upload path never materializes the whole file in a Buffer; large-file behavior covered by a streaming test.
- [ ] Backups have defined behavior with no S3 configured (retained locally, not silently lost)
  - Acceptance: `test:` backup with no storage destination still records an execution and a retrievable artifact path.
- [ ] Implement `SmtpEmailDriver` (add `nodemailer`; the driver interface already exists — audit §2.2a)
- [ ] Add `EMAIL_DRIVER=smtp` and SMTP env block
  - Acceptance: `test:` driver selection unit test; SES and test drivers unchanged.
- [ ] Decide the fate of unused `InstanceSettings.emailConfig` — wire it or drop it
  - Acceptance: decision recorded in the log.
- [ ] Signup works with `QUEUE_DRIVER=postgres` + `EMAIL_DRIVER=smtp` and no AWS
  - Acceptance: `ci:` integration test covers signup end to end against Mailpit.

---

## PHASE 7 — First-class local server execution

- [ ] Add `Server.executionMode` enum (`REMOTE` default, `LOCAL`) + migration (decision D5)
  - Acceptance: migration is additive; every existing row becomes `REMOTE`.
- [ ] Implement `LocalServerExecutor` via `child_process` against the `docker` CLI (decision D2)
- [ ] Executor factory resolves from `Server.executionMode`
- [ ] Migrate `deploy/engine.ts` (27 sites) to the executor
  - Acceptance: `ci:unit` + `ci:integration` green; **no** `if (local)` branches inside the engine.
- [ ] Migrate `server/operations.ts` (16 sites)
- [ ] Migrate `backup/engine.ts` (7), `service/runtime.ts` (6), `server/server.ts` (2), `server/runtime.ts` (2), `task/engine.ts` (1), `service/previews.ts` (1), `deploy/preview.ts` (1), `s3/backup.ts` (1)
- [ ] Preserve every safety property: cancellation, conditional status writes, git-ref validation, labels, health checks, rolling updates, image cleanup, preview isolation, logs, controls
  - Acceptance: existing deploy tests untouched and green.
- [ ] Local mode skips OS/package provisioning; asserts Docker reachability instead (audit N5)
  - Acceptance: `test:` local server validation path does not invoke `apt-get`/`systemctl` scripts.
- [ ] Make `BASE_DIR` configurable via `PEON_DATA_DIR` (audit N2)
- [ ] Path-resolution tests for worker/host/daemon agreement
  - Acceptance: `test:src/lib/deploy/__tests__/paths.test.ts` extended; identical-path invariant asserted for local mode.
- [ ] Audit and parameterize the other hardcoded paths: `/data/peon/proxy`, `/data/peon/backups`, `/data/peon/ping-pong`, `.data/deployment-previews`
- [ ] Local terminal support (`worker/terminal-server.ts` bypasses the pool — audit §2.2c)
  - Acceptance: `test:` local service terminal resolves to `docker exec -it` without SSH.
- [ ] Remove the unused `dockerode` dependency (decision D2)
- [ ] CI job: same deployment engine exercised through both executors
  - Acceptance: `ci:executors` green.

---

## PHASE 8 — Single-server production mode

- [ ] Installer/setup registers the local server automatically — no manual Server record
  - Acceptance: fresh install has a usable `LOCAL` server with no user action.
- [ ] Docker socket mounted **only** into the worker (decision D6)
  - Acceptance: `test:` fails if any Compose file mounts `docker.sock` into a web service.
- [ ] Evaluate a Docker socket proxy; document honestly what it does and does not protect
  - Acceptance: written up in `docs/self-hosting.md`; no overclaiming.
- [ ] Never expose Docker over unauthenticated TCP
  - Acceptance: asserted by the same Compose test.
- [ ] Decide and implement host-port allocation for services without a domain (audit N4, `publicPortMin/Max`)
- [ ] Production self-host Compose file
- [ ] CI: end-to-end local deployment — create project → service → enqueue → worker claims → local executor → build → start → health check → FINISHED → logs → redeploy → stop
  - Acceptance: `ci:local-deploy-e2e` green. **This is the gate for claiming single-server mode works.**

---

## PHASE 9 — Remote + hybrid validation

- [ ] Remote SSH deployment still passes unchanged
  - Acceptance: `ci:integration` green, no test edits.
- [ ] One Peon instance manages local + remote servers simultaneously
  - Acceptance: `ci:` test with a `LOCAL` server and an SSH target server together.
- [ ] Host-key verification, pinning and TOFU unchanged
  - Acceptance: `test:src/lib/ssh/__tests__/host-key.test.ts` green.
- [ ] Per-server deploy queue and concurrency correct across mixed modes
  - Acceptance: `test:` server-queue tests cover both execution modes.

---

## PHASE 10 — Infrastructure / parity mode

- [ ] `docker-compose.infrastructure.yml` — web, worker, scheduler, socket, postgres, SQS emulator, S3-compatible storage, Mailpit, SSH test server, proxy
- [ ] `concurrentBuilds = 1` default
- [ ] SSH test server target usable by executor tests
  - Acceptance: `ci:` a deployment runs against the in-compose SSH target.
- [ ] Document that this mode is not the everyday environment
- [ ] Measure and record RAM
  - Acceptance: measured, in `docs/development.md`.

---

## PHASE 11 — One-command installer

- [ ] `install.sh` with the 22 required steps from the brief
- [ ] Validate host OS, disk, RAM, required ports
- [ ] Install Docker + Compose plugin if missing
- [ ] Create directory structure, generate `JWT_SECRET` and a valid 32-byte `ENCRYPTION_KEY`
- [ ] Start Postgres, wait for health, run migrations automatically
- [ ] Configure Postgres queue, local storage, email, proxy defaults
- [ ] One-time bootstrap token for the first admin — expiring, single-use, not stored in plaintext
  - Acceptance: `test:` token expires, cannot be reused, and is hashed at rest. **No shipped default credentials.**
- [ ] First admin does not require working email (brief requirement)
  - Acceptance: `ci:` fresh install reaches an authenticated dashboard with no SMTP configured.
- [ ] Print final status with URL and next steps
- [ ] Idempotent re-run
  - Acceptance: running twice does not destroy data.
- [ ] CI job: installer smoke test in a clean container
  - Acceptance: `ci:installer` green.

---

## PHASE 12 — Control-plane TLS / proxy

- [ ] One proxy owns :80 and :443 on a single-server install — no competing Traefik instances
- [ ] Route control-plane domain → Peon; app domains → deployed services
- [ ] Preserve both Traefik and Caddy support cleanly
- [ ] ACME certificate issuance for the control-plane domain
- [ ] Document the port-conflict failure mode and its fix
  - Acceptance: `ci:` config validation asserts a single :80/:443 owner.

---

## PHASE 13 — Prebuilt container images

- [ ] CI builds and publishes `ghcr.io/peon-sh/peon` and `…/peon-worker`
- [ ] Semantic version tags, immutable SHA tags, `latest` only where appropriate
- [ ] Split Chromium into an optional screenshot-capable worker image or build arg
  - Acceptance: the default worker image does not contain Chromium; screenshots documented as opt-in.
- [ ] Multi-arch build (amd64 + arm64) — note no arch validation exists today (audit §2.2d)
- [ ] Self-host Compose references published images, not a build context
  - Acceptance: install on a small VPS compiles nothing.

---

## PHASE 14 — CI and automated smoke testing

- [ ] Keep gitleaks, dependency audit, unit, integration jobs green throughout
- [ ] `docker compose config` validation for ui / dev / infrastructure / self-host files
- [ ] Mode-specific jobs: `ci:ui-mode`, `ci:dev-mode`, `ci:queue`, `ci:executors`, `ci:local-deploy-e2e`, `ci:installer`, `ci:selfhost-smoke`
- [ ] Keep total CI time reasonable — cache aggressively, avoid rebuilding images per job
- [ ] Ensure no job requires the developer's laptop

---

## PHASE 15 — Documentation

- [ ] `docs/self-hosting.md`
- [ ] `docs/development.md` — with **measured** RAM figures
- [ ] `docs/server-modes.md` — local, remote, hybrid
- [ ] `docs/infrastructure-providers.md` — queue, storage, email; AWS as optional
- [ ] `docs/troubleshooting.md`
- [ ] Update `docs/self-hosting-architecture.md` from audit to final architecture
- [ ] README: three commands near the top (UI / dev / self-host installer)
- [ ] Fix dangling doc links — `PERMISSIONS.md`, `SERVICE_KIND_INVARIANTS.md`, `.env.test.example` are referenced but do not exist
- [ ] Document AWS→standalone and standalone→AWS migration paths

---

## PHASE 16 — Security review

- [ ] Re-verify every guarantee in `docs/self-hosting-architecture.md §4`
- [ ] Confirm `ENCRYPTION_KEY` hardening shipped (Phase 1)
- [ ] Review the local executor for command-injection parity with the SSH path
  - Acceptance: `lib/shell/quote.ts` applied identically in both executors.
- [ ] Review Docker socket exposure end to end
- [ ] Review bootstrap token handling
- [ ] Review local asset serving for RBAC bypass
- [ ] Confirm UI fixture mode cannot activate in production
- [ ] Run the existing `.cursor/rules/pr-review-peon-attack-surface.mdc` checklist against the full diff

---

## PHASE 17 — Final architecture regression review

- [ ] Every Definition-of-Done item in the brief verified with named evidence
- [ ] No regression in RBAC, workspace isolation, deployment safety, SSH support
- [ ] Existing AWS installations verified unaffected
- [ ] Full checklist audited — no `[x]` without evidence
- [ ] IMPLEMENTATION_LOG.md complete and accurate
