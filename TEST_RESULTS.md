# Peon Refactor — Test Results

Companion to [TESTING_GUIDE.md](TESTING_GUIDE.md). Every test starts as
`NOT RUN` and is filled in by whoever executes it.

> **Nothing in this branch has been executed.** The implementation environment
> had no `node_modules`, no pnpm, no Docker, no database and no CI access. Every
> row below is `NOT RUN` because it genuinely has not run — not because it was
> forgotten.
>
> **Do not mark a row `PASS` without executing it.** Confusing implemented
> functionality with verified functionality is the specific failure mode this
> file exists to prevent.

## Status values

`NOT RUN` · `PASS` · `FAIL` · `BLOCKED` · `N/A`

## Environment

Fill this in before recording results.

| | |
|---|---|
| Tester | |
| Date | |
| OS / kernel | |
| CPU / RAM / disk | |
| Node version | |
| pnpm version | |
| Docker / Compose version | |
| Postgres version | |
| Commit SHA under test | |
| Remote VPS used (§12) | |
| Clean VM used (§19) | |

## Summary

| Area | Total | Pass | Fail | Blocked | Not run |
|---|---|---|---|---|---|
| §4 Static | 5 | 0 | 0 | 0 | 5 |
| §5 Migrations | 6 | 0 | 0 | 0 | 6 |
| §6 Encryption | 23 | 0 | 0 | 0 | 23 |
| §7 Queue | 16 | 0 | 0 | 0 | 16 |
| §8 SQS compat | 9 | 0 | 0 | 0 | 9 |
| §9 Email | 10 | 0 | 0 | 0 | 10 |
| §10 Storage | 10 | 0 | 0 | 0 | 10 |
| §11 Backups | 9 | 0 | 0 | 0 | 9 |
| §12 SSH regression | 25 | 0 | 0 | 0 | 25 |
| §13 Local server | 20 | 0 | 0 | 0 | 20 |
| §14 Filesystem | 10 | 0 | 0 | 0 | 10 |
| §15 Hybrid | 8 | 0 | 0 | 0 | 8 |
| §16 UI mode | 9 | 0 | 0 | 0 | 9 |
| §17 Dev mode | 8 | 0 | 0 | 0 | 8 |
| §18 Infra mode | 7 | 0 | 0 | 0 | 7 |
| §19 Installer | 15 | 0 | 0 | 0 | 15 |
| §20 Control TLS | 7 | 0 | 0 | 0 | 7 |
| §21 Remote TLS | 3 | 0 | 0 | 0 | 3 |
| §22 Terminal | 6 | 0 | 0 | 0 | 6 |
| §23 Marketplace | 7 | 0 | 0 | 0 | 7 |
| §24 Security | 16 | 0 | 0 | 0 | 16 |
| §25 Upgrade | 9 | 0 | 0 | 0 | 9 |
| §26 Resources | 10 | 0 | 0 | 0 | 10 |
| §27 Failure | 15 | 0 | 0 | 0 | 15 |
| **Total** | **273** | **0** | **0** | **0** | **273** |

---

## Release gate

Do not recommend an upstream PR while any of these are unresolved.

| Gate | Tests | Status |
|---|---|---|
| Existing installations do not regress | §12 all, §25 all, T-SQS-001 | NOT RUN |
| No data loss on upgrade | T-ENC-004, T-ENC-010…015, T-UPG-005 | NOT RUN |
| Queue is correct under concurrency | T-QUEUE-003, 004, 009, 010 | NOT RUN |
| Rotation is safe | T-ENC-020…027, T-ENC-030…032 | NOT RUN |
| Single-server actually deploys | T-LOCAL-005…007, T-INST-015 | NOT RUN |
| Filesystem model holds | §14 all | NOT RUN |
| Static validation clean | §4 all | NOT RUN |

---

## §4 Static validation

