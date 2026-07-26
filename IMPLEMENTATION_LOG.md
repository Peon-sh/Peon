# Implementation Log — Standalone Refactor

Per-phase record of what changed, why, what was tested, and what was not. Newest entry at the top.

Task state lives in [CHECKLIST.md](CHECKLIST.md). Architecture and audit findings live in [docs/self-hosting-architecture.md](docs/self-hosting-architecture.md).

---

## Standing constraint (applies to every entry)

The supervising developer's machine is 4 CPU / 8 GB RAM and **no project code is executed on it**. All validation runs in GitHub Actions. Consequently every entry below has a populated "TESTS NOT RUN" section, and no checklist item is marked complete without named CI evidence. This is a deliberate process property, not an oversight.

---

## PHASES 7 (complete) and 8 (partial) — local execution

**STATUS:** Phase 7 `CODE COMPLETE / VALIDATION PENDING`. Phase 8 PARTIAL.

Commits: `ea3a64c` (groups 1–4), `5f95289` (group 5, engine), `2dbfe23` (phase 8).

### Migration approach

Done in controlled groups as instructed, engine last:

1. `server/operations.ts` — validate, agent, proxy, cleanup
2. `server/runtime.ts`, `task/engine.ts`, `backup/engine.ts`
3. `service/runtime.ts`, `service/previews.ts`, `deploy/preview.ts`
4. `s3/backup.ts` — now takes a `ServerExecutor` rather than an `SshTarget`
5. `deploy/engine.ts` — 27 sites, last

The engine never learns which transport it holds. No `if (executionMode ===
'LOCAL')` was added inside it. Every helper signature changed from
`target: SshTarget` to `executor: ServerExecutor`; the bodies are untouched.

**Verification method used, since nothing could be executed:** the engine diff
was inspected line by line and every changed line is an import, a parameter type,
or a call receiver. No control flow, no state transitions, no command strings, no
error messages. Preserved intact: the optimistic QUEUED claim, all nine
`assertNotCancelled` checks, terminal writes conditioned on `IN_PROGRESS`,
rolling-update swap, preview isolation and router naming, Peon ownership labels,
git-ref validation, readiness waiting, image retention, the
notify-failure-does-not-fail-the-deploy rule, and rollback semantics.

### Two deliberate transport branches

Both are contained and documented, not scattered:

1. **Reachability** (`assertReachable`) — a remote server is pinged over SSH with
   its pooled session dropped first; the local server checks the Docker daemon.
   Everything after this point in `validate()` is shared.
2. **Provisioning** — a LOCAL server never runs `apt-get`/`systemctl` from the
   worker. This resolves audit finding N5: the worker typically lacks the
   privileges, and the Peon host is provisioned by its installer or image
   already. The OS allow-list is skipped locally for the same reason — it exists
   to gate package provisioning that will not be attempted.

### Phase 8 — local server concept

`ensureLocalServer()` creates an ordinary `Server` row with `executionMode:
LOCAL`. No keypair, no sshd, no `127.0.0.1`, no fake record. It deliberately uses
`ip: 'local'` rather than a loopback address, because a loopback address would
imply SSH is involved.

Hybrid needs no extra work: local vs remote is a per-server property, so a
workspace can hold one local server and many remote ones simultaneously and each
service picks its target as before. There is no "local mode" installation.

`concurrentBuilds` defaults to 1 for local servers — the control plane and the
workloads share CPU, and a parallel Nixpacks build makes the dashboard unusable.

**Not wired yet.** Nothing calls `ensureLocalServer()`; the installer (phase 11)
and onboarding (phase 3) do that. Until then a user still cannot obtain a local
server through the product. VD-027.

### ARCHITECTURAL DECISIONS

