# Validation Debt

Everything implemented but not yet proven. Entries are **never deleted** — when
something is validated it is marked `VERIFIED` with evidence, and failures are
marked `FAILED` and fixed.

Companion documents: [CHECKLIST.md](CHECKLIST.md) (task state),
[IMPLEMENTATION_LOG.md](IMPLEMENTATION_LOG.md) (per-phase record).

## Status values

`OPEN` · `VERIFIED` · `FAILED` · `FIXED`

## Risk values

`LOW` · `MEDIUM` · `HIGH` · `CRITICAL`

---

## VD-000 — Environment limitation (root cause of most entries below)

| | |
|---|---|
| **Phase** | 0 |
| **Area** | CI |
| **Status** | OPEN |
| **Risk** | HIGH |

**Description.** No validation of any kind has been executed against this branch.

**Why unverified.** The development machine has no `node_modules`, no `pnpm` on
`PATH`, and system Node is v24 against a project pinned to 22.x
(`.nvmrc`, `engines.node`). Installing the toolchain was explicitly declined as
too heavy for a 4-core / 8 GB machine. GitHub Actions triggers only on
`pull_request`, `gh` is not installed, and no API token is available, so CI
cannot be triggered or observed from here either.

**Consequence.** Every entry below inherits this. Do not read "OPEN" as
"suspected broken" — read it as "never executed".

**Required validation.** A Node 22 environment with dependencies installed:

```bash
nvm install 22 && nvm use
pnpm install
pnpm exec prisma generate
pnpm typecheck && pnpm test:unit
```

Recorded once here rather than repeated per entry.

---

## Phase 1 / 1a — bootstrap and encryption

### VD-001 — TypeScript compilation of the whole branch

| | |
|---|---|
| **Phase** | 1 | 
| **Area** | TypeScript |
| **Status** | OPEN |
| **Risk** | HIGH |

**Description.** No file added or changed in this refactor has been seen by the
compiler. `pnpm typecheck` has **never run in this repository's CI**, so even the
pre-change baseline is unknown — the new `typecheck` job may surface pre-existing
errors unrelated to this work.

**Why unverified.** See VD-000.

**Required validation.** `pnpm typecheck` clean, and the `ci:typecheck` job green.

---

### VD-002 — Zod 4 `superRefine` issue shape

| | |
|---|---|
| **Phase** | 1 |
| **Area** | TypeScript |
| **Status** | OPEN |
| **Risk** | MEDIUM |

**Description.** `src/lib/env.ts` uses `ctx.addIssue({ code: 'custom', path, message })`
inside a `superRefine`. The exact accepted shape differs between Zod 3 and 4;
this project is on Zod 4.

**Required validation.** `pnpm typecheck`, plus `src/lib/__tests__/env-secrets.test.ts`
proving a placeholder `JWT_SECRET` throws in production.

---

### VD-003 — Prisma `mode: 'insensitive'` on invitation lookups

| | |
|---|---|
| **Phase** | 1 |
| **Area** | Prisma |
| **Status** | OPEN |
| **Risk** | MEDIUM |

**Description.** The registration gate matches pending invitations with
`{ email: { equals, mode: 'insensitive' } }`. Provider-specific (Postgres only)
and not verified against the generated client.

**Required validation.** `src/services/internal/instance/__tests__/registration.test.ts`
(mocked — proves the query shape only) plus one integration test against real
Postgres proving a mixed-case invited address can register while registration is
disabled.

---

### VD-004 — Registration enforcement end to end

| | |
|---|---|
| **Phase** | 1 |
| **Area** | Security |
| **Status** | OPEN |
| **Risk** | HIGH |

**Description.** `isRegistrationEnabled` was a live vulnerability: stored,
rendered in the admin UI, enforced nowhere. Guards were added to
`initiateSignup`, `completeSignup` and `loginWithGoogle`. Only unit-tested with
a mocked Prisma client.

**Required validation.** Integration tests against a real database:
disabled instance → `POST /api/auth/signup` returns 403; invited address still
succeeds; first user on an empty instance still succeeds; Google verify endpoint
rejects a new account on a disabled instance.

