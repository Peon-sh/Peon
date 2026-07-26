# Self-hosting Peon

> Work in progress. This document currently covers the encryption key, which has
> upgrade implications. Installation, providers and modes are added in later
> phases of the standalone refactor — see [CHECKLIST.md](../CHECKLIST.md).

## The encryption key

Peon encrypts secrets at the application layer with AES-256-GCM before writing
them to Postgres: SSH private keys, database passwords, environment variable
values, S3 credentials, GitHub/GitLab app secrets, LLM API keys and more (17
columns across 13 tables — see `src/lib/crypto/encrypted-columns.ts`).

`ENCRYPTION_KEY` is the master key for all of it.

```bash
openssl rand -base64 32
```

**Set it once, before creating any data, and keep a backup.** Losing it means
losing every stored secret; changing it without rotating means the same.

### Key modes

| Mode | When | Status |
|---|---|---|
| **strict** | The value decodes to exactly 32 bytes | Correct — use this |
| **legacy-derived** | Anything else; SHA-256'd into a key | Deprecated, still supported |

Early versions accepted any string and silently derived a key from it, so
installations exist whose data is encrypted under `sha256("whatever-was-typed")`.
That data is still readable and always will be — legacy mode is permanent
compatibility, not a grace period.

### What happens on startup

Checked by `src/lib/crypto/preflight.ts` when the web app and worker start:

| Key | Fresh database | Existing database |
|---|---|---|
| strict | starts | starts |
| legacy or placeholder | **refuses to start** | starts, with a deprecation warning |

A *fresh* database is one with zero users. The asymmetry is deliberate: a new
installation should be forced to start correct, while an existing one must never
be bricked by an upgrade.

If the database is unreachable or unmigrated, Peon assumes an existing
installation and warns rather than refusing — a transient database problem must
not turn into a boot failure.

### Upgrading an existing installation

**Nothing is required.** If you are already running Peon with an arbitrary
`ENCRYPTION_KEY`, upgrading keeps working. You will see a deprecation banner in
the logs on every start. Your data stays readable.

Do **not** "fix" the warning by generating a new key and restarting. That makes
every stored secret undecryptable. Rotate instead.

### Rotating the encryption key

Rotation re-encrypts existing data under a new key. Peon reads with both keys
during the transition, so there is no downtime.

**1. Back up your database first.** This rewrites every encrypted column.

**2. Put the old key in `ENCRYPTION_KEY_PREVIOUS` and generate a new one:**

```bash
ENCRYPTION_KEY_PREVIOUS=<your current ENCRYPTION_KEY>
ENCRYPTION_KEY=$(openssl rand -base64 32)
```

Restart Peon. Decryption tries the current key, then falls back to the previous
one, so everything keeps working while rows are still on the old key.

**3. Preview the rotation:**

```bash
pnpm encryption:rotate --dry-run
```

Reports per table: scanned, would-rotate, already-current, failed. **If anything
fails, stop** — do not remove the previous key; investigate first.

**4. Rotate:**

```bash
pnpm encryption:rotate
```

Idempotent and re-runnable: rows already readable under the current key are
skipped, so an interrupted run is safe to repeat.

**5. Confirm and clean up:**

```bash
pnpm encryption:rotate   # should report rotated=0, failed=0
```

Then remove `ENCRYPTION_KEY_PREVIOUS` and restart. Keep the old key value in
your own backups until you are confident.

### If you added an encrypted column

Add it to `ENCRYPTED_TARGETS` in `src/lib/crypto/encrypted-columns.ts`. A column
missing from that list silently survives rotation still encrypted under the old
key, and becomes unreadable the moment `ENCRYPTION_KEY_PREVIOUS` is removed.

### JWT_SECRET is different

`JWT_SECRET` signs session tokens. Rotating it only invalidates sessions —
everyone re-logs-in, no data is lost. Because the cost is bounded, production
*does* hard-fail on the `.env.example` placeholder for `JWT_SECRET`, while
`ENCRYPTION_KEY` only warns.