| ID | Decision | Rationale |
|---|---|---|
| D22 | `ServiceRuntime` keeps the SSH target alongside the executor | The terminal server opens its own PTY channel rather than reusing the pool, so it still needs the target. Null for local servers, which is why VD-026 exists. |
| D23 | Local servers skip the OS allow-list and package provisioning | The allow-list gates provisioning Peon will not attempt locally. Resolves N5. |
| D24 | Local server uses `ip: 'local'`, not `127.0.0.1` | A loopback address would suggest an SSH hop that does not happen. |
| D25 | `ensureLocalServer` does not validate Docker | Registration should succeed even when the daemon is briefly down; `validate()` reports that separately. |

### TESTS PERFORMED

None executed.

### TESTS NOT RUN

Everything, including 14 new local-server unit tests. The two that matter most:

- **VD-025 (CRITICAL): SSH regression.** 64 call sites changed transport object.
  A regression here breaks every existing Peon installation, which matters more
  than the new local path.
- **VD-024 (CRITICAL): local deploy end to end.** Never run.

### RISKS

- `service/runtime.ts` now dereferences `svc.server.privateKey!` behind an
  `executionMode !== 'LOCAL'` guard. If that guard is wrong for some path, it is
  a null dereference at runtime rather than a compile error.
- Local terminals will likely fail outright (VD-026) — the terminal server has no
  local branch and now receives a null target.
- The queue table's partial index is a static assumption; no `EXPLAIN` has been
  run (VD-028), and `purgeCompleted()` is not scheduled, so completed rows
  accumulate.

### NEXT

Phase 3 (UI-only mode) and 4 (lightweight dev), which the checklist orders before
10–17 and which onboarding wiring for VD-027 depends on.

---

## PHASES 2, 5, 6, 7 — providers, Postgres queue, storage/email, local execution

**STATUS:** `CODE COMPLETE / VALIDATION PENDING` for phases 2, 5, 6.
**Phase 7 is PARTIAL** — see the warning below.

Commits: `0160b30` (2+5), `5e5d7a3` (6), `e786f52` (7).

### Phase 2 — provider abstractions

`QueueProvider`, `StorageProvider` and `ServerExecutor` interfaces introduced;
`EmailDriver` already existed and was reused rather than rewritten. Each
resolver imports only the selected implementation, so the SQS path never loads
Prisma, the Postgres path never loads the AWS SDK, and `smtp` never loads
nodemailer.

`lib/queue/sqs.ts` became a re-export shim so all 11 existing import sites were
left untouched.

### Phase 5 — Postgres queue

`QueueJob` model + migration. Claiming is a single
`UPDATE ... WHERE id IN (SELECT ... FOR UPDATE SKIP LOCKED)` statement, so two
workers cannot take the same row.

The design point the developer asked for explicitly: **claiming leases rather
than deletes.** The row stays, `visibleAt` moves forward, status becomes
`PROCESSING`. A worker that dies never acknowledges, the lease expires, another
worker picks it up. A job therefore cannot sit in `PROCESSING` forever. The
trade-off is at-least-once delivery, which matches the SQS visibility-timeout
semantics the handlers were already written against.

Also: attempt counter with cap, exponential backoff, terminal `FAILED` state,
malformed-payload rejection, and preserved drop-on-`NotFoundError`.

**Backwards compatibility is the load-bearing part.** With SQS URLs configured
and no `QUEUE_DRIVER`, the driver resolves to `sqs`. An existing installation is
never silently migrated — doing so would strand in-flight SQS jobs with nothing
polling for them.

### Phase 6 — storage, email, backups

- `LocalStorageProvider` under `PEON_DATA_DIR/storage`, served by
  `/api/storage/[...key]` behind a session, with path-traversal guards.
- `S3StorageProvider` wraps the existing platform-S3 helpers, so object URLs are
  unchanged for installations already on S3. Auto-detects: `s3` when `S3_BUCKET`
  is set, otherwise `local`.
- `SmtpEmailDriver` added. `EMAIL_DRIVER` is now `test | smtp | aws-ses`.
- **Backup OOM (N1) fixed.** `uploadFileFromServer` previously ran
  `base64 <file>` over SSH and decoded the result in memory — roughly 2.4x the
  dump size in heap, so a 2 GB database needed ~5 GB and killed the worker. It
  now pulls over SFTP to a temp file and streams a multipart upload. Peak memory
  is one 8 MiB part. The new cost is disk: the worker needs free space equal to
  the dump.