| Test | Status | Notes |
|---|---|---|
| T-STATIC-001 `prisma validate` | NOT RUN | |
| T-STATIC-002 `pnpm typecheck` | NOT RUN | Never run in this repo's CI, before or after. Check `staging` for a baseline before blaming this branch. |
| T-STATIC-003 `pnpm test:unit` | NOT RUN | ~100 new cases added by this branch |
| T-STATIC-004 `pnpm lint` | NOT RUN | |
| T-STATIC-005 `docker compose config` (all files) | NOT RUN | |

## §5 Database migrations

| Test | Status | Notes |
|---|---|---|
| T-MIG-001 Fresh migrate deploy | NOT RUN | |
| T-MIG-002 Idempotent re-run | NOT RUN | |
| T-MIG-003 `migrate diff` empty | NOT RUN | **Both new migrations were hand-written, not generated** |
| T-MIG-004 Seed | NOT RUN | |
| T-MIG-005 Restart, no drift | NOT RUN | |
| T-MIG-006 Upgrade an existing DB | NOT RUN | |

## §6 Encryption

| Test | Status | Notes |
|---|---|---|
| T-ENC-001 Fresh + valid key | NOT RUN | |
| T-ENC-002 Fresh + weak key refused | NOT RUN | |
| T-ENC-003 Fresh + placeholder refused | NOT RUN | |
| T-ENC-004 Existing + legacy key **starts** | NOT RUN | **Blocks release if this fails** |
| T-ENC-005 Existing + placeholder starts | NOT RUN | |
| T-ENC-006 DB unreachable → warn not refuse | NOT RUN | |
| T-ENC-010 Legacy SSH key decrypts | NOT RUN | |
| T-ENC-011 Legacy env vars decrypt | NOT RUN | |
| T-ENC-012 Legacy DB password decrypts | NOT RUN | |
| T-ENC-013 Legacy S3 creds decrypt | NOT RUN | |
| T-ENC-014 Legacy LLM key decrypts | NOT RUN | |
| T-ENC-015 Deploy using legacy secrets | NOT RUN | |
| T-ENC-020 Dual-key startup | NOT RUN | |
| T-ENC-021 Dry-run reports | NOT RUN | |
| T-ENC-022 Dry-run writes nothing | NOT RUN | |
| T-ENC-023 Real rotation | NOT RUN | |
| T-ENC-024 Rotation idempotent | NOT RUN | |
| T-ENC-025 Previous key removed | NOT RUN | |
| T-ENC-026 Corrupt ciphertext fails safely | NOT RUN | |
| T-ENC-027 Interrupted rotation resumes | NOT RUN | |
| T-ENC-030 Manifest matches schema | NOT RUN | Hand-assembled; a wrong-but-valid name silently skips a table |
| T-ENC-031 All models rotate | NOT RUN | |
| T-ENC-032 Notification JSON rotates | NOT RUN | |

## §7 Postgres queue

| Test | Status | Notes |
|---|---|---|
| T-QUEUE-001 Enqueue | NOT RUN | |
| T-QUEUE-002 Single claim | NOT RUN | |
| T-QUEUE-003 Two workers, one job | NOT RUN | **SKIP LOCKED correctness** |
| T-QUEUE-004 Two workers, 100 jobs | NOT RUN | |
| T-QUEUE-005 Success → COMPLETED | NOT RUN | |
| T-QUEUE-006 Failure → retry | NOT RUN | |
| T-QUEUE-007 Backoff grows | NOT RUN | |
| T-QUEUE-008 maxAttempts → FAILED | NOT RUN | |
| T-QUEUE-009 Worker killed | NOT RUN | |
| T-QUEUE-010 Lease expiry reclaim | NOT RUN | **"never PROCESSING forever"** |
| T-QUEUE-011 Malformed payload | NOT RUN | |
| T-QUEUE-012 NotFoundError dropped | NOT RUN | |
| T-QUEUE-013 Queue routing | NOT RUN | |
| T-QUEUE-014 Graceful shutdown | NOT RUN | |
| T-QUEUE-015 Future visibleAt | NOT RUN | |
| T-QUEUE-016 EXPLAIN uses the index | NOT RUN | |