---

### VD-005 — Compose file behaviour

| | |
|---|---|
| **Phase** | 1 |
| **Area** | Docker Compose |
| **Status** | OPEN |
| **Risk** | MEDIUM |

**Description.** `docker-compose.yml` was substantially rewritten: profiles
removed from `postgres`/`app`/`worker`, a one-shot `migrate` service added with
`service_completed_successfully` gating, a YAML anchor (`<<: *app-env`) combined
with `env_file`, and a `node -e` healthcheck in `CMD` array form. None of it has
been parsed by Docker Compose.

**Required validation.** `docker compose config -q`, then a full boot from an
empty volume reaching `/api/health` 200 — the `ci:selfhost-smoke` job.

---

### VD-006 — Next.js instrumentation hook loading

| | |
|---|---|
| **Phase** | 1a |
| **Area** | Integration |
| **Status** | OPEN |
| **Risk** | MEDIUM |

**Description.** `src/instrumentation.ts` is new to this project. Whether Next 16
picks it up in this layout, and whether `register()` runs before the first
request in both dev and production servers, is unverified. If it silently never
runs, the encryption preflight never executes and a fresh install with a weak key
would not be refused.

**Required validation.** Boot the app and confirm the preflight log line appears;
assert a fresh database + weak key refuses to start.

---

### VD-007 — Encryption rotation script against a seeded database

| | |
|---|---|
| **Phase** | 1a |
| **Area** | Encryption |
| **Status** | OPEN |
| **Risk** | **HIGH** |

**Description.** `scripts/rotate-encryption-key.ts` rewrites 17 encrypted columns
across 13 models plus the `NotificationChannel.config` JSON. It has never touched
a database. It is the most destructive code in this branch.

**Why unverified.** Requires real PostgreSQL with seeded encrypted values.

**Treat rotation as EXPERIMENTAL until this entry is VERIFIED.**

**Required validation.** A temporary seeded database with encrypted values in
every model in `ENCRYPTED_TARGETS`, proving in order:

1. old key → decrypt succeeds
2. old key + new key → fallback decrypt succeeds
3. `--dry-run` → **zero** modifications (verify row hashes before/after)
4. real rotation → every encrypted field rewritten
5. new key alone → everything decrypts
6. old key removed → application still works
7. corrupt ciphertext → rotation fails safely, non-zero exit, no partial write

---

### VD-008 — Encrypted-column manifest completeness

| | |
|---|---|
| **Phase** | 1a |
| **Area** | Encryption |
| **Status** | OPEN |
| **Risk** | **HIGH** |

**Description.** `src/lib/crypto/encrypted-columns.ts` was assembled by hand from
the schema and `encrypt()` call sites. A **typo'd but structurally valid** model
name silently skips a whole table during rotation; that data then becomes
unreadable the moment `ENCRYPTION_KEY_PREVIOUS` is removed. The script warns on
unknown models but cannot detect a wrong-yet-real name.

**Required validation.** A test asserting every entry resolves against the Prisma
DMMF, and that every `String` column commented `// encrypted` in
`prisma/schema.prisma` appears in the manifest. Not yet written.

---

### VD-009 — Legacy-key backwards compatibility

| | |
|---|---|
| **Phase** | 1a |
| **Area** | Migration |
| **Status** | OPEN |
| **Risk** | **CRITICAL** |

**Description.** Existing installations encrypt under `sha256(arbitrary-string)`.
The claim that upgrading this branch keeps their data readable rests on unit
tests that have not run.

**If this is wrong, upgrading destroys access to every stored secret** — SSH keys,
database passwords, environment variables, LLM credentials.

**Required validation.** Restore or synthesise a database encrypted with a legacy
key, run this branch against it unchanged, and confirm SSH keys, service env
values and database passwords all decrypt. Must be proven before any release.

---

### VD-010 — Placeholder-key upgrade path

| | |
|---|---|
| **Phase** | 1a |
| **Area** | Migration |
| **Status** | OPEN |
| **Risk** | MEDIUM |