### Phase 7 — local execution (PARTIAL)

Built: `ServerExecutor`, `SshServerExecutor` (pure delegation to `sshPool`),
`LocalServerExecutor` (`/bin/sh` + Docker CLI), `Server.executionMode` with an
additive migration, `executorForServer()`, and `PEON_DATA_DIR`-driven paths.

`docs/server-modes.md` documents the worker/host/daemon filesystem model the
developer flagged as blocking, the same-absolute-path mounting rule, and an
honest position on Docker socket exposure — including why a socket proxy is
**not** a real boundary for Peon's use case, since Peon legitimately needs
container-create, build, exec and volume APIs, and that set is already enough to
take over a host.

> **The 64 `sshPool` call sites are NOT migrated.** `deploy/engine.ts` (27) and
> `server/operations.ts` (16) still call the pool directly, so a `LOCAL` server
> cannot deploy end to end yet. Recorded as VD-020. **Single-server mode must not
> be described as working.**

### ARCHITECTURAL DECISIONS

| ID | Decision | Rationale |
|---|---|---|
| D16 | Async provider resolution everywhere | The initial queue resolver used `require()`, which does not work in this ESM project. Async `import()` also gives per-driver lazy loading for free. |
| D17 | Postgres queue leases instead of deleting on claim | The only way a crashed worker's job returns. Deleting on claim would lose it silently. |
| D18 | Worker releases failed jobs with backoff on the Postgres driver only | SQS has no client-side equivalent — not acknowledging is what triggers redelivery there. |
| D19 | Backups stream via SFTP-to-temp-file, not in-memory base64 | Bounded memory. Accepts a new disk requirement, which is the cheaper resource. |
| D20 | Local objects served through an authenticated app route | Local storage has no bucket ACLs; the session is the only gate. |
| D21 | `LocalServerExecutor` shells out rather than using dockerode | Confirms D2. Reuses the engine's existing command strings verbatim, keeping one code path. |

### TESTS PERFORMED

None. Unchanged: no `node_modules`, no pnpm, Node v24 vs required 22.

### TESTS NOT RUN

All new tests: queue driver resolution (8), Postgres provider (16), local storage
(14), local executor (16). Plus everything from phases 1/1a.

### RISKS

- **VD-012 is a certainty, not a risk:** `package.json` gained
  `@aws-sdk/lib-storage`, `nodemailer` and `@types/nodemailer`, and the lockfile
  could not be regenerated. Every CI job running `pnpm install --frozen-lockfile`
  **will fail** until someone runs `pnpm install` and commits `pnpm-lock.yaml`.
- **VD-013 (CRITICAL):** the claim SQL is raw and has never been parsed by
  Postgres. Mocked tests prove call shapes, not the statement. A wrong claim
  loses or duplicates jobs silently.
- **VD-021 (CRITICAL):** the filesystem model is documented but untested. A
  worker/daemon path disagreement makes bind mounts point at the wrong directory
  rather than failing loudly.
- `prisma.queueJob` does not exist on the generated client until
  `prisma generate` runs, so typecheck fails until then (VD-015).

### NEXT

Phase 7 completion: migrate the 64 call sites, starting with
`server/operations.ts` (16, mechanical) before `deploy/engine.ts` (27, where the
cancellation and rolling-update logic lives and must not regress). Then phases 3,
4, 8–17.

---

## PHASE 1a — ENCRYPTION_KEY compatibility redesign (correction)

**PHASE:** 1a — correction to Phase 1
**STATUS:** Code complete, awaiting CI.

**WHY THIS EXISTS**

The developer rejected the Phase 1 `ENCRYPTION_KEY` behaviour, correctly. The
original change hard-failed production on any non-32-byte key. Existing
self-hosted installations have SSH keys, database passwords, environment
variables and LLM credentials encrypted under `sha256(arbitrary-string)` from the
old permissive behaviour. Those installations would have refused to boot after
upgrading, and the only way to satisfy the new check — supplying a proper
32-byte key — would have made all of their existing data undecryptable.

