# Peon

Open-source, self-hostable deployment platform. Deploy Git apps, Docker Compose stacks, databases, and static sites to your own servers — Hetzner, DigitalOcean, or bare metal.

Peon is the open alternative to Vercel, Heroku, and managed PaaS: git push to deploy, TLS, backups, logs, and team workspaces on infrastructure you control.

**Website:** [peon.sh](https://peon.sh) · **App:** [app.peon.sh](https://app.peon.sh)

Security reports: see [SECURITY.md](./SECURITY.md).

## Author

**[Hiren Kavad (hironate)](https://github.com/hironate)**

## Features

- Deploy from Git or Docker images to servers you own over SSH
- One-click service templates (databases, compose stacks, and more)
- Workspace / project tenancy with role-based access
- Background worker for deployments, backups, and async tasks
- Self-host with your own Postgres and AWS SQS (SES/S3 optional for email and assets)

## Related repositories

| Repository | Description |
|------------|-------------|
| [Peon-sh/Peon](https://github.com/Peon-sh/Peon) | This app (dashboard, API, worker) |
| [Peon-sh/Peon-Website](https://github.com/Peon-sh/Peon-Website) | Marketing site, docs, blog, marketplace |

## Prerequisites

- Node.js 20+
- [pnpm](https://pnpm.io/)
- PostgreSQL (run your own local container or managed instance)
- AWS credentials with access to SQS (and SES/S3 if you use those features)
- A Linux server reachable over SSH (to exercise real deployments)

## Quick start

```bash
git clone https://github.com/Peon-sh/Peon.git
cd Peon
pnpm install
cp .env.example .env   # set DATABASE_URL, JWT_SECRET, ENCRYPTION_KEY, AWS + SQS URLs

pnpm db:migrate
pnpm dev               # http://localhost:3000
pnpm worker            # SQS job consumer (scale freely)
pnpm schedule          # cron → enqueue (exactly one instance)
pnpm socket            # terminal WebSocket
```

Leave `SQS_ENDPOINT` empty so the app talks to real AWS SQS. See `.env.example` for the full list of environment variables.

### Optional Docker Compose

Compose is optional and not used for day-to-day local development. Profiles:

```bash
docker compose --profile db up -d      # Postgres only, if you want it
docker compose --profile full up -d    # containerized app + worker + schedule + socket
```

## Scripts

| Command | Description |
|---------|-------------|
| `pnpm dev` | Next.js development server |
| `pnpm build` / `pnpm start` | Production build and serve |
| `pnpm worker` | SQS job consumer (deployments, tasks, backups) |
| `pnpm schedule` | Cron scheduler that enqueues jobs (run one instance) |
| `pnpm socket` | Interactive terminal WebSocket server |
| `pnpm db:migrate` | Run Prisma migrations |
| `pnpm db:seed` | Seed the database |
| `pnpm lint` / `pnpm typecheck` / `pnpm test` | Quality checks |
| `pnpm release` | Create a GitHub release (`release.mjs`) |

## Project layout

```
src/app          Next.js App Router (marketing, dashboard, auth, API)
src/services     Domain modules and typed API clients
src/lib          Shared helpers (Docker, SSH, templates, docs)
prisma           Schema and migrations
worker           SQS consumer, cron scheduler, and terminal socket entrypoints
docker           Dockerfile and ElasticMQ config
```

## Branching and deployment

| Branch | Purpose |
|--------|---------|
| `staging` | Integration / pre-production |
| `main` | Production |

### Promote staging → main

```bash
chmod +x ./deploy.sh
./deploy.sh
```

Creates a timestamped backup of `main`, then force-promotes `staging` to `main`.

### Create a release

Requires `OPENAI_API_KEY` in the environment and [GitHub CLI](https://cli.github.com/) (`gh auth login`).

```bash
git checkout main
git pull origin main
pnpm release
```

The script bumps the version (major / minor / patch), generates AI release notes, tags the commit, and publishes a GitHub release.

Typical flow:

```bash
git checkout staging && git pull
./deploy.sh
git checkout main && git pull
pnpm release
```

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for setup details, PR guidelines, and how to add one-click templates.

## License

[MIT](./LICENSE)