## §8 SQS compatibility

| Test | Status | Notes |
|---|---|---|
| T-SQS-001 Auto-resolves to sqs | NOT RUN | **Backwards-compatibility guarantee** |
| T-SQS-002 Startup log names driver | NOT RUN | |
| T-SQS-003 Deployment | NOT RUN | |
| T-SQS-004 Scheduled task | NOT RUN | |
| T-SQS-005 Backup | NOT RUN | |
| T-SQS-006 Email | NOT RUN | |
| T-SQS-007 Redelivery on failure | NOT RUN | |
| T-SQS-008 NotFoundError deleted | NOT RUN | |
| T-SQS-009 Explicit postgres override | NOT RUN | |

## §9 Email

| Test | Status | Notes |
|---|---|---|
| T-MAIL-001 test driver | NOT RUN | |
| T-MAIL-002 SMTP signup OTP | NOT RUN | **Core AWS-independence claim** |
| T-MAIL-003 SMTP password reset | NOT RUN | |
| T-MAIL-004 SMTP invitation | NOT RUN | |
| T-MAIL-005 SMTP notification | NOT RUN | |
| T-MAIL-006 Port 465 implicit TLS | NOT RUN | |
| T-MAIL-007 Port 587 STARTTLS | NOT RUN | |
| T-MAIL-008 Bad credentials | NOT RUN | |
| T-MAIL-009 SMTP_HOST unset | NOT RUN | |
| T-MAIL-010 SES unchanged | NOT RUN | |

## §10 Storage

| Test | Status | Notes |
|---|---|---|
| T-STORE-001 Local avatar | NOT RUN | |
| T-STORE-002 Local screenshot | NOT RUN | |
| T-STORE-003 Session required | NOT RUN | |
| T-STORE-004 Path traversal refused | NOT RUN | |
| T-STORE-005 Delete | NOT RUN | |
| T-STORE-006 S3 unchanged | NOT RUN | |
| T-STORE-007 MinIO endpoint | NOT RUN | |
| T-STORE-008 Auto-detect s3 | NOT RUN | |
| T-STORE-009 Auto-detect local | NOT RUN | |
| T-STORE-010 Bad credentials | NOT RUN | |

## §11 Streaming backups

| Test | Status | Notes |
|---|---|---|
| T-BACK-001 Small backup | NOT RUN | |
| T-BACK-002 ≥2 GB backup | NOT RUN | **OOM fix** |
| T-BACK-003 Peak RSS bounded | NOT RUN | If RSS tracks dump size the fix failed |
| T-BACK-004 Restore | NOT RUN | |
| T-BACK-005 Temp cleanup on success | NOT RUN | |
| T-BACK-006 SFTP interrupted | NOT RUN | |
| T-BACK-007 Upload interrupted | NOT RUN | |
| T-BACK-008 Disk full | NOT RUN | |
| T-BACK-009 No S3 configured | NOT RUN | |

## §12 SSH regression

| Test | Status | Notes |
|---|---|---|
| T-SSH-001 Validate/connect | NOT RUN | |
| T-SSH-002 Docker detection | NOT RUN | |
| T-SSH-003 Docker install | NOT RUN | |
| T-SSH-004 Host-key TOFU | NOT RUN | |
| T-SSH-005 Host-key mismatch rejected | NOT RUN | |
| T-SSH-006 Pinned fingerprint | NOT RUN | |
| T-SSH-007 Start proxy | NOT RUN | |
| T-SSH-008 Git app deploy | NOT RUN | |
| T-SSH-009 Dockerfile deploy | NOT RUN | |
| T-SSH-010 Docker image deploy | NOT RUN | |
| T-SSH-011 Compose deploy | NOT RUN | |
| T-SSH-012 Database deploy | NOT RUN | |
| T-SSH-013 Start/stop/restart | NOT RUN | |
| T-SSH-014 Logs | NOT RUN | |
| T-SSH-015 Scheduled task | NOT RUN | |
| T-SSH-016 Backup and restore | NOT RUN | |
| T-SSH-017 Cleanup | NOT RUN | |
| T-SSH-018 Terminal | NOT RUN | |
| T-SSH-019 Cancel mid-build | NOT RUN | **Most disturbed logic** |
| T-SSH-020 Rollback | NOT RUN | |
| T-SSH-021 Rolling update | NOT RUN | **Most disturbed logic** |
| T-SSH-022 Preview create/teardown | NOT RUN | |
| T-SSH-023 Image retention | NOT RUN | |
| T-SSH-024 Failure shows logs | NOT RUN | |
| T-SSH-025 IP change drops session | NOT RUN | |