That is a strictly worse failure than the weak-key problem being fixed: it turns
a security weakness into data loss. The redesign separates *validating new
installations* from *supporting existing ones*.

**THE CORE PROBLEM AND WHERE IT IS SOLVED**

Deciding "is a legacy key acceptable here?" requires knowing whether this
installation already holds data. Neither obvious layer can answer that:

- `lib/env.ts` parses `process.env` synchronously with no database access.
- `lib/crypto/encryption.ts` must stay usable from scripts and tests.

So the policy moved to a third place, `lib/crypto/preflight.ts`, which is async,
takes a `countUsers` function, and runs at process startup rather than module
import. This is why the developer's instruction — *"if reliably distinguishing a
fresh installation cannot be done at env-schema boot time, do not force the
validation at that layer"* — is followed literally: **all `ENCRYPTION_KEY`
format validation was removed from the env schema.**

| Key | Fresh database (0 users) | Existing database |
|---|---|---|
| strict (32 bytes) | start | start |
| placeholder | refuse | start + warn |
| legacy derived | refuse | start + warn |

Ties go to "existing": if the database is unreachable or unmigrated, Peon warns
rather than refusing. A transient database problem must never become a boot
failure for a running installation.

**WHAT CHANGED**

1. **`encryption.ts` rewritten around explicit key modes.** `strict` vs
   `legacy-derived`, reported by `encryptionKeyStatus()`. Legacy SHA-256
   derivation is now documented as permanent compatibility rather than a
   fallback for convenience. It never throws on a weak key.
2. **Rotation support.** `ENCRYPTION_KEY_PREVIOUS` is tried when the current key
   fails GCM authentication, so the app keeps serving while rows are still on the
   old key. `decryptWithSource()` reports which key won, which is how the
   rotation script counts remaining work.
3. **`preflight.ts`** — the policy described above, plus a prominent boxed
   deprecation banner that states the data is safe and gives the exact four-step
   rotation procedure.
4. **Wired into both startup paths** — `worker/index.ts` `main()`, and a new
   `src/instrumentation.ts` using Next's `register()` hook (guarded on
   `NEXT_RUNTIME === 'nodejs'`).
5. **`scripts/rotate-encryption-key.ts`** + `pnpm encryption:rotate`. Idempotent,
   `--dry-run`, per-table reporting, non-zero exit if anything is undecryptable.
6. **`src/lib/crypto/encrypted-columns.ts`** — a manifest of all 17 encrypted
   columns across 13 models, enumerated from the schema and from `encrypt()` call
   sites. `NotificationChannel.config` is handled separately because it is a JSON
   blob whose individual *values* are encrypted.
7. **Env schema:** `ENCRYPTION_KEY` format validation removed entirely;
   `ENCRYPTION_KEY_PREVIOUS` added. `JWT_SECRET` placeholder rejection **kept** as
   a hard failure — rotating it costs a re-login, never data. That asymmetry is
   the whole point and is commented in place.
8. **`docs/self-hosting.md`** — key modes, the startup matrix, an explicit "you
   need to do nothing" upgrade section, and the five-step rotation procedure.

**FILES**

- `src/lib/crypto/encryption.ts` (rewritten)
- `src/lib/crypto/preflight.ts` (new)
- `src/lib/crypto/encrypted-columns.ts` (new)
- `src/instrumentation.ts` (new)
- `scripts/rotate-encryption-key.ts` (new)
- `src/lib/crypto/__tests__/encryption-key.test.ts` (rewritten, 18 cases)
- `src/lib/crypto/__tests__/preflight.test.ts` (new, 12 cases)
- `src/lib/__tests__/env-secrets.test.ts` (rewritten, 11 cases)
- `src/lib/env.ts`, `worker/index.ts`, `package.json`, `.env.example`, `README.md`,
  `docs/self-hosting.md`

**ARCHITECTURAL DECISIONS**