**Description.** An installation running with the literal `.env.example`
placeholder is treated as legacy: warn, do not refuse. Untested against a real
populated database.

**Required validation.** Covered by the VD-009 scenario with the placeholder value.

---

### VD-011 — Fresh-install detection heuristic

| | |
|---|---|
| **Phase** | 1a |
| **Area** | Encryption |
| **Status** | OPEN |
| **Risk** | MEDIUM |

**Description.** "Fresh install" is `prisma.user.count() === 0`. An installation
that has servers or workspaces but somehow no users would be misclassified as
fresh and refused. Believed impossible — workspaces require an owner — but not
proven.

**Required validation.** Confirm no code path creates workspaces or encrypted
rows without a user. Consider widening the check to also count `PrivateKey`.

---

## Phase 2 / 5 — providers and Postgres queue

### VD-012 — Lockfile is out of date (KNOWN-CERTAIN CI failure)

| | |
|---|---|
| **Phase** | 6 |
| **Area** | CI |
| **Status** | OPEN |
| **Risk** | **HIGH** |

**Description.** `package.json` gained `@aws-sdk/lib-storage`, `nodemailer` and
`@types/nodemailer`, but `pnpm-lock.yaml` could not be regenerated. **Every CI
job that runs `pnpm install --frozen-lockfile` will fail** until someone runs
`pnpm install` and commits the lockfile.

This is not a suspicion — it is a certainty, recorded so it is not mistaken for a
real defect when CI first runs.

**Required validation.** `pnpm install` in a Node 22 environment, commit the
updated `pnpm-lock.yaml`, confirm `ci:unit` reaches the test step.

---

### VD-013 — Postgres queue against a real database

| | |
|---|---|
| **Phase** | 5 |
| **Area** | Queue |
| **Status** | OPEN |
| **Risk** | **CRITICAL** |

**Description.** The claim query is raw SQL executed through
`prisma.$queryRaw`. Unit tests mock Prisma, so they prove the shape of the calls
and nothing about the SQL itself. The `UPDATE ... WHERE id IN (SELECT ... FOR
UPDATE SKIP LOCKED)` statement has never been parsed by Postgres.

If the claim is wrong, jobs are lost, duplicated, or run concurrently on multiple
workers — the failure mode is silent and data-affecting.

**Required validation.** Against real Postgres:

1. enqueue → claim → acknowledge round trip
2. two concurrent workers claiming from a shared queue never receive the same row
3. lease expiry makes an unacknowledged job visible again (crash recovery)
4. retry backoff increases; `maxAttempts` moves the job to FAILED
5. malformed payload is failed, not redelivered forever
6. `scheduled_at`/`visibleAt` in the future is not claimed early
7. graceful shutdown drains in-flight jobs

---

### VD-014 — Worker behaviour parity between drivers

| | |
|---|---|
| **Phase** | 5 |
| **Area** | Queue |
| **Status** | OPEN |
| **Risk** | HIGH |

**Description.** `worker/index.ts` was rewritten around the provider interface.
The SQS path must behave exactly as before for existing installations, including
the drop-on-`NotFoundError` rule.

**Required validation.** Integration run against both drivers dispatching the same
job types; confirm SQS message lifecycle is unchanged.

---

### VD-015 — Prisma client regeneration for `QueueJob`

| | |
|---|---|
| **Phase** | 5 |
| **Area** | Prisma |
| **Status** | OPEN |
| **Risk** | MEDIUM |

**Description.** `prisma.queueJob` does not exist on the generated client until
`prisma generate` runs against the updated schema. Typecheck will fail until then.
The hand-written migration SQL has also never been applied.

**Required validation.** `pnpm exec prisma generate`, `prisma migrate deploy`
against an empty database, and confirm the migration matches the schema
(`prisma migrate diff`).

---

## Phase 6 — storage, email, backups

### VD-016 — Backup streaming under real load

| | |
|---|---|
| **Phase** | 6 |
| **Area** | Storage |
| **Status** | OPEN |
| **Risk** | **HIGH** |

