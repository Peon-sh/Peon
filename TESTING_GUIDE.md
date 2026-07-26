# Peon Refactor Testing Guide

## Purpose

This branch (`teapot-impoved`) contains the standalone / self-hosting refactor:
AWS becomes optional, Peon can deploy onto the machine it runs on, and the
bootstrap path is repaired.

**The implementation was performed in a resource-constrained environment with no
ability to execute anything.** No TypeScript compile, no unit test, no Docker
build, no database, no SSH host, no CI run. Every claim in the source and in
`IMPLEMENTATION_LOG.md` rests on static review only.

This document describes how to validate the branch before production use or an
upstream merge. It is written for the Peon maintainer, a QA engineer, or any
developer with a suitable machine.

**Status vocabulary used throughout this repository:**

| Term | Meaning |
|---|---|
| IMPLEMENTED | Code exists and has been statically reviewed |
| STATICALLY REVIEWED | Imports, types, call sites, schema, control flow inspected |
| RUNTIME VERIFIED | Actually executed successfully |
| UNVERIFIED | Not executed |

Nothing in this branch is RUNTIME VERIFIED. Record results in
[TEST_RESULTS.md](TEST_RESULTS.md); open items live in
[VALIDATION_DEBT.md](VALIDATION_DEBT.md).

### Where to start if you only have an hour

1. §4 static validation — catches the largest class of defects fastest.
2. §12 SSH regression — the highest-consequence risk; it protects existing users.
3. §6 encryption legacy compatibility — the highest data-loss risk.

Everything else can wait.

---

## 1. Recommended testing machine

These are **estimates**, not measurements. No memory figure in this repository
has been measured; §26 exists to replace these numbers with real ones.

| | Minimum | Recommended |
|---|---|---|
| CPU | 4 cores | 8 cores |
| RAM | 8 GB | 16 GB |
| Disk | 40 GB free SSD | 60+ GB SSD |
| OS | Linux (Ubuntu 22.04/24.04 or Debian 12) | same |

Linux is strongly preferred. Docker Desktop on macOS/Windows runs a VM, which
changes the filesystem semantics that §14 exists to test — a pass there would not
prove the Linux behaviour.

Additional environments needed for full coverage:

- **§12** — one throwaway remote Linux VPS with SSH (any provider; 2 GB is enough)
- **§19** — one clean Linux VM that can be reset to a snapshot
- **§8** — an AWS account with two SQS queues (only to prove backwards compatibility)

---

## 2. Required software

Exact versions matter — the project pins them.

```bash
node --version     # must be 22.x   (.nvmrc, package.json engines)
pnpm --version     # must be 10.8.0 (packageManager)
docker --version   # Engine >= 24
docker compose version   # v2 plugin
git --version
psql --version     # optional; only for direct DB inspection
```

