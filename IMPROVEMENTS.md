# Peon Standalone Self-Hosting Improvements

> **Status: IMPLEMENTATION PARTIAL / RUNTIME VALIDATION PENDING.**
>
> Nothing in this branch has been executed — no compile, no test, no container,
> no database. Every "Implemented" below means *code exists and was statically
> reviewed*. See [TESTING_GUIDE.md](TESTING_GUIDE.md) for how to validate it and
> [TEST_RESULTS.md](TEST_RESULTS.md) for the (empty) results table.
>
> **Do not merge or deploy this branch on the strength of this document.**

## Why this work was done

Peon's architecture is sound — a control plane that SSHes into customer servers,
with clean RBAC, careful deployment cancellation and real security work. The
friction is entirely around getting it running.

Concretely, before this branch:

- **AWS SQS was mandatory.** Not optional-with-a-fallback: `enqueue()` throws
  without it, and every deploy, backup, scheduled task and *even signup* (the OTP
  is an email job) goes through the queue. "Self-hostable" required an AWS
  account.
- **`docker compose up -d` did not work.** `--profile full` started no database;
  migrations never ran; `.env.example` named a different database than Compose
  created; `NODE_ENV=development` in `.env.example` silently overrode the images'
  production setting.
- **A separate managed server was required.** Deploying onto the machine Peon
  runs on meant installing sshd, generating a keypair for your own host, and
  creating a Server row pointing at itself.
- **No first-class local server.** `Server` had no notion of local execution.
- **Development needed the full stack.** No way to work on a React component
  without Postgres, a worker and a queue.
- **No installer.** No `curl | bash`, no published images; self-hosters compiled
  Next.js and downloaded Chromium on their VPS.