**Description.** `uploadFileFromServer` no longer base64-encodes the whole dump
into heap; it pulls over SFTP to a temp file and streams a multipart upload. The
memory claim is unproven, and the disk requirement is new — the worker now needs
free space equal to the dump size.

**Required validation.** Back up a multi-GB database and observe worker RSS stays
bounded (target: well under 1 GB regardless of dump size). Confirm the temp file
is removed on both success and failure. Confirm behaviour when the temp
filesystem is full.

---

### VD-017 — SMTP delivery

| | |
|---|---|
| **Phase** | 6 |
| **Area** | Email |
| **Status** | OPEN |
| **Risk** | MEDIUM |

**Description.** `SmtpEmailDriver` has never sent a message. TLS/STARTTLS
selection by port, auth, and the lazy `nodemailer` import are all unverified.

**Required validation.** Send through Mailpit in the infrastructure compose mode;
then against one real provider. Confirm signup OTP arrives with
`QUEUE_DRIVER=postgres` and `EMAIL_DRIVER=smtp` and no AWS configured.

---

### VD-018 — Local storage serving and RBAC

| | |
|---|---|
| **Phase** | 6 |
| **Area** | Storage |
| **Status** | OPEN |
| **Risk** | MEDIUM |

**Description.** `/api/storage/[...key]` requires a session but performs **no
per-object ownership check** — any authenticated user who knows a key can read
it. Keys contain cuids/uuids so they are not trivially guessable, but this is
weaker than S3 presigning. Existing avatar/screenshot URLs are also public in the
S3 path today, so this is not a regression, but it should be tightened.

**Required validation.** Decide whether avatars and screenshots need per-workspace
authorisation; add tests either way. Confirm path traversal is impossible
(unit-tested, not yet run).

---

### VD-019 — Storage driver switch does not orphan existing objects

| | |
|---|---|
| **Phase** | 6 |
| **Area** | Migration |
| **Status** | OPEN |
| **Risk** | MEDIUM |

**Description.** Auto-detection keeps S3 when `S3_BUCKET` is set, so existing
installations are unaffected. But an operator who switches drivers finds old
objects unreachable — there is no migration tool.

**Required validation.** Document the limitation; decide whether a
`storage:migrate` command is needed before release.

---

## Phase 7 — local execution

### VD-020 — Deploy engine not yet migrated to the executor

| | |
|---|---|
| **Phase** | 7 |
| **Area** | Local executor |
| **Status** | FIXED (implementation) — verification still OPEN |
| **Risk** | **HIGH** |

**Update (phase 7 groups 1–5).** All call sites are migrated: `server/operations.ts`,
`server/runtime.ts`, `task/engine.ts`, `backup/engine.ts`, `service/runtime.ts`,
`service/previews.ts`, `deploy/preview.ts` and finally `deploy/engine.ts`. The
engine holds a `ServerExecutor` and never learns which transport it is. Diff
inspection confirms every changed line is an import, a parameter type or a call
receiver. **Still unverified at runtime** — see VD-024.

**Description.** `ServerExecutor`, `SshServerExecutor` and `LocalServerExecutor`
exist and `executorForServer()` resolves by `Server.executionMode`, but the 64
`sshPool.*` call sites have **not** been migrated yet. `deploy/engine.ts` (27
sites) and `server/operations.ts` (16) still call the pool directly, so a
`LOCAL` server cannot actually deploy yet.

**Local execution is wired but not reachable end to end. Do not describe
single-server mode as working.**

**Required validation.** Migrate the call sites, then prove the full path:
create project → service → enqueue → worker claims → local executor → build →
start → health check → FINISHED → logs → redeploy → stop.

---

### VD-021 — Filesystem model unproven

| | |
|---|---|
| **Phase** | 7 |
| **Area** | Local executor |
| **Status** | OPEN |
| **Risk** | **CRITICAL** |