Install Node 22 and pnpm 10.8.0:

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
nvm install 22 && nvm use 22
corepack enable && corepack prepare pnpm@10.8.0 --activate
```

Do not use a newer pnpm for installs — the project pins 10.8.0 and CI's audit job
documents why.

---

## 3. Repository setup

```bash
git clone git@github.com:Mubashir-teapot/Peon.git
cd Peon
git checkout teapot-impoved
```

### 3.1 Lockfile — read this before installing

**`pnpm-lock.yaml` is stale on this branch (VD-012).** Three dependencies were
added and the lockfile could not be regenerated:

- `@aws-sdk/lib-storage` — streaming multipart backup upload
- `nodemailer` — SMTP email driver
- `@types/nodemailer`

`pnpm install --frozen-lockfile` **will fail**. That is expected, not a defect.

```bash
pnpm install          # regenerates the lockfile
git diff --stat pnpm-lock.yaml
```

Inspect the diff before committing. It should add the three packages above and
their transitive dependencies, and **should not** change versions of unrelated
packages. If it does, something else drifted — investigate rather than committing
blindly.

```bash
pnpm exec prisma generate     # required; the client is gitignored
```

### 3.2 Environment

```bash
cp .env.example .env
```

Fill the REQUIRED block:

```bash
# generate real secrets
openssl rand -hex 32       # -> JWT_SECRET
openssl rand -base64 32    # -> ENCRYPTION_KEY
```

`.env.example` is grouped REQUIRED / CORE / OPTIONAL. Note it deliberately does
**not** set `NODE_ENV` — `env_file` overrides image `ENV`, and setting it would
silently run containers in development mode.

---

## 4. Static validation

Fastest, cheapest, highest yield. Do this first.

```bash
pnpm exec prisma validate      # schema syntax + relations
pnpm typecheck                 # tsc --noEmit
pnpm test:unit                 # vitest
pnpm lint
for f in docker-compose*.yml; do docker compose -f "$f" config -q && echo "ok $f"; done
```

**Expected:** all clean.

**Important caveat:** `pnpm typecheck` has **never been run in this repository's
CI**, on this branch or before it. If it reports errors, determine whether they
are pre-existing by checking out `staging` and running it there before assuming
this branch caused them.

Areas most likely to fail, in order:

1. `prisma.queueJob` / `Server.executionMode` missing → you skipped `prisma generate`
2. Zod 4 `ctx.addIssue({ code: 'custom' })` shape in `src/lib/env.ts` (VD-002)
3. `vi.mocked()` casts in the new test files
4. `(prisma as any)[model]` dynamic access in `scripts/rotate-encryption-key.ts`

### 4.1 Completeness sweeps

Static checks that catch incomplete migrations:

```bash
# No business logic should call the SSH pool directly any more. Expected
# survivors: sshPool.disconnect() for pool lifecycle, and the terminal server.
grep -rn "sshPool\." --include=*.ts src/services worker/ | grep -v disconnect

# No hardcoded data dir outside the helper.
grep -rn "/data/peon" --include=*.ts src/ worker/ | grep -v peonDataDir

# Docker socket must never reach a web-tier service.
for f in docker-compose*.yml; do docker compose -f "$f" config --format json \
  | python3 -c "import json,sys; c=json.load(sys.stdin); \
  print([n for n,s in c['services'].items() if n in ('app','web','migrate') \
  and any('docker.sock' in str(v) for v in (s.get('volumes') or []))])"; done
