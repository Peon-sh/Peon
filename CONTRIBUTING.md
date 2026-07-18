# Contributing to Peon

Thanks for your interest in contributing! Peon is an open-source, self-hostable deployment platform. Contributions of every size are welcome: bug reports, docs fixes, new one-click templates, and features.

## Author

Maintained by **[Hiren Kavad (hironate)](https://github.com/hironate)**.

## Ways to contribute

- **Report bugs**: open an issue with steps to reproduce, expected vs. actual behavior, and logs where relevant.
- **Improve docs**: docs content lives in the marketing site ([Peon-Website](https://github.com/Peon-sh/Peon-Website)); app-facing copy and templates live here.
- **Add one-click templates**: the catalog lives in `src/lib/templates/service-templates.json` (or the shared templates path used by the app).
- **Fix bugs / build features**: check open issues, comment on the one you want to pick up so work is not duplicated.

## Development setup

Requirements: Node.js 20+, pnpm, PostgreSQL, and AWS credentials (SQS at minimum).

```bash
git clone https://github.com/Peon-sh/Peon.git
cd Peon
pnpm install
cp .env.example .env        # set DATABASE_URL, secrets, AWS + SQS queue URLs
pnpm db:migrate
pnpm dev                    # web app on http://localhost:3000
pnpm worker                 # SQS job consumer (scale freely)
pnpm schedule               # cron → enqueue (exactly one instance)
pnpm socket                 # terminal WebSocket
```

Leave `SQS_ENDPOINT` empty to use real AWS SQS. To exercise real deployments you need a Linux server (a cheap VPS or a local VM) reachable over SSH; connect it from the Servers page.

## Project layout

- `src/app` — Next.js App Router: `(app)` dashboard, `(auth)` login/register, `api` REST routes
- `src/services/internal` — server-side domain modules (deploy engine, backups, servers, services)
- `src/services/api` — typed client wrappers used by the dashboard
- `src/lib` — shared utilities: docker helpers, ssh, templates
- `prisma` — schema and migrations
- `worker` — SQS consumer (`pnpm worker`), cron (`pnpm schedule`), terminal socket (`pnpm socket`)

Architecture deep-dive, layer rules, and improvement roadmap: [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md). Permissions model: [docs/PERMISSIONS.md](./docs/PERMISSIONS.md). Service kind invariants: [docs/SERVICE_KIND_INVARIANTS.md](./docs/SERVICE_KIND_INVARIANTS.md).

## Layer rules (short)

- **`src/app/api`** — thin adapters: authz + zod + call domain.
- **`src/services/internal`** — domain + Prisma + enqueue (RBAC-aware).
- **`src/lib`** — pure/IO helpers (no workspace authz / product workflows).
- Prefer `*Service` naming for new exports (`ServiceService` aliases `ServiceModule`).

## Branching

- Branch from `staging` (or `main` if that is the active integration branch for your fork).
- Use prefixes: `feature/`, `bugfix/`, `hotfix/`, `chore/`, `docs/`.
- Open PRs against `staging` unless maintainers ask otherwise.

## Pull request guidelines

1. Fork and create a focused feature branch.
2. Keep PRs small; they review and merge faster.
3. Follow the existing code style; run `pnpm lint` and `pnpm typecheck` before pushing.
4. Add or update tests where it makes sense:
   - `pnpm test` / `pnpm test:unit` — unit tests (mocked Prisma)
   - `pnpm test:integration` — full HTTP API tests against a real Next.js server + Postgres `peon_test` (third parties stubbed via `PEON_E2E=1`)
   - One-time: `CREATE DATABASE peon_test;` then optionally `pnpm test:integration:prepare`
   - Optional env: `.env.test.example`
5. If the change is user-facing, update docs on [Peon-Website](https://github.com/Peon-sh/Peon-Website) when needed.
6. Schema changes must ship a Prisma migration (`pnpm prisma migrate dev --name your_change` or `pnpm db:migrate`).

## Commit messages

Use clear, imperative Conventional Commit style:

- `feat:` new features
- `fix:` bug fixes
- `docs:` documentation
- `refactor:` restructuring without behavior change
- `test:` tests
- `chore:` maintenance

Reference issues with `#123` where applicable.

## Adding a one-click template

Templates are compose-based. Add an entry to the catalog with a base64-encoded compose file, a slogan, tags, and a category. Use `SERVICE_*` magic variables for generated secrets and FQDNs so the template deploys without manual editing. Test the template end-to-end on a real server before opening the PR.

## Releases (maintainers)

```bash
./deploy.sh          # promote staging → main (creates a backup branch)
pnpm release         # tag + GitHub release with AI-generated notes
```

Requires `OPENAI_API_KEY` and authenticated `gh`.

## Code of conduct

Be respectful and constructive. We want contributing to Peon to be a friendly experience for everyone.
