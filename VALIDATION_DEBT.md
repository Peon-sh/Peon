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

## Rules for this file

1. Never delete an entry. Mark it `VERIFIED` (with evidence) or `FAILED`.
2. New debt is appended with the next free ID; IDs are not reused.
3. `CRITICAL` and `HIGH` must all be closed before release.
4. `MEDIUM`/`LOW` may remain open only with an explicit written justification.
5. A phase may ship as `CODE COMPLETE / VALIDATION PENDING`. No phase is ever
   described as `FULLY VERIFIED` while it carries open debt.