```

---

## 5. Database migration test

Use a throwaway database.

| ID | Test | Expected |
|---|---|---|
| T-MIG-001 | `prisma migrate deploy` on empty DB | all migrations apply, exit 0 |
| T-MIG-002 | Run again immediately | no-op, exit 0 (idempotent) |
| T-MIG-003 | `prisma migrate diff --from-schema-datasource --to-schema-datamodel` | **empty** — schema and migrations agree |
| T-MIG-004 | `pnpm db:seed` | demo user created |
| T-MIG-005 | Restart app | no drift warnings |
| T-MIG-006 | Apply to a DB restored from a pre-refactor backup | the two new migrations apply cleanly, existing rows intact |

T-MIG-003 matters most: the `QueueJob` and `ServerExecutionMode` migrations were
**hand-written**, not generated by Prisma. A mismatch between the SQL and the
schema is entirely possible and would surface only here.

T-MIG-006 must confirm every existing `Server` row has `executionMode = 'REMOTE'`:

```sql
SELECT "executionMode", count(*) FROM "Server" GROUP BY 1;
```

---

## 6. Encryption tests — CRITICAL

The highest data-loss risk in the branch. Covers VD-007, VD-008, VD-009, VD-010.

**Back up the database before any rotation test.**

### 6.1 Key acceptance

| ID | Setup | Expected |
|---|---|---|
| T-ENC-001 | Fresh DB (0 users) + valid 32-byte key | starts normally |
| T-ENC-002 | Fresh DB + `ENCRYPTION_KEY=secret` | **refuses to start**, message names `openssl rand -base64 32` |
| T-ENC-003 | Fresh DB + `.env.example` placeholder | refuses to start |
| T-ENC-004 | Populated DB + legacy weak key | **starts**, prints the boxed DEPRECATED banner |
| T-ENC-005 | Populated DB + placeholder | starts + warns |
| T-ENC-006 | Legacy key + database unreachable | warns, does **not** refuse |

T-ENC-004 is the one that protects existing users. If it refuses to start, the
branch is not shippable.

Confirm the preflight actually runs (VD-006) — if the banner never appears on a
weak key, `src/instrumentation.ts` is not being loaded by Next and T-ENC-002 is
silently passing for the wrong reason.

### 6.2 Legacy decryption (VD-009)

Build a database whose secrets were encrypted by **pre-refactor Peon** with an
arbitrary key, or synthesise one by checking out `staging`, setting
`ENCRYPTION_KEY=some-arbitrary-passphrase`, and creating: an SSH private key, a
service with database credentials, service env vars, an S3 storage config, and an
LLM credential.

Then check out this branch with the **same** key.

| ID | Test | Expected |
|---|---|---|
| T-ENC-010 | Read the SSH private key | decrypts |
| T-ENC-011 | Read service env vars | decrypt |
| T-ENC-012 | Read database password | decrypts |
| T-ENC-013 | Read S3 credentials | decrypt |
| T-ENC-014 | Read LLM API key | decrypts |
| T-ENC-015 | Deploy a service using them | succeeds |

Any failure here means upgrading destroys existing installations.

### 6.3 Rotation (VD-007)

From the T-ENC-010 database:

```bash
export ENCRYPTION_KEY_PREVIOUS="some-arbitrary-passphrase"
export ENCRYPTION_KEY="$(openssl rand -base64 32)"
```

| ID | Test | Expected |
|---|---|---|
| T-ENC-020 | Restart with both keys | app works; old rows decrypt via fallback |
| T-ENC-021 | `pnpm encryption:rotate --dry-run` | reports counts; **zero rows modified** |
| T-ENC-022 | Verify no writes occurred | compare `updatedAt`/checksums before and after |
| T-ENC-023 | `pnpm encryption:rotate` | every encrypted value rewritten, `failed=0` |
| T-ENC-024 | Re-run rotation | `rotated=0`, `failed=0` (idempotent) |
| T-ENC-025 | Remove `ENCRYPTION_KEY_PREVIOUS`, restart | everything still decrypts |
| T-ENC-026 | Corrupt one ciphertext, rotate | non-zero exit, names the row, no partial damage |
| T-ENC-027 | Interrupt rotation mid-run (SIGKILL), re-run | completes cleanly |

For T-ENC-022, snapshot before the dry run:

```sql
SELECT id, md5(value) FROM "EnvironmentVariable" ORDER BY id;
```

### 6.4 Manifest completeness (VD-008)

`src/lib/crypto/encrypted-columns.ts` was assembled by hand. A wrong-but-valid
model name silently skips a table, whose data becomes unreadable once the previous
key is removed.

| ID | Test | Expected |
|---|---|---|
| T-ENC-030 | Cross-check the manifest against every `// encrypted` column in `prisma/schema.prisma` | exact match, 17 columns / 13 models |
| T-ENC-031 | Seed data in **every** listed model, then rotate | all rotate; none skipped |
| T-ENC-032 | `NotificationChannel.config` JSON values | rotate correctly, non-secret keys untouched |

---

## 7. Postgres queue tests — CRITICAL

Requires **real** PostgreSQL. Unit tests mock Prisma and prove nothing about the
SQL (VD-013). Set `QUEUE_DRIVER=postgres`.

| ID | Test | Expected DB state |
|---|---|---|
| T-QUEUE-001 | Enqueue a job | one row, `status=PENDING`, `attempts=0` |
| T-QUEUE-002 | One worker claims it | `PROCESSING`, `attempts=1`, `visibleAt` ≈ now+900s, `claimedBy` set |
| T-QUEUE-003 | Two workers, one job | exactly one claims; **never both** |
| T-QUEUE-004 | Two workers, 100 jobs | all processed exactly once, no duplicates |
| T-QUEUE-005 | Success | `COMPLETED`, `completedAt` set |
| T-QUEUE-006 | Handler throws | `PENDING`, `visibleAt` moved forward, `attempts` incremented, `lastError` set |
| T-QUEUE-007 | Backoff grows | delay increases with attempts, capped at 300s |
| T-QUEUE-008 | Reach `maxAttempts` | `FAILED`, never retried again |
| T-QUEUE-009 | `SIGKILL` worker mid-job | row stays `PROCESSING` |
| T-QUEUE-010 | Wait past the lease | another worker reclaims it |
| T-QUEUE-011 | Malformed payload | `FAILED` immediately, no loop |
| T-QUEUE-012 | `NotFoundError` from handler | dropped, not retried |
| T-QUEUE-013 | Both queue types | `deploy` → `deployments`, others → `tasks` |
| T-QUEUE-014 | Graceful `SIGTERM` | in-flight jobs finish or return to `PENDING` |
| T-QUEUE-015 | `visibleAt` in the future | not claimed early |

