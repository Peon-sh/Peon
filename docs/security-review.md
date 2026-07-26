# Security review — standalone refactor

Static review of everything this branch adds. **No runtime testing was performed**;
findings marked *unverified* need the corresponding section of
[TESTING_GUIDE.md](../TESTING_GUIDE.md).

Method: read every new module, trace call sites, check trust boundaries against
`.cursor/rules/pr-review-peon-attack-surface.mdc`, and sweep the repository for
stale assumptions.

## Summary

| Area | Finding |
|---|---|
| Local execution authorization | No new privilege path — same RBAC as remote |
| Docker socket exposure | Worker only; asserted in CI |
| Server targeting | Unchanged; workspace scoping still enforced |
| Queue payload forgery | **Trust boundary unchanged but now DB-backed — see below** |
| Path traversal | Guarded in storage; deployment paths derive from cuids |
| Installer | Reviewed; three rough edges recorded, none exploitable |
| Bootstrap token | Hashed, expiring, single-use, replay-guarded |
| Encryption rotation | Never overwrites undecryptable ciphertext |
| SMTP | Header injection not reachable from user input |
| TLS / proxy | Host rules come from configuration, not user data |

Two defects were found and fixed during the review; both are noted in place.

---

## 1. Local execution

**Question: can an unauthorized user cause host-level command execution?**

Local execution runs commands on the control-plane host, so the authorization
question is sharper than for remote servers.

Findings:

- A deployment always resolves its executor from `Server.executionMode`
  (`executorForServer`), and reaching a `Server` requires passing the same
  workspace checks as before. There is no code path that selects the local
  executor from user input.
- `ServiceModule.deploy` is gated by `requireProjectManage`, unchanged.
- MCP and chat tools go through `createMcpAccess`, which additionally asserts the
  resource belongs to the token's workspace. Unchanged by this branch.
- The engine builds the same command strings for both transports, and
  user-controlled fragments are quoted by `lib/shell/quote.ts` before reaching
  either. `LocalServerExecutor` executes via `/bin/sh -c`, exactly as the SSH
  transport does on the remote side — the quoting requirement is identical.

**Conclusion:** local execution grants no new authority to any user who could not
already run commands on a remote server in the same workspace. What *does* change
is the blast radius: those commands now run on the Peon host. That is inherent to
single-server mode and is documented in `docs/server-modes.md`.

**Unverified:** T-SEC-014.

## 2. Docker socket

Access to `/var/run/docker.sock` is equivalent to root on the host.

- Only the worker receives it. A CI job parses every `docker-compose*.yml` as
  JSON and fails if `app`, `web` or `migrate` mounts it.
- Never exposed over TCP.
- The `sshd` container in `docker-compose.infrastructure.yml` also receives it —
  deliberately, because it is a *deployment target* standing in for a managed
  server. Development-only file.

**Position on socket proxies:** documented in `docs/server-modes.md` and worth
restating. Peon legitimately needs container create, image build, exec and volume
management. That set already suffices to take over the host, so an allow-listing
proxy limits *accidental* API surface, not a compromised worker. Describing one
as a security boundary would be dishonest.

## 3. Queue payloads

The Postgres queue stores job payloads as JSONB rows the application writes
itself. The trust boundary is unchanged from SQS: the queue was never
attacker-writable, and jobs carry ids that handlers re-resolve and re-authorize
against the database.

Worth noting for a future reviewer: **handlers trust the ids in a payload.** That
was equally true with SQS, so it is not a regression, but anyone who later exposes
queue writes to less-trusted input must revisit it.

`receiveMessages` rejects malformed payloads terminally rather than looping.

**Unverified:** T-QUEUE-011.

## 4. Path handling

**Storage.** `resolveObjectPath` normalizes the key, strips leading traversal
segments, joins against the root, then verifies with `path.relative` that the
result is still inside the root — refusing otherwise. Covers `../`, absolute
paths and encoded variants. Unit-tested, unexecuted.

**Symlinks are not resolved.** A symlink already inside the storage root could
point outside it. Keys are server-generated (cuids, uuids) and the directory is
mode 700, so this needs prior write access to exploit — noted rather than fixed.

**Deployment paths** derive from `servicesBaseDir()` plus a service uuid, never
from user input.

**Deletion boundaries.** `teardownService` runs `rm -rf` on a path built from
`serviceDir()`, which is `PEON_DATA_DIR/services/<uuid>` with the uuid
shell-quoted. Under local execution this now deletes on the control-plane host,
so the quoting matters more than it did — it is present.

**Fixed during this review:** `backup/engine.ts` retained a hardcoded
`/data/peon/backups` in its retention script, so with a custom `PEON_DATA_DIR`
the retention `rm` would have targeted the wrong directory. Now uses
`backupsDir()`.