Two live defects were also found during the audit and are fixed here — see
[Security improvements](#security-improvements).

## What changed

### Standalone operation

AWS moves from dependency to optional provider:

```
QueueProvider          StorageProvider        EmailProvider
├── Postgres  (default) ├── Local  (default)  ├── SMTP
└── SQS       (opt-in)  └── S3     (opt-in)   ├── Test
                                              └── SES
```

Each resolver imports only the selected implementation, so the SQS path never
loads Prisma, the Postgres path never loads the AWS SDK, and SMTP never loads
nodemailer.

### Queue architecture

Postgres-backed queue using `SELECT … FOR UPDATE SKIP LOCKED`. No Redis, no new
runtime dependency — Postgres was already required.

The design point worth reviewing: **claiming leases rather than deletes.** The
row stays, `visibleAt` moves forward, status becomes `PROCESSING`. A worker that
dies never acknowledges, the lease expires, another worker takes it. A job cannot
sit in `PROCESSING` forever. The trade-off is at-least-once delivery, matching the
SQS visibility-timeout semantics the existing handlers were already written
against.

Adds what SQS provided server-side: attempt counter with cap, exponential
backoff, terminal `FAILED` state, malformed-payload rejection.

### Single-server deployments

`Server.executionMode` (`REMOTE` default, `LOCAL` new). A local server is an
ordinary `Server` row — same workspace scoping, RBAC, destinations, settings,
tags — so nothing downstream special-cases it. Only `executorForServer()` differs.

No sshd, no keypair for your own machine, no `127.0.0.1`, no hand-made row.

### Remote deployments

Unchanged in behaviour, but the transport moved behind an interface:

```
BEFORE   deployment logic → sshPool
AFTER    deployment logic → ServerExecutor ─┬─ SshServerExecutor (delegates to sshPool)
                                            └─ LocalServerExecutor
```

`SshServerExecutor` is pure delegation — pooling, host-key verification,
stale-channel retry and E2E stubbing all stay where they were. **This is the
change most likely to have broken something, and the one most worth reviewing.**

### Hybrid deployments

Falls out for free. Local vs remote is a per-server property, never an
installation mode, so one workspace can hold a local server and any number of
remote ones and each service picks its target as before.

### Storage architecture

`LocalStorageProvider` under `PEON_DATA_DIR/storage`, served by
`/api/storage/[...key]` behind a session, with path-traversal guards. S3 is
unchanged and auto-detected when `S3_BUCKET` is set.

### Email architecture

The `EmailDriver` interface already existed; this adds an SMTP driver. Any normal
provider works — your own server, Resend, Postmark, Mailgun, MXroute.

### Backup improvements

The old upload ran `base64 <file>` over SSH and decoded the result in memory,
holding roughly 2.4× the dump size in heap. A 2 GB database needed ~5 GB and
killed the worker. Now: SFTP to a temp file, then a streamed multipart upload.
Peak memory is one 8 MiB part. New cost is disk equal to the dump size.

### Security improvements

Two live defects found during the audit:

1. **`isRegistrationEnabled` was never enforced.** Stored, editable in the
   instance admin UI, and read by no code in the auth path — turning registration
   off did nothing. Both vectors closed: email signup and Google
   auto-provisioning. The guard still allows the first user (bootstrap) and
   anyone holding a pending invitation, since accepting an invite requires an
   existing account.

2. **`ENCRYPTION_KEY` accepted any string**, SHA-256-ing it into a valid-looking
   AES key. `ENCRYPTION_KEY=secret` booted fine and encrypted every workspace's
   credentials under a guessable key.

   The fix deliberately does **not** hard-fail existing installations — see
   [Migration notes](#migration-notes).

### UI-only development

Deterministic fixtures plus a production-safe guard, and a compose file running
one Next process — no Postgres, worker, queue, AWS, SSH, Playwright or Chromium.

### Lightweight development

`docker-compose.dev.yml`: web, worker, postgres. Postgres queue and local
storage, so no AWS and no emulator. Scheduler and socket behind an `extras`
profile.

### Bootstrap

`docker compose up -d` now starts Postgres, runs migrations via a one-shot
`migrate` service (not per-container entrypoints racing each other), and starts
app and worker with a real healthcheck.

---

## Implementation and validation status

**Every row is "Runtime validated: No".** That is the honest state.

| Feature | Implemented | Runtime validated | Required testing |
|---|---|---|---|
| Postgres queue | Yes | **No** | §7 |
| SQS backwards compatibility | Yes | **No** | §8 |
| Local storage provider | Yes | **No** | §10 |
| SMTP email driver | Yes | **No** | §9 |
| Streaming backups | Yes | **No** | §11 |
| `ServerExecutor` abstraction | Yes | **No** | §12 |
| Remote (SSH) regression safety | Yes | **No** | **§12 — highest priority** |
| Local execution | Yes | **No** | §13 |
| Hybrid local + remote | Yes | **No** | §15 |
| `PEON_DATA_DIR` filesystem model | Yes | **No** | §14 |
| Registration enforcement | Yes | **No** | §24 |
| Encryption legacy compatibility | Yes | **No** | **§6 — data-loss risk** |
| Encryption key rotation | Yes | **No** | §6.3 — treat as experimental |
| Compose bootstrap | Yes | **No** | §5, §19 |
| UI-only fixtures | **Partial** — adapter not wired (VD-031) | **No** | §16 |
| Lightweight dev mode | Yes | **No** | §17 |
| Infrastructure mode | **No** | — | §18 |
| One-command installer | **No** | — | §19 |
| Control-plane TLS | **No** | — | §20 |
| Prebuilt images | **No** | — | — |
| Local terminals | Deliberately blocked | **No** | §22, VD-029 |

---

## Backwards compatibility

The guiding rule: **an existing installation must not change behaviour on
upgrade.**

| Area | Behaviour |
|---|---|
| **SQS** | With SQS URLs set and no `QUEUE_DRIVER`, resolves to `sqs`. Never silently migrated — that would strand in-flight jobs with nothing polling them. |
| **S3** | With `S3_BUCKET` set and no `STORAGE_DRIVER`, resolves to `s3`. Object URLs unchanged. |
| **SES** | Untouched. `EMAIL_DRIVER=aws-ses` behaves as before. |
| **SSH servers** | `executionMode` defaults to `REMOTE`; the migration is additive with no backfill. Every existing row keeps its exact behaviour. |
| **Encryption** | Legacy SHA-256-derived keys remain **permanently** supported. |
| **Environment** | All new variables are optional with backwards-compatible defaults. |

## Migration notes

**1. `ENCRYPTION_KEY` — read this before upgrading.**

If your key is not 32 bytes of base64, your data is encrypted under
`sha256(your-key)`. This branch keeps reading it, forever. You will see a
deprecation banner at startup. **Nothing is required of you.**

Do **not** "fix" the warning by generating a new key and restarting — that makes
every stored secret undecryptable. To move to a proper key:

```bash
ENCRYPTION_KEY_PREVIOUS=<current key>
ENCRYPTION_KEY=$(openssl rand -base64 32)
# restart, then:
pnpm encryption:rotate --dry-run
pnpm encryption:rotate
# confirm rotated=0 on a second run, then drop ENCRYPTION_KEY_PREVIOUS
```

**Back up your database first.** Rotation rewrites 17 columns and is the
least-tested code in this branch.

**2. New installations** refuse to start with an invalid key. Existing ones only
warn. The distinction is made by a database check, not by configuration.

**3. `docker compose --profile db up -d`** no longer means "just Postgres" — it
is now `docker compose up -d postgres`.

**4. The lockfile is stale.** Three dependencies were added and
`pnpm-lock.yaml` could not be regenerated. Run `pnpm install` and inspect the
diff before committing.

## New commands

```bash
# UI-only development (no database, no worker, no AWS)
docker compose -f docker-compose.ui.yml up

# Lightweight development (web + worker + postgres)
docker compose -f docker-compose.dev.yml up

# Self-host
cp .env.example .env      # fill the REQUIRED block
docker compose up -d      # postgres + migrations + app + worker

# Encryption key rotation
pnpm encryption:rotate --dry-run
pnpm encryption:rotate
```

## Architecture before

```
                    ┌──────────────┐
                    │   AWS SQS    │  ← REQUIRED
                    └──────┬───────┘
                           │
   ┌───────────────────────┴──────────────────────┐
   │              Peon control plane              │
   │   Next.js · worker · scheduler · Postgres    │
   └───────────────────────┬──────────────────────┘
                           │ SSH (only transport)
        ┌──────────────────┼──────────────────┐
     Server B           Server C           Server D
```

## Architecture after

```
   ┌──────────────────────────────────────────────┐
   │              Peon control plane              │
   │   Next.js · worker · scheduler · Postgres    │
   │                                              │
   │   Queue:   Postgres │ SQS      (optional)    │
   │   Storage: Local    │ S3       (optional)    │
   │   Email:   SMTP     │ SES/Test (optional)    │
   └───────────────────────┬──────────────────────┘
                           │
                    ServerExecutor
              ┌────────────┴────────────┐
        LocalServerExecutor      SshServerExecutor
              │                          │
        Docker on THIS host     ┌────────┼────────┐
              │              Server B  Server C  Server D
        apps + databases
```

## Tests and validation

**None were run.** The implementation environment had no `node_modules`, no
pnpm, no Docker, no database and no CI access.

What was done instead: static review of imports, types, call sites, schema
impact, migrations, backwards compatibility, env defaults, error paths and
security implications, plus repository-wide sweeps for incomplete migration.
Those sweeps did find real defects, which were fixed — see VD-023.

Roughly 100 unit tests were written and **none have been executed.**

## Known limitations

- Local terminals are deliberately blocked (VD-029). A host shell would be an
  unaudited root shell on the Peon machine; container terminals need a PTY.
- UI fixture adapter is not wired to the API clients (VD-031).
- Infrastructure mode, the installer, control-plane TLS and prebuilt images are
  not implemented.
- Switching storage drivers orphans existing objects; no migration tool (VD-019).
- `purgeCompleted()` for queue history exists but nothing schedules it.
- `.data/deployment-previews` is still relative to `process.cwd()`.

## Security considerations

**Docker socket.** Local execution requires it, and socket access is equivalent
to root on the host. Rules: only the worker gets it (asserted in CI against every
compose file), never over TCP.

**A socket proxy is not a real boundary here.** Peon legitimately needs container
create, image build, exec and volume management — that set is already enough to
take over the host. A proxy limits accidental API surface, not a compromised
worker. Treat a compromised worker as a compromised host; if you need isolation,
use remote servers.

**Local vs remote authorization is identical** — the same RBAC applies either way.

## Files and modules added

```
src/lib/queue/{types,index}.ts, providers/{sqs,postgres}.ts
src/lib/storage/{types,index}.ts, providers/{local,s3}.ts
src/lib/executor/{types,index,ssh,local}.ts
src/lib/email/drivers/smtp.ts
src/lib/crypto/{preflight,encrypted-columns}.ts
src/lib/paths.ts
src/lib/dev-fixtures/index.ts
src/services/internal/server/local-server.ts
src/app/api/storage/[...key]/route.ts
src/instrumentation.ts
scripts/rotate-encryption-key.ts
docker-compose.{ui,dev}.yml
prisma/migrations/{postgres_queue,server_execution_mode}
docs/{self-hosting,server-modes,self-hosting-architecture}.md
```

## Suggested upstream review order

1. **`src/lib/executor/` and the `deploy/engine.ts` diff** — the SSH regression
   risk. Confirm the engine is transport-agnostic and no deployment semantics
   moved.
2. **`src/lib/crypto/{encryption,preflight}.ts`** — the data-loss surface.
   Confirm legacy keys survive and that new installs are gated by a database
   check, not by configuration.
3. **`src/lib/queue/providers/postgres.ts`** — the claim SQL and lease semantics.
4. **`src/services/internal/instance/instance.ts` + auth guards** — the
   registration fix, especially the Google vector and the invitation exception.
5. **`docs/server-modes.md`** — the filesystem contract. If the same-absolute-path
   rule is wrong, local deployments fail silently rather than loudly.
6. `scripts/rotate-encryption-key.ts` — least tested, most destructive.