**T-QUEUE-009/010 is the requirement the developer called out explicitly: a job
must never remain `PROCESSING` forever.** To shorten the wait, temporarily lower
`LEASE_SECONDS` in `src/lib/queue/providers/postgres.ts`.

### 7.1 Query plan (VD-028)

```sql
EXPLAIN ANALYZE
UPDATE "QueueJob" SET "status"='PROCESSING'
WHERE "id" IN (
  SELECT "id" FROM "QueueJob"
  WHERE "queue"='deployments' AND "status" IN ('PENDING','PROCESSING')
    AND "visibleAt" <= NOW()
  ORDER BY "visibleAt" ASC LIMIT 10 FOR UPDATE SKIP LOCKED
) RETURNING "id";
```

Seed ~100k `COMPLETED` and ~1k `PENDING` rows first.

**Expected:** index scan on `QueueJob_claim_idx`. A sequential scan means the
partial index is not being used and the queue degrades as history accumulates.

Also confirm `purgeCompleted()` is reachable — it exists but nothing schedules it
yet, so completed rows grow without bound.

---

## 8. Existing SQS compatibility — CRITICAL

Protects current users. Configure real SQS URLs.

| ID | Test | Expected |
|---|---|---|
| T-SQS-001 | SQS URLs set, `QUEUE_DRIVER` **unset** | resolves to `sqs` — never silently switches to Postgres |
| T-SQS-002 | Worker startup log | prints `queue driver=sqs` |
| T-SQS-003 | Deployment via SQS | unchanged behaviour |
| T-SQS-004 | Scheduled task | works |
| T-SQS-005 | Backup job | works |
| T-SQS-006 | Email job | works |
| T-SQS-007 | Handler throws | message redelivered after the visibility timeout |
| T-SQS-008 | `NotFoundError` | message deleted, not redelivered |
| T-SQS-009 | Explicit `QUEUE_DRIVER=postgres` with SQS present | uses Postgres (deliberate migration) |

T-SQS-001 is the backwards-compatibility guarantee. A failure here strands
in-flight jobs in SQS with nothing polling for them.

---

## 9. Email providers

| ID | Driver | Test |
|---|---|---|
| T-MAIL-001 | `test` | OTP printed to worker console |
| T-MAIL-002 | `smtp` (Mailpit) | signup OTP arrives |
| T-MAIL-003 | `smtp` | password reset arrives |
| T-MAIL-004 | `smtp` | workspace invitation arrives |
| T-MAIL-005 | `smtp` | notification email arrives |
| T-MAIL-006 | `smtp`, port 465 | implicit TLS negotiated |
| T-MAIL-007 | `smtp`, port 587 | STARTTLS negotiated |
| T-MAIL-008 | `smtp`, wrong credentials | job fails and retries; error is legible |
| T-MAIL-009 | `smtp`, `SMTP_HOST` unset | clear error naming `.env.example` |
| T-MAIL-010 | `aws-ses` | unchanged from before the refactor |

Mailpit:

```bash
docker run -d -p 1025:1025 -p 8025:8025 axllent/mailpit
# EMAIL_DRIVER=smtp SMTP_HOST=localhost SMTP_PORT=1025
```

**T-MAIL-002 combined with `QUEUE_DRIVER=postgres` and no AWS configured is the
core AWS-independence claim.** Signup must complete end to end.

---

## 10. Storage providers

| ID | Driver | Test |
|---|---|---|
| T-STORE-001 | `local` | avatar upload → read back |
| T-STORE-002 | `local` | deployment screenshot stored and served |
| T-STORE-003 | `local` | `/api/storage/...` requires a session (401 when logged out) |
| T-STORE-004 | `local` | path traversal (`../../etc/passwd`) refused |
| T-STORE-005 | `local` | delete removes the file |
| T-STORE-006 | `s3` | unchanged behaviour; existing URLs still resolve |
| T-STORE-007 | MinIO via `S3_ENDPOINT` | works |
| T-STORE-008 | `S3_BUCKET` set, `STORAGE_DRIVER` unset | auto-detects `s3` |
| T-STORE-009 | Neither set | auto-detects `local` |
| T-STORE-010 | Bad credentials | legible error, no crash |

