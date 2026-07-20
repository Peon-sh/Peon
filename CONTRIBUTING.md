# Contributing

Hey, thanks for your interest in contributing to Peon! We appreciate your help and taking the time to contribute.

Before you start, please first discuss the feature or bug you want to work on with the owners and community via [GitHub issues](https://github.com/Peon-sh/Peon/issues).

We have a few guidelines to follow when contributing to this project:

- [Commit Convention](#commit-convention)
- [Setup](#setup)
- [Development](#development)
- [Build](#build)
- [Pull Request](#pull-request)
- [Important Considerations](#important-considerations-for-pull-requests)
- [Templates](#templates)
- [Docs & Website](#docs--website)

## Author

Maintained by **[Hiren Kavad (hironate)](https://github.com/hironate)**.

## Commit Convention

Before you create a Pull Request, please make sure your commit message follows the [Conventional Commits](https://www.conventionalcommits.org/) specification.

### Commit Message Format

```
<type>[optional scope]: <description>

[optional body]

[optional footer(s)]
```

### Type

Must be one of the following:

| Type | Description |
|------|-------------|
| `feat` | A new feature |
| `fix` | A bug fix |
| `docs` | Documentation only changes |
| `style` | Changes that do not affect the meaning of the code (white-space, formatting, missing semi-colons, etc.) |
| `refactor` | A code change that neither fixes a bug nor adds a feature |
| `perf` | A code change that improves performance |
| `test` | Adding missing tests or correcting existing tests |
| `build` | Changes that affect the build system or external dependencies |
| `ci` | Changes to our CI configuration files and scripts |
| `chore` | Other changes that don't modify `src` or test files |
| `revert` | Reverts a previous commit |

Example:

```
feat: add rolling deploy health checks
```

## Setup

Before you start, please clone based on the **`staging`** branch when it exists on your fork/remote. `main` should reflect the latest stable release; PRs are merged to `staging` unless maintainers ask otherwise.

We use **Node.js 22** (see `engines` in `package.json`). If you have `nvm` installed:

```bash
nvm install 22 && nvm use
```

```bash
git clone https://github.com/Peon-sh/Peon.git
cd Peon
git checkout staging   # or main if staging is not available yet
pnpm install
cp .env.example .env
```

### Requirements

- Node.js 22.x
- [pnpm](https://pnpm.io/)
- PostgreSQL
- AWS credentials with access to SQS (SES/S3 optional for email and assets)
- A Linux server reachable over SSH (to exercise real deployments)

Fill in at least:

- `DATABASE_URL`
- `JWT_SECRET` (`openssl rand -hex 32`)
- `ENCRYPTION_KEY` (`openssl rand -base64 32`)
- `SQS_DEPLOYMENT_QUEUE_URL` / `SQS_TASKS_QUEUE_URL`
- `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` / `AWS_REGION`

Leave `SQS_ENDPOINT` empty to use real AWS SQS. See `.env.example` for the full list.

Optional local Postgres via Compose:

```bash
docker compose --profile db up -d
```

## Development

```bash
pnpm db:migrate
pnpm dev          # web app → http://localhost:3000
pnpm worker       # SQS job consumer (scale freely)
pnpm schedule     # cron → enqueue (exactly one instance)
pnpm socket       # terminal WebSocket
```

Connect a Linux host from **Servers** in the UI to test real deploys.

### Note

This project uses ESLint and Prettier (`pnpm lint`, `pnpm format`). Keep editor format-on-save aligned with the repo so PRs stay focused.

### Project layout

- `src/app` — Next.js App Router: `(app)` dashboard, `(auth)` login/register, `api` REST routes
- `src/services/internal` — server-side domain modules (deploy engine, backups, servers, services)
- `src/services/api` — typed client wrappers used by the dashboard
- `src/lib` — shared utilities: docker helpers, ssh, templates
- `prisma` — schema and migrations
- `worker` — SQS consumer (`pnpm worker`), cron (`pnpm schedule`), terminal socket (`pnpm socket`)

Architecture deep-dive: [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md). Permissions: [docs/PERMISSIONS.md](./docs/PERMISSIONS.md). Service kind invariants: [docs/SERVICE_KIND_INVARIANTS.md](./docs/SERVICE_KIND_INVARIANTS.md).

### Layer rules (short)

- **`src/app/api`** — thin adapters: authz + zod + call domain.
- **`src/services/internal`** — domain + Prisma + enqueue (RBAC-aware).
- **`src/lib`** — pure/IO helpers (no workspace authz / product workflows).
- Prefer `*Service` naming for new exports.

## Build

```bash
pnpm build
pnpm start
```

Quality checks before opening a PR:

```bash
pnpm lint
pnpm typecheck
pnpm test:unit
```

Integration tests (Postgres `peon_test` + real Next server; third parties stubbed via `PEON_E2E=1`):

```bash
# one-time: CREATE DATABASE peon_test;
pnpm test:integration:prepare   # optional
pnpm test:integration
```

See `.env.test.example` for optional test env overrides.

### Docker

Compose profiles are optional (not required for day-to-day local work):

```bash
docker compose --profile db up -d      # Postgres only
docker compose --profile full up -d    # containerized app + worker + schedule + socket
```

## Pull Request

- The **`staging`** branch is the integration branch; **`main`** should reflect the latest stable release.
- Create a new branch for each feature or bug fix (`feature/`, `bugfix/`, `hotfix/`, `chore/`, `docs/`).
- Add or update tests for your changes.
- Update user-facing docs on [Peon-Website](https://github.com/Peon-sh/Peon-Website) when behavior or UX changes.
- Provide a clear, concise PR description. Screenshots or a short video for UI changes are awesome.
- If your PR fixes an open issue, reference it (e.g. `Fixes #123`).
- Schema changes must include a Prisma migration (`pnpm db:migrate` / `prisma migrate dev --name your_change`).

## Important Considerations for Pull Requests

**Testing is mandatory.** All Pull Requests must be tested by the PR author before submission. Verify your changes in a local development environment (see [Setup](#setup) / [Development](#development)). Untested PRs will be rejected. This keeps history clean and values contributors who submit verified, working code.

**Focus and scope.** Each PR should address a single, well-defined problem or one new feature. That makes review easier and reduces unintended side effects.

**Avoid unfocused changes.** Please avoid PRs that contain only whitespace, IDE formatting, or unused-variable cleanup unless they are part of a clearly defined refactor or a dedicated cleanup issue.

**Issue association.** For any significant change, open an issue first to discuss the approach with maintainers. That avoids duplicated effort. Link related issues in the PR description.

**Large features.** PRs that introduce very large or broad features will not be accepted unless the idea is first outlined in a GitHub issue and aligned with maintainers so the project stays coherent.

Thank you for your contribution!

## Templates

One-click marketplace templates live in this repo:

- Catalog: `src/lib/templates/service-templates.json`
- Logos: `public/svgs/` (path referenced as `svgs/<name>.{svg,png,...}` in the catalog)
- Helpers: `src/lib/templates/index.ts`

Recommendations:

- Use a stable slug as the catalog key (same idea as the folder/`id` in other ecosystems).
- Put the logo under `public/svgs/` and set `logo` accordingly.
- Prefer `SERVICE_*` magic variables for generated secrets and FQDNs so the template deploys without manual editing.
- Test the template end-to-end on a real VPS/server before opening the PR.
- Keep the website catalog in sync when logos or slogans change ([Peon-Website](https://github.com/Peon-sh/Peon-Website) vendored templates + `public/svgs`).

## Docs & Website

Docs, blog, landing, and marketplace UI live in **[Peon-sh/Peon-Website](https://github.com/Peon-sh/Peon-Website)**. See that repository’s [CONTRIBUTING.md](https://github.com/Peon-sh/Peon-Website/blob/main/CONTRIBUTING.md).

## Releases (maintainers)

```bash
./deploy.sh          # promote staging → main (creates a backup branch)
pnpm release         # tag + GitHub release with AI-generated notes
```

Requires `OPENAI_API_KEY` and authenticated `gh` (`gh auth login`).

## Code of conduct

Be respectful and constructive. We want contributing to Peon to be a friendly experience for everyone.