**Unverified:** T-STORE-004, T-FS-009.

## 5. Installer

`install.sh` runs as root and is the highest-blast-radius addition.

Reviewed:

- `set -euo pipefail`; all expansions quoted; no `eval`; no user input
  interpolated into commands.
- `.env` written under `umask 077` and `chmod 600`, so secrets are never briefly
  world-readable.
- Secrets from `openssl rand`, never from `$RANDOM` or a timestamp.
- `$PEON_DATA_DIR` created mode 700.
- **An existing `.env` is never regenerated** — a fresh `ENCRYPTION_KEY` would
  make an existing installation's data unreadable. This is the single most
  important idempotency property in the script.
- Docker install uses the official `get.docker.com` script over HTTPS.

**Curl-piped-to-bash** is the distribution model asked for. It is the industry
norm and is what Docker itself does, but it does mean trusting the host serving
the script. Documented; the alternative (download, inspect, run) is always
available and should be mentioned in the install docs.

Rough edges, none exploitable: busy ports warn rather than fail (an existing Peon
legitimately holds them); `docker compose build` is slow and silent on a small
VPS; `hostname -I` is Linux-specific.

**Unverified:** §19 entirely.

## 6. Bootstrap token

- 32 bytes from `randomBytes`, base64url.
- Only the SHA-256 hash is stored; the plaintext is printed once and is not
  recoverable, so a database leak yields nothing usable.
- 24-hour expiry.
- Single use, consumed by a conditional `updateMany` so two concurrent requests
  cannot both succeed.
- **Refused outright once any user exists**, so a leaked or logged token cannot
  mint a second administrator on a live instance. This is the property that
  matters most.
- Comparison is constant-time.
- No default credentials ship anywhere.

**Residual risk:** the token appears in the installer's stdout and therefore
possibly in terminal scrollback or CI logs. Mitigated by the expiry and the
user-exists guard.

**Unverified:** T-INST-011, VD-037 (concurrency against a real database).

## 7. Provider configuration

- LLM keys, S3 credentials, SMTP passwords and agent tokens all continue through
  `encrypt()`.
- `SMTP_PASSWORD` is read from the environment, never persisted.
- MCP secret-write tools still declare `redactInputKeys`, so values are masked in
  `ChatToolCall` rows.
- The new `/api/storage` route returns bytes only, never configuration.

## 8. Encryption rotation

The dangerous operation. Reviewed specifically for data destruction:

- A value that decrypts under **neither** key is counted as failed and **left
  untouched** — never overwritten with a re-encryption of garbage.
- Any failure sets a non-zero exit and tells the operator not to remove
  `ENCRYPTION_KEY_PREVIOUS`.
- `--dry-run` performs no writes.
- Idempotent: rows already on the current key are skipped, so an interrupted run
  is safe to repeat.
- Rotation writes per row, so a crash leaves a partially rotated table — which
  the dual-key fallback reads correctly.

**Residual risk:** a wrong-but-valid model name in `ENCRYPTED_TARGETS` silently
skips a table (VD-008). The script warns on *unknown* models but cannot detect a
plausible typo.

**Unverified:** §6.3, and this remains the highest-risk unexecuted code.

## 9. SMTP

Recipients come from database records, not request bodies. Subjects and bodies
come from templates. Nodemailer encodes headers, and no code path concatenates
user input into a raw header. Header injection is not reachable.

`SMTP_TLS_REJECT_UNAUTHORIZED=false` exists for self-signed certificates on a
trusted network and is documented as such.

## 10. TLS and proxy

Host rules in `docker-compose.gateway.yml` come from
`PEON_CONTROL_PLANE_DOMAIN`, operator configuration rather than user data.
Service domains flow through the existing `generateProxyLabels`, unchanged.

Port 80 stays open for ACME and serves only the challenge and a redirect.

## 11. Preserved guarantees

Re-verified as untouched by this branch: session revocation via `sid`, workspace
and project RBAC, MCP workspace scoping, chat approval for mutating tools,
secrets encrypted at rest, git-ref validation, deployment cancellation via
conditional writes, GitHub webhook HMAC, timing-safe agent token comparison, and
SSH host-key verification with TOFU and pinning.

The registration-enforcement defect found in the audit is fixed, including the
Google auto-provisioning vector.

## Findings requiring runtime proof

| Finding | Test |
|---|---|
| Local execution grants no new authority | T-SEC-014 |
| Web tier never reaches Docker | T-SEC-013, T-LOCAL-020 |
| Storage path traversal refused | T-STORE-004 |
| Bootstrap token single-use under concurrency | VD-037 |
| Rotation never destroys undecryptable data | T-ENC-026 |
| Installer idempotency | T-INST-012 |
| Registration enforcement, both vectors | T-SEC-001…004 |