## §13 Local server

| Test | Status | Notes |
|---|---|---|
| T-LOCAL-001 Local server auto-exists | NOT RUN | |
| T-LOCAL-002 No SSH key required | NOT RUN | |
| T-LOCAL-003 Validate against local Docker | NOT RUN | |
| T-LOCAL-004 concurrentBuilds = 1 | NOT RUN | |
| T-LOCAL-005 Git app deploy | NOT RUN | **Core single-server claim** |
| T-LOCAL-006 Build on host daemon | NOT RUN | |
| T-LOCAL-007 Health check → FINISHED | NOT RUN | |
| T-LOCAL-008 Logs | NOT RUN | |
| T-LOCAL-009 Stop/start/restart | NOT RUN | |
| T-LOCAL-010 Redeploy | NOT RUN | |
| T-LOCAL-011 Rolling update | NOT RUN | |
| T-LOCAL-012 Database service | NOT RUN | |
| T-LOCAL-013 Compose stack | NOT RUN | |
| T-LOCAL-014 Domain routing | NOT RUN | |
| T-LOCAL-015 Backup | NOT RUN | |
| T-LOCAL-016 Scheduled task | NOT RUN | |
| T-LOCAL-017 Cleanup | NOT RUN | |
| T-LOCAL-018 Cancel deployment | NOT RUN | |
| T-LOCAL-019 Service terminal | NOT RUN | |
| T-LOCAL-020 Web container has no socket | NOT RUN | |

## §14 Filesystem / PEON_DATA_DIR

| Test | Status | Notes |
|---|---|---|
| T-FS-001 Same absolute path | NOT RUN | **Silent failure mode** |
| T-FS-002 Compose file location | NOT RUN | |
| T-FS-003 Git checkout path | NOT RUN | |
| T-FS-004 Build context | NOT RUN | |
| T-FS-005 .env read by compose | NOT RUN | |
| T-FS-006 Bind mount contents | NOT RUN | |
| T-FS-007 Named volumes | NOT RUN | |
| T-FS-008 Backup path | NOT RUN | |
| T-FS-009 Custom PEON_DATA_DIR | NOT RUN | |
| T-FS-010 Preview isolation | NOT RUN | |

## §15 Hybrid

| Test | Status | Notes |
|---|---|---|
| T-HYB-001 Three servers registered | NOT RUN | |
| T-HYB-002 Mixed targets assigned | NOT RUN | |
| T-HYB-003 All deploy | NOT RUN | |
| T-HYB-004 Simultaneous local + remote | NOT RUN | |
| T-HYB-005 Per-server concurrency | NOT RUN | |
| T-HYB-006 Logs/terminal correct server | NOT RUN | |
| T-HYB-007 Move between servers | NOT RUN | |
| T-HYB-008 Delete local, remote unaffected | NOT RUN | |

## §16 UI-only mode

| Test | Status | Notes |
|---|---|---|
| T-UI-001 Starts single process | NOT RUN | |
| T-UI-002 No DB/worker/AWS | NOT RUN | |
| T-UI-003 Screens navigable | NOT RUN | |
| T-UI-004 All UI states reachable | NOT RUN | |
| T-UI-005 Hot reload | NOT RUN | |
| T-UI-006 No Chromium | NOT RUN | |
| T-UI-007 Cannot activate in production | NOT RUN | **Security check** |
| T-UI-008 No UI_MODE in components | NOT RUN | |
| T-UI-009 Idle RAM measured | NOT RUN | |