Note the known limitation (VD-019): switching drivers orphans existing objects;
there is no migration tool.

---

## 11. Streaming backups

Verifies the OOM fix (VD-016). The old code held ~2.4× the dump size in heap.

| ID | Test | Expected |
|---|---|---|
| T-BACK-001 | Back up a small Postgres service | succeeds |
| T-BACK-002 | Back up a **≥ 2 GB** database | succeeds; **worker RSS stays bounded** |
| T-BACK-003 | Measure peak worker RSS during T-BACK-002 | well under 1 GB regardless of dump size |
| T-BACK-004 | Restore from backup | data intact |
| T-BACK-005 | Temp files after success | removed |
| T-BACK-006 | Kill SFTP mid-transfer | fails cleanly, temp removed |
| T-BACK-007 | Kill the upload mid-transfer | fails cleanly, temp removed |
| T-BACK-008 | Fill the temp filesystem | legible error, no corruption |
| T-BACK-009 | Backup with no S3 configured | dump retained on the server, execution recorded |

Measure with:

```bash
while true; do ps -o rss= -p $(pgrep -f 'worker/index.ts'); sleep 1; done | sort -n | tail -1
```

T-BACK-002/003 is the whole point. If RSS tracks dump size, the fix did not work.

---

## 12. SSH regression — CRITICAL

**The single most important section.** Phase 7 redirected all 64 existing call
sites through `ServerExecutor`. A regression breaks every existing Peon
installation, which matters more than any new feature (VD-025).

Requires a real remote Linux VPS.

| ID | Test |
|---|---|
| T-SSH-001 | Add a server; validate/connect |
| T-SSH-002 | Docker detection on a host that has it |
| T-SSH-003 | Docker install on a host without it |
| T-SSH-004 | Host-key TOFU on first connect |
| T-SSH-005 | Host-key **mismatch** rejected with the specific error |
| T-SSH-006 | Pinned fingerprint honoured |
| T-SSH-007 | Start proxy (Traefik) |
| T-SSH-008 | Deploy a Git app (Nixpacks) |
| T-SSH-009 | Deploy a Dockerfile app |
| T-SSH-010 | Deploy a Docker image |
| T-SSH-011 | Deploy a Compose stack |
| T-SSH-012 | Deploy a database service |
| T-SSH-013 | Start / stop / restart |
| T-SSH-014 | Tail logs |
| T-SSH-015 | Scheduled task runs in-container |
| T-SSH-016 | Backup and restore |
| T-SSH-017 | Docker cleanup |
| T-SSH-018 | Browser terminal (server + service) |
| T-SSH-019 | **Cancel a deployment mid-build** |
| T-SSH-020 | Rollback to a previous commit |
| T-SSH-021 | **Rolling update** — old container stops only after new one is healthy |
| T-SSH-022 | PR preview create and teardown |
| T-SSH-023 | Image retention cleanup respects `dockerImagesToKeep` |
| T-SSH-024 | Deploy failure surfaces container logs |
| T-SSH-025 | Change server IP → pooled session dropped, no stale connection |

T-SSH-019 and T-SSH-021 exercise the logic most likely to have been disturbed:
cancellation checks and the rolling swap in `deploy/engine.ts`.

---

## 13. Local server test

Single-server: control plane and workloads on the same machine (VD-024).

**Must NOT be required:** an SSH keypair for the local server, a `127.0.0.1`
server record, `sshd`, or a hand-created database row.