| ID | Decision | Rationale |
|---|---|---|
| D12 | Legacy SHA-256 derivation is permanent, not deprecated-with-removal | Any future removal destroys data for anyone who has not rotated. There is no safe release in which to drop it. |
| D13 | Fresh-install detection = `user.count() === 0` | The one signal available before any service is constructed, and it cannot false-positive on a populated database. Errors are treated as "existing". |
| D14 | Rotation via `ENCRYPTION_KEY_PREVIOUS` fallback rather than a ciphertext version prefix | A version prefix would change the payload format for every existing row and require a migration to even begin. Dual-key decrypt needs no data change and is reversible at any point. |
| D15 | `JWT_SECRET` keeps its hard failure while `ENCRYPTION_KEY` does not | Blast radius differs: sessions are disposable, encrypted data is not. |
| D9 (revised) | The `isValidEncryptionKey` duplicate in `lib/env.ts` is **removed** | No longer needed — the env schema no longer validates key format, so the client-bundle concern disappears with it. |

**TESTS PERFORMED**

None locally — no `node_modules`, no pnpm, and system Node is v24 against a
project pinned to 22.x. Unchanged from the previous phase; CI is the only path.

**TESTS NOT RUN**

All 41 test cases across the three rewritten/new files. Also unverified:

- Whether Next picks up `src/instrumentation.ts` in this project layout (the
  `src/` directory is in use, which is where Next expects it, but there was no
  instrumentation file before, so this is a new integration point).
- The rotation script end to end — it has never touched a database. Its Prisma
  dynamic model access (`(prisma as any)[target.model]`) is typed loosely on
  purpose and is unverified against the generated client.
- Whether every model name in `ENCRYPTED_TARGETS` matches its Prisma accessor.

**RISKS**

- **The rotation script is the least-tested code in this change and the most
  destructive if wrong** — it rewrites 17 columns. Mitigations: `--dry-run`
  first, idempotent by construction, non-zero exit on any failure, and the docs
  lead with "back up your database". It should not be considered proven until it
  has run against a real dataset. **Recommend treating rotation as experimental
  until Phase 14 can smoke-test it in CI against a seeded database.**