## §17 Lightweight development

| Test | Status | Notes |
|---|---|---|
| T-DEV-001 Three services only | NOT RUN | |
| T-DEV-002 No heavy extras | NOT RUN | |
| T-DEV-003 Auth | NOT RUN | |
| T-DEV-004 CRUD | NOT RUN | |
| T-DEV-005 Queue processes a job | NOT RUN | |
| T-DEV-006 Hot reload | NOT RUN | |
| T-DEV-007 Measured idle RAM | NOT RUN | |
| T-DEV-008 No AWS needed | NOT RUN | |

## §18 Infrastructure mode

| Test | Status | Notes |
|---|---|---|
| T-INFRA-001 Stack starts | NOT RUN | |
| T-INFRA-002 Scheduler + socket | NOT RUN | |
| T-INFRA-003 Mailpit | NOT RUN | |
| T-INFRA-004 S3 emulator | NOT RUN | |
| T-INFRA-005 SSH test target | NOT RUN | |
| T-INFRA-006 concurrentBuilds = 1 | NOT RUN | |
| T-INFRA-007 RAM measured | NOT RUN | |

## §19 Installer

| Test | Status | Notes |
|---|---|---|
| T-INST-001 Clean VM install | NOT RUN | |
| T-INST-002 Docker absent | NOT RUN | |
| T-INST-003 Docker present | NOT RUN | |
| T-INST-004 Secrets generated | NOT RUN | |
| T-INST-005 Migrations automatic | NOT RUN | |
| T-INST-006 Postgres queue default | NOT RUN | |
| T-INST-007 Local storage | NOT RUN | |
| T-INST-008 Local server registered | NOT RUN | |
| T-INST-009 Dashboard reachable | NOT RUN | |
| T-INST-010 Admin without email | NOT RUN | |
| T-INST-011 Bootstrap token single-use | NOT RUN | |
| T-INST-012 Idempotent re-run | NOT RUN | |
| T-INST-013 Survives reboot | NOT RUN | |
| T-INST-014 Preflight refusal | NOT RUN | |
| T-INST-015 Deploy immediately after install | NOT RUN | **The product claim** |

## §20–21 TLS

| Test | Status | Notes |
|---|---|---|
| T-TLS-001 Control plane HTTPS | NOT RUN | |
| T-TLS-002 App domain HTTPS | NOT RUN | |
| T-TLS-003 One owner of 80/443 | NOT RUN | |
| T-TLS-004 ACME issuance | NOT RUN | |
| T-TLS-005 Renewal configured | NOT RUN | |
| T-TLS-006 Proxy restart safe | NOT RUN | |
| T-TLS-007 No port conflict | NOT RUN | |
| T-RTLS-001 Remote Traefik | NOT RUN | |
| T-RTLS-002 Remote Caddy | NOT RUN | |
| T-RTLS-003 Certificates issue | NOT RUN | |

## §22 Terminal

| Test | Status | Notes |
|---|---|---|
| T-TERM-001 Remote server | NOT RUN | |
| T-TERM-002 Remote service | NOT RUN | |
| T-TERM-003 Local service | NOT RUN | |
| T-TERM-004 Local host | NOT RUN | See VD-026 |
| T-TERM-005 No null target dialled | NOT RUN | |
| T-TERM-006 Session timeout | NOT RUN | |

## §23 Marketplace

| Test | Status | Notes |
|---|---|---|
| T-TMPL-001 Simple app remote | NOT RUN | |
| T-TMPL-002 Simple app local | NOT RUN | |
| T-TMPL-003 Database-backed | NOT RUN | |
| T-TMPL-004 Volumes | NOT RUN | |
| T-TMPL-005 Magic env | NOT RUN | |
| T-TMPL-006 Credentials encrypted | NOT RUN | |
| T-TMPL-007 Domains | NOT RUN | |