| ID | Test |
|---|---|
| T-LOCAL-001 | After install, a local server exists automatically |
| T-LOCAL-002 | It has no private key and is not reachable via SSH |
| T-LOCAL-003 | Validate/connect succeeds against the local Docker daemon |
| T-LOCAL-004 | `concurrentBuilds` defaults to 1 |
| T-LOCAL-005 | Deploy a Git app to it |
| T-LOCAL-006 | Build runs on the host Docker daemon |
| T-LOCAL-007 | Health check passes; deployment `FINISHED` |
| T-LOCAL-008 | Logs readable |
| T-LOCAL-009 | Stop / start / restart |
| T-LOCAL-010 | Redeploy |
| T-LOCAL-011 | Rolling update |
| T-LOCAL-012 | Deploy a database service |
| T-LOCAL-013 | Deploy a Compose stack |
| T-LOCAL-014 | Domain routing through the local proxy |
| T-LOCAL-015 | Backup a local database service |
| T-LOCAL-016 | Scheduled task |
| T-LOCAL-017 | Cleanup |
| T-LOCAL-018 | Cancel a local deployment |
| T-LOCAL-019 | Service (container) terminal |
| T-LOCAL-020 | Docker socket **not** reachable from the web container |

---

## 14. Filesystem / PEON_DATA_DIR — CRITICAL

Tests the worker/host/daemon path model (VD-021). Failures here are silent: bind
mounts point at the wrong directory instead of erroring.

Run with a **containerised** worker — that is the case that breaks.

| ID | Test | How |
|---|---|---|
| T-FS-001 | Worker and host see the same path | `PEON_DATA_DIR` mounted at the identical absolute path both sides |
| T-FS-002 | Generated compose file is where the daemon expects | compare `docker inspect` mount source with the worker's path |
| T-FS-003 | Git checkout lands in `$PEON_DATA_DIR/services/<uuid>/src` | inspect on the host |
| T-FS-004 | Build context resolves | build succeeds with repo files present |
| T-FS-005 | `.env` file is read by `docker compose` | interpolated vars appear in the container |
| T-FS-006 | Bind-mounted volume contents visible in-container | write on host, read in container |
| T-FS-007 | Named volumes work | data survives redeploy |
| T-FS-008 | Backups land in `$PEON_DATA_DIR/backups` | on the host |
| T-FS-009 | Custom `PEON_DATA_DIR=/srv/peon` | everything relocates consistently |
| T-FS-010 | Preview deployments isolate to their own directory | no collision with production |

```bash
docker inspect <container> --format '{{json .Mounts}}' | python3 -m json.tool
docker exec peon-worker ls -la /data/peon/services
ls -la /data/peon/services      # same content on the host
```

---

## 15. Hybrid test

One installation, three servers: LOCAL, REMOTE-A, REMOTE-B.

| ID | Test |
|---|---|
| T-HYB-001 | All three registered in one workspace |
| T-HYB-002 | Frontend → LOCAL, API → REMOTE-A, DB → LOCAL, worker → REMOTE-B |
| T-HYB-003 | All four deploy successfully |
| T-HYB-004 | Simultaneous deployments to local and remote |
| T-HYB-005 | Per-server build concurrency respected independently |
| T-HYB-006 | Logs/terminal target the correct server |
| T-HYB-007 | Moving a service between servers (where supported) |
| T-HYB-008 | Deleting the local server does not affect remote ones |

Local vs remote must be a per-server property — there must be no "local mode"
installation that excludes remote servers.

---

## 16. UI-only mode

| ID | Test |
|---|---|
| T-UI-001 | Documented command starts a single web process |
| T-UI-002 | **No** Postgres, worker, scheduler, socket, queue, AWS |
| T-UI-003 | Dashboard, projects, servers, services, deployments, settings all navigable |
| T-UI-004 | Loading / empty / error states reachable |
| T-UI-005 | Hot reload without an image rebuild |
| T-UI-006 | No Chromium in the image |
| T-UI-007 | **Fixture mode cannot activate with `NODE_ENV=production`** |
| T-UI-008 | No `if (UI_MODE)` inside `src/components/**` |
| T-UI-009 | Idle RAM measured and recorded |

T-UI-007 is a security check, not a nicety.

---

## 17. Lightweight development mode

| ID | Test |
|---|---|
| T-DEV-001 | `docker compose -f docker-compose.dev.yml up` starts web, worker, postgres only |
| T-DEV-002 | No Chromium, LocalStack, MinIO, SQS emulator, Docker-in-Docker |
| T-DEV-003 | Auth works |
| T-DEV-004 | Workspace/project/service CRUD works |
| T-DEV-005 | Postgres queue processes a job |
| T-DEV-006 | Hot reload for web and worker |
| T-DEV-007 | **Measured** idle RAM per service (target ~1–1.5 GB total, ceiling ~2 GB) |
| T-DEV-008 | Works with no AWS configuration at all |