**Description.** The worker/host/daemon path model is documented in
`docs/server-modes.md` and `BASE_DIR` is now `PEON_DATA_DIR`-driven, but nothing
has been tested. If the worker container and the Docker daemon disagree about a
path, bind mounts silently point at the wrong directory rather than failing.

**Required validation.** With a containerised worker holding the Docker socket:
deploy a service with a bind-mounted volume and confirm the container sees the
expected contents; confirm the compose file the daemon reads is the one the
worker wrote; confirm preview deployments isolate correctly.

---

### VD-022 — Local server privilege model

| | |
|---|---|
| **Phase** | 7 |
| **Area** | Security |
| **Status** | OPEN |
| **Risk** | HIGH |

**Description.** Local mode requires Docker socket access, which is equivalent to
root on the host. CI asserts no web-tier service mounts it, but the worker
necessarily does. The documented position is that a socket proxy is not a real
boundary for Peon's use case.

**Required validation.** Security review of the local execution path; confirm the
web process never gains socket access in any compose file or deployment topology;
confirm `lib/shell/quote.ts` is applied identically in both executors.

---

### VD-023 — `BASE_DIR` deprecation left in place

| | |
|---|---|
| **Phase** | 7 |
| **Area** | Local executor |
| **Status** | FIXED (implementation) — verification OPEN |
| **Risk** | LOW |

**Update (phase 8).** A static sweep found the migration was genuinely
incomplete: three hardcoded `/data/peon/backups` literals in `backup/engine.ts`,
duplicate `BASE_DIR` constants in `service/previews.ts` and `deploy/preview.ts`,
and hardcoded proxy/agent paths in `lib/scripts/server.ts`. All now route through
the new `src/lib/paths.ts`, which is the single source of truth.

**Defect found and fixed during the same sweep:** the first consolidation used
`export { x } from 'y'`, which creates no local binding — `servicesBaseDir()` and
`storageRoot()` would have been `undefined` at their call sites in
`deploy/helpers.ts` and `storage/providers/local.ts`. Corrected to import-then-
re-export. This is exactly the class of defect static review is for, and it was a
real bug, not merely an unexecuted path.

Still not parameterised: `.data/deployment-previews` in `deploy/screenshot.ts`
(relative to `process.cwd()`).

**Required validation.** T-FS-009 (custom `PEON_DATA_DIR` relocates everything).
Add a lint/test asserting no `/data/peon` literal outside `lib/paths.ts`.

---

### VD-024 — Local deployment end to end

| | |
|---|---|
| **Phase** | 7/8 |
| **Area** | Local executor |
| **Status** | OPEN |
| **Risk** | **CRITICAL** |

**Description.** The code path for single-server deployment now exists, but no
deployment has ever run through `LocalServerExecutor`. Build, compose up, health
wait, rolling swap, image cleanup and teardown are all unexercised locally.

**Required validation.** With Peon installed on one host and a LOCAL server
registered: project → service → deploy → worker claims → local executor → docker
build → container starts → health check passes → deployment FINISHED → logs
readable → redeploy → stop. Then the rolling-update path, then a preview deploy.

---

### VD-025 — SSH regression after the executor migration

| | |
|---|---|
| **Phase** | 7 |
| **Area** | SSH |
| **Status** | OPEN |
| **Risk** | **CRITICAL** |

**Description.** 64 call sites changed transport object. `SshServerExecutor` is
pure delegation, so remote behaviour *should* be identical, but the existing
integration suite has not run against the change.

**A regression here breaks every existing Peon installation**, which matters more
than the new local path.

**Required validation.** Full integration suite plus a real deploy to a real SSH
server: deploy, rollback, cancel mid-build, rolling update, preview create and
teardown, backup run and restore, scheduled task, proxy start/stop, server
validate, browser terminal.

---

### VD-026 — Local terminal has no implementation

| | |
|---|---|
| **Phase** | 7 |
| **Area** | Local executor |
| **Status** | OPEN |
| **Risk** | MEDIUM |

**Description.** `worker/terminal-server.ts` opens its own `NodeSSH` PTY rather
than using the pool, so it has no local path. `ServiceRuntime` now carries a null
`target` for LOCAL servers; the terminal server does not yet handle that and will
likely fail when a terminal is opened on a local service.