- A wrong model name in `ENCRYPTED_TARGETS` silently skips a table (the script
  warns on unknown models, but a *typo'd but valid* name cannot be detected).
  A test asserting the manifest against the Prisma DMMF would close this; not
  written yet.
- `src/instrumentation.ts` runs on every server start including during
  `next build` in some Next versions. It is guarded on `NEXT_RUNTIME`, but if the
  build environment has no database it will hit the catch path and warn — noisy
  but not fatal by design.

**NEXT**

Commit, push, open/refresh the PR so CI runs (`ci.yml` triggers on
`pull_request`, so a branch push alone is not enough), then report actual job
results.

---

## PHASE 1 — Compose and bootstrap fixes

**PHASE:** 1 — Fix existing Compose and bootstrap bugs
**STATUS:** Superseded in part by Phase 1a (ENCRYPTION_KEY). Awaiting CI.

**WHAT CHANGED**

*Security (two real defects, both found during the audit and fixed here):*

1. **`isRegistrationEnabled` was never enforced (N6).** Confirmed as a live vulnerability rather than a documentation gap: the field is stored in `InstanceSettings`, editable at `/profile/instance`, and read by no code in the auth path. An operator who switched registration off got a UI toggle that did nothing. Two vectors closed:
   - Email signup — guarded in both `initiateSignup` (so a closed instance never even sends an OTP) and `completeSignup` (they are separate requests and the setting can change between them).
   - **Google sign-in** — `loginWithGoogle` auto-provisions accounts for unknown emails, which is a second registration path that the obvious fix would have missed.

   The guard deliberately allows three cases: zero users (first-admin bootstrap must never lock itself out), registration enabled, and **a pending invitation for that email**. That last branch matters: `/api/invitations/[token]/accept` calls `requireUser()`, so an invitee must be able to create an account first. Without it, disabling public registration would silently break all team onboarding — a footgun worse than the bug being fixed.

2. **`ENCRYPTION_KEY` accepted any string.** `ENCRYPTION_KEY=secret` previously booted fine and SHA-256'd into a valid-looking AES key, encrypting every workspace's credentials under a guessable secret. Now: production throws with the generator command in the message; development still derives, but warns once. Also enforced at the Zod layer so it fails at boot rather than at first encrypt, and the `.env.example` placeholders are rejected by name in production.

*Compose and bootstrap:*

3. Profiles reworked — `postgres`, `migrate`, `app`, `worker` start by default; `schedule` and `socket` remain behind `full`. `docker compose up -d` is now a working Peon.
4. Migrations run via a one-shot `migrate` service gating `app`/`worker` on `service_completed_successfully`.
5. `DATABASE_URL` overridden per-service to the compose network host, so `.env` can keep `localhost` for host-based `pnpm dev`. DB name reconciled to `peon` everywhere.
6. App healthcheck added using `node -e` + global fetch — no curl/wget needed in the Alpine image.
7. `.env.example` restructured into REQUIRED / CORE / OPTIONAL.

*CI:*

8. New jobs: `typecheck` (**was entirely absent** — `pnpm typecheck` existed as a script but nothing ran it), `compose-validate`, `selfhost-smoke`.

**FILES**

- `src/services/internal/instance/instance.ts` — `isRegistrationAllowed`, `assertRegistrationAllowed`
- `src/services/internal/auth/auth.ts` — 3 guard call sites
- `src/lib/crypto/encryption.ts` — key validation, `isValidEncryptionKey`, `resetEncryptionKeyCache`
- `src/lib/env.ts` — production superRefine
- `src/services/internal/instance/__tests__/registration.test.ts` (new, 11 cases)
- `src/lib/crypto/__tests__/encryption-key.test.ts` (new, 13 cases)
- `src/lib/__tests__/env-secrets.test.ts` (new, 8 cases)
- `docker-compose.yml`, `.env.example`, `README.md`, `.github/workflows/ci.yml`

**ARCHITECTURAL DECISIONS**

| ID | Decision | Rationale |
|---|---|---|
| D8 | Migrations run in a dedicated one-shot `migrate` service, not a container entrypoint | An entrypoint runs once per container, so N app replicas would race on `prisma migrate deploy`. `service_completed_successfully` gives a single ordered migration with no lock juggling. Supersedes the checklist's "add a web entrypoint" task, now dropped. |
| D9 | `isValidEncryptionKey` is duplicated in `lib/env.ts` rather than imported | `lib/env.ts` is imported by 10 client components via `publicEnv`. Importing `lib/crypto/encryption.ts` would pull `node:crypto` toward the browser bundle. The duplicate is two lines using the `Buffer` global with no import. Both copies carry a comment pointing at the other. |
| D10 | Registration gate allows pending invitees | Otherwise disabling registration breaks invitations, since accepting one requires an existing account. |
| D11 | `NODE_ENV` removed from `.env.example` | `env_file` overrides image `ENV`, so shipping `NODE_ENV=development` silently ran production containers in development mode — which also skipped the new production secret checks. |

**TESTS PERFORMED**

None executed. Per the standing constraint, no project code runs on the developer's machine.

Verification done by static reasoning instead, and stated as such:

- **Build-time safety of the stricter env schema.** `ENCRYPTION_KEY: z.string().min(1)` was already required before this change, and `docker/Dockerfile`'s build stage sets no `ENCRYPTION_KEY` yet builds successfully today. Therefore `serverEnv()` is not called during `next build`. Confirmed independently: `grep` finds no module-scope `serverEnv()` call in `src/` or `worker/`. The stricter check adds no new build-time failure mode.
- **`migrate` service needs only `DATABASE_URL`.** `prisma.config.ts` reads `process.env.DATABASE_URL` directly and does not import `lib/env.ts`, so migrations do not trip the new secret validation.
- **Client-bundle safety.** Verified 10 `'use client'` components import `@/lib/env`; this is why D9 exists.
- **Integration suite compatibility.** `vitest.integration.config.ts` sets `NODE_ENV: 'test'` with a valid 32-byte `ENCRYPTION_KEY` and a non-placeholder `JWT_SECRET`, so the production branch never fires there.

**TESTS NOT RUN**

Everything, specifically:

- `pnpm typecheck` — the new `superRefine`, the Zod 4 `ctx.addIssue({ code: 'custom' })` shape, and the `vi.mocked(...)` casts in the new tests are **unverified against the compiler**. This is the highest-probability source of a first-run CI failure.
- `pnpm test:unit` — all 32 new test cases are unverified.
- `docker compose config` — the new compose file, the YAML anchor merge (`<<: *app-env`) combined with `env_file`, and the healthcheck `CMD` array form are unverified.
- The full `selfhost-smoke` path — never booted.
- Whether Prisma's `mode: 'insensitive'` is accepted on these two invitation queries.

**RISKS**

- **Typecheck is the likeliest failure.** Nothing has ever run `pnpm typecheck` in CI before this commit, so the baseline is unknown — the new `typecheck` job may surface pre-existing errors unrelated to Phase 1. If that happens, the fix is a separate commit, not a rollback of this one.
- **Behavior change for existing Compose users.** `docker compose --profile db up -d` no longer means "just Postgres"; the equivalent is `docker compose up -d postgres`. README updated. Anyone scripting the old profile names is affected.
- **Existing self-hosters with a weak `ENCRYPTION_KEY` will fail to boot after upgrading.** This is intended — they were running with effectively guessable encryption — but it is a breaking upgrade and needs release-note treatment. Their data is *not* recoverable by generating a new key; they must keep the old value and accept the warning, or re-enter secrets. **This needs an explicit upgrade note before any release.**
- `mode: 'insensitive'` requires Postgres; fine here, but it is a provider-specific Prisma feature.
- The D6 socket assertion currently treats `app`, `web` and `migrate` as web-tier. When local execution lands in Phase 7, that list must be revisited rather than quietly widened.

**NEXT**

Report to the developer and wait. Phase 2 (provider interfaces) does not start until Phase 1 is green, per instruction. Open question raised in the report: whether the agent may run `pnpm typecheck` / `pnpm test:unit` locally, given the standing no-execution rule.

---

## PHASE 0 — Repository audit

**PHASE:** 0 — Repository audit
**STATUS:** Complete

**WHAT CHANGED**

No source code was modified. Three documents were created:

- `docs/self-hosting-architecture.md` — the audit: current architecture, confirmation or correction of every assumption in the refactor brief, six newly-discovered risks, seven architectural decisions, and an explicit list of what the audit did *not* verify.
- `CHECKLIST.md` — 18 phases broken into ~150 tasks with acceptance criteria and an evidence rule governing when a task may be marked complete.
- `IMPLEMENTATION_LOG.md` — this file.

**FILES**

- `docs/self-hosting-architecture.md` (new)
- `CHECKLIST.md` (new)
- `IMPLEMENTATION_LOG.md` (new)

**ARCHITECTURAL DECISIONS**

| ID | Decision | Rationale |
|---|---|---|
| D1 | `ServerExecutor` wraps the existing `sshPool`; it does not replace it | 64 call sites across 10 files already funnel through one singleton whose methods already branch on `isE2eMode()`. The seam exists; formalize it. Byte-identical SSH behavior after the wrap is the gate before local execution is written. |
| D2 | `LocalServerExecutor` shells out to the `docker` CLI, not dockerode | The deploy engine emits shell command *strings*. Reusing them verbatim keeps one code path. dockerode would force rewriting 27 sites in `engine.ts` into an API shape — the duplication the brief forbids. dockerode is currently an unused dependency and should be removed. |
| D3 | Postgres queue via `SELECT … FOR UPDATE SKIP LOCKED`, no new runtime dependency | Postgres is already required. `SKIP LOCKED` gives correct multi-worker claiming in standard SQL. pg-boss/graphile-worker would bring a second schema, migration set and polling loop, duplicating the handler registry and shutdown logic already in `worker/index.ts`. Needed surface is ~150 lines against one table. Revisit if lease semantics prove subtle. |
| D4 | No Redis | Nothing in the architecture needs it. Fewer dependencies. |
| D5 | Local server modeled as `Server.executionMode` (`REMOTE` default, `LOCAL` new) | An explicit column keeps RBAC, destinations, settings and tags intact while changing only *how* commands execute. Default `REMOTE` preserves every existing row. Rejected: a magic `localhost` hostname — it works today but needs sshd plus a key, which is the hack the brief rightly refuses. |
| D6 | Docker socket reaches the worker only, never the web process | Hard invariant, to be asserted by a test over the Compose files rather than left to review. |
| D7 | UI fixtures inject at the `src/services/api/*` boundary | That boundary is already the single path the UI uses to reach the server. One switch there covers every screen and keeps `if (UI_MODE)` out of components entirely. |

**KEY AUDIT OUTCOMES**

*Brief overestimated three areas:*

1. An `EmailDriver` interface, factory and two drivers already exist. Phase 6 email work is "add an SMTP driver", not "build an abstraction".
2. Storage already distinguishes platform S3 from per-workspace `S3Storage`, already supports S3-compatible endpoints (MinIO works today for backups), and `screenshot.ts` already falls back to a local path. Phase 6 generalizes an existing pattern.
3. The SSH layer is already one singleton with 64 call sites, and already swaps behavior via `isE2eMode()`. The executor refactor is mechanical, not invasive.

*Six risks found that the brief does not mention:*

- **N1 — backups base64 into RAM.** `services/external/s3/backup.ts:21` reads the whole dump via `base64 <file>` over SSH into a Node Buffer. A 2 GB dump needs ~4.7 GB across string plus Buffer. Will OOM the worker on an 8 GB box or a small VPS. Scheduled inside Phase 6, not deferred.
- **N2 — `BASE_DIR` is hardcoded** (`deploy/helpers.ts:8`). Under containerized local execution the worker, host and Docker daemon see three different filesystems, and `docker compose up -d` resolves bind mounts against the daemon's view. This is the central local-mode trap. Mitigation: configurable `PEON_DATA_DIR`, mounted at an identical absolute path, plus path tests.
- **N3 — the integration suite hardcodes SQS env and `PEON_E2E=1`.** Queue work must keep it green.
- **N4 — `InstanceSettings.publicPortMin/Max` are declared and never read.** Single-server mode needs exactly this. Decide in Phase 8.
- **N5 — local mode has a root-privilege gap** that SSH mode sidesteps by requiring a root login. Recommendation: local servers skip OS provisioning entirely and assert Docker reachability instead.
- **N6 — `isRegistrationEnabled` enforcement not found** on the signup path. Must be verified in Phase 1 so bootstrap does not open registration on a public IP.

**TESTS PERFORMED**

None. Phase 0 is a read-only audit.

**TESTS NOT RUN**

Everything. Specifically not run: typecheck, unit suite, integration suite, `docker compose config`, any build. No claim in the audit rests on execution — every claim cites a file and line read directly.

**RISKS**

- The audit is static. Runtime behavior may differ from what the code appears to do, particularly around Prisma client generation and Next 16 route semantics.
- RAM figures required by the brief are deliberately absent. They must be measured in CI once the modes exist. Inventing them would be worse than omitting them.
- Phase ordering assumes Phase 1 lands first because every later CI smoke test needs a Compose stack that boots. If Phase 1 proves harder than expected, Phases 3 and 5 can proceed independently — neither depends on Compose.
- N1 (backup OOM) and N2 (path divergence) are the two findings most likely to cause real production incidents. Both are scheduled but neither is fixed yet.

**NEXT**

Phase 1 — fix the existing Compose and bootstrap bugs, and harden `ENCRYPTION_KEY`. Rationale for going first: every subsequent phase's acceptance criterion is a CI smoke test, and those tests need a stack that boots from a clean volume. Phase 1 also carries the two security-relevant items pulled forward from Phase 16 (`ENCRYPTION_KEY` validation, `isRegistrationEnabled` enforcement).