---

## 18. Infrastructure mode

| ID | Test |
|---|---|
| T-INFRA-001 | Full stack starts |
| T-INFRA-002 | Scheduler and socket run |
| T-INFRA-003 | Mailpit receives mail |
| T-INFRA-004 | S3 emulator works |
| T-INFRA-005 | SSH test target usable as a managed server |
| T-INFRA-006 | `concurrentBuilds` defaults to 1 |
| T-INFRA-007 | Measured RAM recorded |

---

## 19. Single-server installer

**Start from a clean Linux VM snapshot.** Do not repair files by hand during the
success-path run — if it needs manual repair, it failed.

| ID | Test |
|---|---|
| T-INST-001 | Documented one-command install on a clean VM |
| T-INST-002 | Docker absent → installed |
| T-INST-003 | Docker present → reused |
| T-INST-004 | Secrets generated; `ENCRYPTION_KEY` is a valid 32-byte value |
| T-INST-005 | Migrations run automatically |
| T-INST-006 | Postgres queue configured by default |
| T-INST-007 | Local storage configured |
| T-INST-008 | Local server registered automatically |
| T-INST-009 | Dashboard reachable |
| T-INST-010 | First admin created **without** working email |
| T-INST-011 | Bootstrap token is single-use and expires |
| T-INST-012 | Re-running the installer is idempotent and destroys nothing |
| T-INST-013 | Survives reboot |
| T-INST-014 | Insufficient RAM/disk/ports → refuses with a clear message |
| T-INST-015 | Deploy an app immediately after install, with no further configuration |

T-INST-015 is the product claim: *install Peon on a Linux server and start
deploying.*

---

## 20. Control-plane TLS

| ID | Test |
|---|---|
| T-TLS-001 | Control-plane domain served over HTTPS |
| T-TLS-002 | Deployed app domain served over HTTPS on the same host |
| T-TLS-003 | Exactly one process owns :80 and :443 |
| T-TLS-004 | ACME issuance succeeds |
| T-TLS-005 | Renewal configuration present |
| T-TLS-006 | Proxy restart does not drop the control plane |
| T-TLS-007 | No port conflict between control-plane and workload proxies |

## 21. Remote TLS

| ID | Test |
|---|---|
| T-RTLS-001 | Traefik on a managed server unchanged |
| T-RTLS-002 | Caddy on a managed server unchanged |
| T-RTLS-003 | Certificates still issue for app domains |

---

## 22. Browser terminal

| ID | Test | Expected |
|---|---|---|
| T-TERM-001 | Remote server terminal | works |
| T-TERM-002 | Remote service terminal | works |
| T-TERM-003 | Local **service** terminal | works via `docker exec` |
| T-TERM-004 | Local **host** terminal | either works, or the UI disables it with an explanation |
| T-TERM-005 | No null SSH target is ever dialled | no crash, no hang |
| T-TERM-006 | Session timeout enforced | closes at `TERMINAL_SESSION_MAX_SECONDS` |

See VD-026 for the current design position on local terminals.

---

## 23. Marketplace templates

| ID | Test |
|---|---|
| T-TMPL-001 | Simple app template (remote) |
| T-TMPL-002 | Same template (local) |
| T-TMPL-003 | Database-backed template |
| T-TMPL-004 | Template with volumes |
| T-TMPL-005 | Magic env values generate correctly |
| T-TMPL-006 | Generated credentials stored encrypted |
| T-TMPL-007 | Domain assignment works |

---

## 24. Security regression

| ID | Test |
|---|---|
| T-SEC-001 | Registration disabled → signup returns 403 |
| T-SEC-002 | Invited address can still register while disabled |
| T-SEC-003 | First user on an empty instance always allowed |
| T-SEC-004 | **Google sign-in respects the registration setting** |
| T-SEC-005 | Workspace isolation holds |
| T-SEC-006 | Project isolation holds |
| T-SEC-007 | MCP token cannot reach another workspace |
| T-SEC-008 | Chat approval required for mutating tools |
| T-SEC-009 | Secrets masked in chat tool calls |
| T-SEC-010 | Session revocation invalidates the cookie immediately |
| T-SEC-011 | Malicious git ref rejected |
| T-SEC-012 | SSH host-key verification cannot be bypassed |
| T-SEC-013 | Docker socket unreachable from the web container |
| T-SEC-014 | Local execution requires the same RBAC as remote |
| T-SEC-015 | `/api/storage` requires a session |
| T-SEC-016 | Storage path traversal refused |