**Required validation.** Implement a local PTY (`docker exec -it` via
`child_process` with a pty), then test both transports. Until then, terminals on
local servers must be treated as unsupported.

---

### VD-027 — Local server registration flow

| | |
|---|---|
| **Phase** | 8 |
| **Area** | Local executor |
| **Status** | OPEN |
| **Risk** | HIGH |

**Description.** `ensureLocalServer()` exists and is unit-tested against a mocked
Prisma client, but nothing calls it yet — the installer and onboarding wiring are
phases 11 and 3. A user cannot currently get a local server without inserting a
row by hand, which is exactly what the requirement forbids.

**Required validation.** Onboarding "use this server" creates it; installer
creates it; it appears in the UI as a normal server; RBAC applies; a service can
target it.

---

### VD-028 — Queue table query plan

| | |
|---|---|
| **Phase** | 5 |
| **Area** | Queue |
| **Status** | OPEN |
| **Risk** | MEDIUM |

**Description.** The claim query filters `queue` + `status IN (PENDING,
PROCESSING)` + `visibleAt <= NOW()` and orders by `visibleAt`. The partial index
`QueueJob_claim_idx (queue, visibleAt) WHERE status IN ('PENDING','PROCESSING')`
is intended to serve exactly that, keeping completed history out of the hot path.
**This is a static assumption — no EXPLAIN has been run.**

Completed rows accumulate indefinitely; `purgeCompleted()` exists but nothing
calls it on a schedule yet.

**Required validation.** `EXPLAIN ANALYZE` the claim query against a table with
~100k completed and ~1k pending rows; confirm an index scan, not a sequential
scan. Wire `purgeCompleted` into the scheduler.

---

### VD-029 — Local terminals are deliberately unsupported

| | |
|---|---|
| **Phase** | 8 |
| **Area** | Local executor |
| **Status** | OPEN (design decision, implementation complete) |
| **Risk** | LOW |

**Description.** Supersedes VD-026's "will crash" state. Both terminal paths now
fail fast with a specific message instead of dialling a null SSH target:

- **Local host terminal** — refused. Implementing it needs a real PTY on the
  control-plane host (`node-pty`), and the result would be an unaudited root
  shell on the machine running Peon, a materially larger privilege grant than
  `docker exec` into one container on a remote host. Blocking is the safer
  default.
- **Local service terminal** — refused for now. `docker exec -it` is plausible
  locally but still needs a PTY to be usable; deferred rather than half-built.

**Known limitation, not a defect.** The UI should also disable the action rather
than surfacing the error only after a connection attempt — not yet done.

**Required validation.** T-TERM-003/004/005: confirm no null target is dialled,
and that the message is comprehensible.

---

### VD-030 — Onboarding local-server wiring

| | |
|---|---|
| **Phase** | 8 |
| **Area** | Local executor |
| **Status** | OPEN |
| **Risk** | MEDIUM |

**Description.** `POST /api/auth/onboarding` now accepts `useLocalServer` and
calls `ensureLocalServer()`. Registration is best-effort — a failure is logged
and onboarding still completes, so a user is never trapped in the wizard.

**The onboarding UI does not yet present the choice**, so the flag is currently
only reachable via the API. The installer (phase 11) is the other intended caller.

**Required validation.** T-LOCAL-001, T-INST-008. Also confirm the workspace
selected is the right one when a user owns several — the current query takes the
oldest OWNER/ADMIN membership, which is a heuristic.

---

## Rules for this file

1. Never delete an entry. Mark it `VERIFIED` (with evidence) or `FAILED`.
2. New debt is appended with the next free ID; IDs are not reused.
3. `CRITICAL` and `HIGH` must all be closed before release.
4. `MEDIUM`/`LOW` may remain open only with an explicit written justification.
5. A phase may ship as `CODE COMPLETE / VALIDATION PENDING`. No phase is ever
   described as `FULLY VERIFIED` while it carries open debt.