## §24 Security

| Test | Status | Notes |
|---|---|---|
| T-SEC-001 Registration disabled → 403 | NOT RUN | |
| T-SEC-002 Invited address allowed | NOT RUN | |
| T-SEC-003 First user allowed | NOT RUN | |
| T-SEC-004 Google respects the setting | NOT RUN | **Second bypass vector** |
| T-SEC-005 Workspace isolation | NOT RUN | |
| T-SEC-006 Project isolation | NOT RUN | |
| T-SEC-007 MCP scoping | NOT RUN | |
| T-SEC-008 Chat approval | NOT RUN | |
| T-SEC-009 Secret masking | NOT RUN | |
| T-SEC-010 Session revocation | NOT RUN | |
| T-SEC-011 Git ref validation | NOT RUN | |
| T-SEC-012 Host-key verification | NOT RUN | |
| T-SEC-013 Web container has no socket | NOT RUN | |
| T-SEC-014 Local execution RBAC | NOT RUN | |
| T-SEC-015 Storage requires session | NOT RUN | |
| T-SEC-016 Storage traversal refused | NOT RUN | |

## §25 Upgrade

| Test | Status | Notes |
|---|---|---|
| T-UPG-001 SQS preserved | NOT RUN | |
| T-UPG-002 S3 preserved | NOT RUN | |
| T-UPG-003 Servers become REMOTE | NOT RUN | |
| T-UPG-004 Existing services deploy | NOT RUN | |
| T-UPG-005 Legacy key works | NOT RUN | **Data loss if this fails** |
| T-UPG-006 Sessions valid | NOT RUN | |
| T-UPG-007 Migrations safe | NOT RUN | |
| T-UPG-008 Tasks and backups run | NOT RUN | |
| T-UPG-009 Notifications fire | NOT RUN | |

## §26 Resources — measured values

Replace estimates in TESTING_GUIDE §1 and `docs/development.md` once filled.

| Test | Measured | Notes |
|---|---|---|
| T-RES-001 Web idle RSS | NOT RUN | |
| T-RES-002 Worker idle RSS | NOT RUN | |
| T-RES-003 Postgres idle RSS | NOT RUN | |
| T-RES-004 UI mode total | NOT RUN | |
| T-RES-005 Dev mode total | NOT RUN | |
| T-RES-006 Single-server total | NOT RUN | |
| T-RES-007 Infra mode total | NOT RUN | |
| T-RES-008 `next build` peak | NOT RUN | |
| T-RES-009 Backup peak | NOT RUN | |
| T-RES-010 Local build peak | NOT RUN | |

## §27 Failure handling

| Test | Status | Notes |
|---|---|---|
| T-FAIL-001 Postgres down | NOT RUN | |
| T-FAIL-002 Docker down | NOT RUN | |
| T-FAIL-003 SQS unreachable | NOT RUN | |
| T-FAIL-004 SMTP unreachable | NOT RUN | |
| T-FAIL-005 Storage unavailable | NOT RUN | |
| T-FAIL-006 SSH unreachable | NOT RUN | |
| T-FAIL-007 Disk full | NOT RUN | |
| T-FAIL-008 Wrong encryption key | NOT RUN | |
| T-FAIL-009 Bad git repo | NOT RUN | |
| T-FAIL-010 Build failure | NOT RUN | |
| T-FAIL-011 Health check failure | NOT RUN | |
| T-FAIL-012 Cancel deployment | NOT RUN | |
| T-FAIL-013 Worker killed | NOT RUN | |
| T-FAIL-014 Worker restart | NOT RUN | |
| T-FAIL-015 Corrupt payload | NOT RUN | |

---

## Defects found

Record anything that fails here, and add it to `VALIDATION_DEBT.md` as `FAILED`.

| ID | Test | Severity | Description | Fixed |
|---|---|---|---|---|
| | | | | |