T-SEC-004 covers the second bypass vector found during the audit — it is easy to
miss because the obvious fix only guards email signup.

---

## 25. Upgrade test — CRITICAL

Take a **real** pre-refactor Peon installation and upgrade it.

| ID | Test | Expected |
|---|---|---|
| T-UPG-001 | Existing SQS config | still used; no silent switch to Postgres |
| T-UPG-002 | Existing S3 config | still used |
| T-UPG-003 | Existing SSH servers | all `executionMode = REMOTE` |
| T-UPG-004 | Existing services | deploy successfully |
| T-UPG-005 | Legacy `ENCRYPTION_KEY` | still decrypts everything |
| T-UPG-006 | Existing sessions | remain valid |
| T-UPG-007 | Migrations | apply without data loss |
| T-UPG-008 | Existing scheduled tasks and backups | still run |
| T-UPG-009 | Existing notification channels | still fire |

**No existing installation may silently change infrastructure providers.**

---

## 26. Resource measurement

Replace the estimates in §1 and in `docs/development.md` with real numbers.

| ID | Measure |
|---|---|
| T-RES-001 | Web process idle RSS |
| T-RES-002 | Worker idle RSS |
| T-RES-003 | Postgres idle RSS |
| T-RES-004 | UI-only mode total |
| T-RES-005 | Dev mode total |
| T-RES-006 | Single-server mode total |
| T-RES-007 | Infrastructure mode total |
| T-RES-008 | `next build` peak RSS |
| T-RES-009 | Backup peak worker RSS (see §11) |
| T-RES-010 | Peak during a Nixpacks build on a local server |

```bash
docker stats --no-stream --format 'table {{.Name}}\t{{.MemUsage}}'
```

**No estimated number may remain in the documentation once measured.**

---

## 27. Failure tests

Failure states must be understandable and recoverable.

| ID | Induce | Expected |
|---|---|---|
| T-FAIL-001 | Postgres down | clear error; recovers when it returns |
| T-FAIL-002 | Docker daemon down (local mode) | clear error naming the socket |
| T-FAIL-003 | SQS unreachable | worker retries, does not spin |
| T-FAIL-004 | SMTP unreachable | email job retries, signup shows a real error |
| T-FAIL-005 | Storage unavailable | upload fails legibly |
| T-FAIL-006 | SSH host unreachable | server marked unreachable |
| T-FAIL-007 | Disk full during backup | clean failure, temp removed |
| T-FAIL-008 | Wrong `ENCRYPTION_KEY` on a populated DB | decrypt errors are legible, not silent corruption |
| T-FAIL-009 | Bad git repository URL | deployment fails with the git error |
| T-FAIL-010 | Build failure | deployment `FAILED`, logs retained |
| T-FAIL-011 | Health check never passes | deployment `FAILED` after retries, container logs shown |
| T-FAIL-012 | Cancel mid-deployment | `CANCELLED`, no orphan containers |
| T-FAIL-013 | Kill worker mid-job | job reclaimed after lease expiry |
| T-FAIL-014 | Restart worker | resumes cleanly |
| T-FAIL-015 | Corrupt queue payload | `FAILED`, no poison loop |

---

## Test result format

For each executed test record:

```
TEST ID:      T-QUEUE-003
ENVIRONMENT:  Ubuntu 24.04, Node 22.14, Docker 27.3, Postgres 16
COMMAND:      (steps taken)
EXPECTED:     exactly one worker claims the job
ACTUAL:       (observed)
RESULT:       PASS | FAIL | BLOCKED
LOGS:         (relevant excerpt)
ISSUE:        (link or description if failed)
```

Summarise in [TEST_RESULTS.md](TEST_RESULTS.md). **Do not mark anything PASS that
was not executed.**
