# Peon user manual

How-to guide for the Peon dashboard. Chat uses this file via the `lookup_user_manual` tool when you ask how to do something in the UI.

**Conventions:** Each major topic is a `##` heading. Prefer exact sidebar labels and tab names. Roles are workspace roles unless noted as project roles.

---

## Front matter

### What Peon is

Peon is a self-hostable / cloud-hosted deployment platform. You connect your own Linux servers over SSH; Peon installs Docker and a reverse proxy, then deploys your apps and databases onto those servers.

Hierarchy:

1. **Workspace** — top-level tenant (members, servers, sources, storages, notifications, LLM keys, billing context).
2. **Project** — group of services (one product or client).
3. **Service** — deployable unit (git app, image, compose, static site, or database).
4. **Server** — Linux host managed over SSH.

### Cloud vs self-hosted

- **Peon Cloud:** control plane is hosted; apps still run on *your* servers.
- **Self-hosted:** you run the Peon control plane yourself on your own infrastructure.

### How Chat uses this manual

Ask Chat questions like “How do I add a domain?” Chat calls `lookup_user_manual` to pull matching sections, then answers with steps. Shell/terminal commands are **not** available via Chat or MCP — use the **Terminal** tab in the UI.

---

## Getting started

### Register and login

**Where:** `/login`, `/register`

- **Email + password:** register (if registration is enabled on the instance), then sign in.
- **Google:** available when the instance has Google sign-in configured.
- Links: Forgot password → `/forgot-password`; after email, Reset password → `/reset-password`.

**Who:** anyone with registration enabled (or an invite).

**Common errors:** Registration disabled → ask a workspace OWNER/ADMIN or the person who runs your Peon installation. Google button missing → Google sign-in is not enabled for this installation.

### Accept an invitation

**Where:** `/invitations/[token]` (link from email)

1. Open the invite link while signed in (or sign up / log in first).
2. Review workspace (and optional project) + role.
3. Accept to join.

**Who:** invitee. Invites are created by workspace OWNER/ADMIN under **Settings → Members**.

### Onboarding

**Where:** `/onboarding` (first-time users)

1. Name your workspace.
2. Optionally create a first project.
3. Finish → Dashboard.

### Dashboard

**Where:** Sidebar → **Dashboard** (`/dashboard`)

- Stat cards: Projects, Services, Servers, SSH Keys (some link into list pages).
- **Projects** panel lists recent projects or an empty state.
- **Get started** quick links: Connect a server, Add a git source, Configure storage, Add an SSH key.

### App shell

- **Sidebar:** Overview (Dashboard, Chat, Projects) and Workspace settings (Servers, Storages, Keys & Tokens, Git Sources, Notifications, Settings).
- **Workspace switcher** (sidebar): switch workspace, create workspace, see your role.
- **Command palette:** `⌘K` / `Ctrl+K` — jump to main pages.
- **Header:** breadcrumbs / project & service context when deep in a project.
- **Theme:** light/dark in the user menu.
- **Sign out** from the user menu.

---

## Profile and account

**Where:** User menu → **Profile** (`/profile`)

### Display name and avatar

- Edit display name and save.
- Avatar: upload JPEG/PNG/WebP, max **2 MB**. Remove avatar if needed.

**Who:** any signed-in user (own profile).

### Password

- Set or change password (current password required when changing).

### Sessions

- List active devices/sessions with relative last-seen.
- **Revoke** one session, **revoke others**, or **revoke all** (sign out everywhere).

**Expected:** Revoked sessions cannot use the cookie even if a JWT has not expired yet.

---

## Workspaces

### Switch or create a workspace

**Where:** Sidebar workspace switcher

- Switch current workspace (stored in the browser for the session).
- Create a new workspace (you become OWNER).

### Settings → General

**Where:** **Settings → General** (`/settings/general`)

- Edit workspace **name** and **description**.

**Who:** OWNER or ADMIN.

### Settings → Members

**Where:** **Settings → Members** (`/settings/members`)

- **Invite** by email with role: `ADMIN`, `BILLING_ADMIN`, or `MEMBER` (not OWNER).
- Change a member’s role; remove a member.
- List **pending invitations**; revoke an invite.

**Who:** OWNER or ADMIN for invite/role/remove.

**Common errors:** Cannot invite as OWNER — transfer ownership from Danger instead.

### Settings → LLMs

**Where:** **Settings → LLMs** (`/settings/llm`)

- Add or remove **OpenAI** and/or **Anthropic** API keys.
- After keys are saved, Chat can list models from that provider.

**Who:** OWNER or ADMIN. Without keys, Chat shows a gate linking here.

### Settings → Audit

**Where:** **Settings → Audit** (`/settings/audit`)

- OWNER-only log of mutating actions.
- Filter by actor and resource type (workspace, project, service, server, source, storage, private key, token, tag, shared variable, notification, LLM credential, deployment, …).
- Open a row for full action + metadata.

**Who:** OWNER only.

### Settings → Danger

**Where:** **Settings → Danger** (`/settings/danger`)

- **Leave workspace** — non-OWNER members (not available on personal workspaces).
- **Transfer ownership** — OWNER picks a member and disposition: Stay ADMIN / Stay MEMBER / Leave.
- **Delete workspace** — OWNER only; type name to confirm. Preflight requires **zero projects/services** (DB cascade only; no SSH teardown of remote containers).

**Who:** as above.

### Personal vs team workspace

- Personal workspace: typically created at onboarding; delete may be blocked.
- Team workspace: invite members, transfer ownership, leave as non-owner.

---

## Roles and permissions

### Workspace roles

| Role | Typical access |
|------|----------------|
| **OWNER** | Full control; only role that deletes the workspace, sees Audit, transfers ownership |
| **ADMIN** | Manage infra + members + all projects; cannot delete workspace |
| **BILLING_ADMIN** | Like MEMBER for infra today (billing placeholder); needs project membership for projects |
| **MEMBER** | Workspace access; projects only via explicit project membership |

### Project roles

| Role | Access |
|------|--------|
| **ADMIN** | Manage project resources (services, env reveal/edit, deploy, terminal, …) |
| **MEMBER** | Read-only (env values masked; no deploy/terminal/secret reveal) |

### Inheritance rules

1. You must be a workspace member.
2. Workspace OWNER/ADMIN see and manage **all** projects (no project membership required).
3. MEMBER / BILLING_ADMIN need **Project membership** to see a project.
4. Only OWNER/ADMIN create projects; creator becomes project ADMIN.
5. Infrastructure (servers, keys, sources, storages, …) requires workspace OWNER/ADMIN.
6. UI may hide buttons; **API and MCP enforce** the real rules.

---

## Projects

### List and create

**Where:** Sidebar → **Projects** (`/projects`)

- Create project (name, optional description).
- Open a project card.

**Who:** create = workspace OWNER/ADMIN.

### Project tabs

**Where:** `/projects/[projectId]?tab=…`

- **Services** — list services; new service; templates.
- **Members** — add workspace users as project ADMIN or MEMBER; change role; remove.
- **Settings** — edit name/description; delete project.

### Delete project

- Blocked while any **services** still exist. Delete services first, then delete the project (name confirmation).

---

## Marketplace services

One-click **COMPOSE** stacks from Peon’s template catalog (WordPress, n8n, Plausible, databases UIs, and hundreds more). Secrets and hostnames are generated automatically. This is **not** the same as **New Service → Compose** (blank YAML, no magic env).

**Who:** project manage (workspace OWNER/ADMIN or project ADMIN). Project MEMBERs do not see the Marketplace button.

### Where to open it

| Entry | Path | Notes |
|-------|------|-------|
| **In-app Marketplace** | Project → **Services** → **Marketplace** (also on the empty-state next to **New Service**) | Creates in the **current** project |
| **Marketing catalog** | peon.sh **Marketplace** → `/marketplace` | Search/filter cards; **Deploy** opens the app |
| **One-click deploy** | App `/deploy/[slug]` | Logged-in flow after marketing **Deploy** |

### Browse and filter (in-app)

Modal title: **Service marketplace**. Subtitle notes that secrets and hostnames are generated automatically.

| Control | What it does |
|---------|--------------|
| **search services…** | Matches slug, slogan, and tags |
| Category select | **all categories** or a catalog category (analytics, automation, cms, database, monitoring, …) |
| Cards | **Name**, optional category chip, **slogan** (clamped) |
| Empty state | `no templates match “{query}”` |

Click a card → create form. **Back** returns to the grid.

Marketing `/marketplace` is similar: search, **All categories**, count `{filtered} of {total} services`, **Deploy**, optional **Docs ↗**.

### Create from template (in-app)

| Field | What it does | Rules |
|-------|--------------|-------|
| Selected template | Shows **name**, **slogan**, optional **documentation** link | — |
| **Service name** | Display name | Optional; placeholder = template slug; empty → uses slug |
| **Server** | Deploy target | Required; options `name (ip)`; placeholder **Select server** |
| Helper (no servers) | “Add and validate a server before creating deployable services.” | Link to Servers |
| **Create service** | Submits | Disabled without a server; toast `{TemplateName} created from template` |

After create, you stay on the **project services list** (it refreshes). Open the new service manually to configure Domains and Deploy.

There is no project picker (current project only) and no destination picker in the UI.

### One-click deploy (`/deploy/[slug]`)

| Field / UI | What it does |
|------------|--------------|
| Eyebrow | **One-click deploy** |
| Title / slogan / documentation | From the catalog for that slug |
| **Workspace** | Defaults to your **current** workspace. Changing it updates your current workspace in Peon and reloads projects/servers for that workspace |
| **Project** | Required; lists projects in the selected workspace. Auto-selects if only one exists. If empty → link to **Create a project** |
| **Server** | Required; lists servers in the selected workspace. Auto-selects if only one exists. If empty → link to **Add a server** |
| **Deploy** | Creates the service in the chosen project; toast `{name} created`; navigates to `/projects/{id}/services/{serviceId}` |
| Missing slug | **Template not found** → **Back to marketplace** |

Project and server selections reset when you change workspace.

### What gets created

| Property | Value |
|----------|-------|
| Kind | **COMPOSE** (`buildPack: DOCKERCOMPOSE`) |
| Compose file | Template’s `docker-compose` content |
| Description | Template slogan |
| `templateSlug` | Catalog slug (for reference) |
| Env | Magic credentials + resolved template `.env` seeds (encrypted at rest) |

Deploy is **not** started automatically — use Overview → **Deploy** / **Redeploy**.

### After create — sections and fields

Same sidebar as other compose apps: **Overview**, **Configuration**, **Environment**, **Deployments**, **Domains**, **Storage**, **Scheduled Tasks**, **Logs**, **Terminal**, **Webhooks**, **Danger Zone**. No **Backups**.

**Configuration** highlights:

| Panel | What to use it for |
|-------|--------------------|
| **General** | **Name**, **Description**, **Server** |
| **Compose** | Edit raw YAML if you need template overrides |
| **Service Specific Configuration** | Auto fields from magic env (see below) — **Save** after edits |
| **Advanced** | Includes **Raw compose deployment** (default off). No rolling update / preview deploys for compose |

**Service Specific Configuration** labels (from env key patterns):

| Env pattern | UI label | Masked? |
|-------------|----------|---------|
| `SERVICE_USER_*` (and similar user keys) | **`{Id} User`** | No |
| `SERVICE_PASSWORD_*` (and password variants) | **`{Id} Password`** | Yes |
| `SERVICE_DATABASE_*` | **`{Id} Database Name`** | No |
| `SERVICE_BASE64_*` / `HEX_*` (and similar) | **`{Id} Secret`** | Yes |

Full variable set (including FQDN/URL helpers) is under **Environment** → production.

### Hostnames, Domains, and HTTPS

At create, Peon generates hostnames like:

`{slug}-{first8UuidChars}.{wildcardDomain | {ip}.sslip.io | localhost}`

and seeds `SERVICE_FQDN_*` / `SERVICE_URL_*` in **Environment** (generated URLs often use **http**).

Important:

1. Those magic FQDN env vars are **not** the same as the Domains panel **`fqdn`** used by the gateway (Traefik/Caddy labels, Overview **Visit**, Force HTTPS).
2. Before expecting public HTTPS, copy the intended hostname into **Domains** (or set your own domain + DNS), ensure **Servers → Gateway** is **on**, and ports 80/443 are open.
3. If the app requires `https://` in its own settings, update the relevant env URL after Domains + certs work.

### Volumes and raw compose

- Template volumes live in the **compose YAML**; Peon **Storage** (named volumes UI) is separate and not auto-synced from the template.
- **Raw compose deployment** (Advanced): deploy YAML as-is without Peon network/proxy injection — only if you manage networking yourself.

### Marketplace vs New Service → Compose

| | Marketplace / one-click | New Service → **Compose** |
|--|-------------------------|---------------------------|
| Catalog | Yes (~300+ templates) | No |
| Magic users/passwords/FQDN seeds | Yes | No |
| Compose YAML | From template | You paste it |
| Typical next step | Review Service Specific Configuration + Domains → Deploy | Paste YAML → Deploy |

### Common errors

| Symptom | What to check |
|---------|----------------|
| Marketplace button missing | Need project manage role |
| Create disabled / no servers | Add + validate a server first |
| Template not found on `/deploy/[slug]` | Bad slug; return to marketing marketplace |
| App unreachable after Deploy | Domains `fqdn` empty; Gateway off; DNS; or still need first Deploy |
| Login credentials unknown | **Configuration → Service Specific Configuration** or **Environment** (reveal with manage role) |
| HTTPS / Visit broken | Set Domains; Force HTTPS; Gateway reload; DNS to server IP |

---

## Services — create

**Where:** Project → Services → **New service**

**Who:** project manage (workspace OWNER/ADMIN or project ADMIN).

For one-click templates, use **Marketplace** instead (previous section). **New Service → Compose** is a blank compose file with no template catalog.

### New service dialog — fields

| Field | What it does | Notes |
|-------|--------------|-------|
| **Type** | Chooses the service kind and which create fields appear. | Application (Git), Dockerfile, Docker Image, Static Site, Nixpacks, Database, Compose |
| **Name** | Display name (required). | 1–120 characters |
| **Server** | Target host for deploys. | Shown as `name (ip)` from workspace servers |
| **Port** | Container listen port / host:container mappings. | e.g. `3000` or `8080:3000`; optional. Git-based + Docker Image |
| **Base directory** | Repo subdirectory used as build context. | Default `/`. Git-based only |
| **Publish directory** | Folder of built static assets (relative to base). | e.g. `/dist`. **STATIC** only |
| **Build pack** | How Application (Git) images are built. | Nixpacks, Railpack, Dockerfile, Static. **GIT_APP** only |
| **Dockerfile location** | Path to Dockerfile relative to base. | Default `/Dockerfile`. **DOCKERFILE** kind, or GIT_APP + Dockerfile pack |
| **Git source type** | How git is authenticated/cloned. | Git App, Public repository, Deploy key. Git-based only |
| **Connection** | Which GitHub/GitLab app installation to use. | Git App mode |
| **Repository** | Pick repo from GitHub App (sets clone URL). | `owner/repo`. Git App + GitHub |
| **Branch** | Deploy branch. | Default `main`; select or free text |
| **Git repository** | Clone URL when not using the GitHub App picker. | HTTPS/SSH URL. Public / Deploy key / GitLab |
| **Private key** | SSH deploy key for private repos. | Workspace keys, or “No private key”. Deploy key mode |
| **Image** | Registry image name. | e.g. `nginx`. **DOCKER_IMAGE** |
| **Tag** | Image tag. | Default `latest`. **DOCKER_IMAGE** |
| **docker-compose.yml** | Raw compose file content (required). | Full YAML. **COMPOSE** |
| **Engine** | Database engine. | PostgreSQL, MySQL, MariaDB, MongoDB, Redis, KeyDB, Dragonfly, ClickHouse. **DATABASE** |
| **Image** (Postgres) | Postgres image variant. | e.g. `postgres:18-alpine` (default), 17/16, Supabase, PostGIS, PGVector |

Create does **not** ask for description, destination, or DB username/password (credentials are generated / edited later under Configuration).

---

## Services — Overview and lifecycle

**Where:** Service → **Overview**

| Control | What it does |
|---------|--------------|
| Status / preview card | Shows runtime status; screenshot/preview when available; commit/branch/repo links |
| **Deploy** / **Redeploy** | Queue a new production deployment |
| **Force rebuild** | Deploy and clear build/source cache |
| **Start** / **Stop** / **Restart** | Control the running container(s) |
| **Visit** | Open the primary domain when configured |
| Activity | Recent deployments; jump to Deployments section |

**Who:** manage for mutating controls; read for viewing.

---

## Services — Configuration

**Where:** Service → **Configuration**

Panels and fields depend on kind. Save each panel with its footer **Save** when present.

**Kinds:** Application (Git) / Dockerfile / Nixpacks / Static = *git-based*; also Docker Image, Compose, Database.

### General

| Field | What it does | When |
|-------|--------------|------|
| **Name** | Rename the service (1–120 chars). | All |
| **Description** | Optional notes (≤1000 chars; empty clears). | All |
| **Server** | Change deploy target host. Warns if unset. | All |
| **Build pack** | Nixpacks / Railpack / Dockerfile / Static. Tooltip: Static→nginx:alpine :80; packs auto-detect; Dockerfile uses your Dockerfile. | Git-based |

### Git source

*Git-based only.*

| Field | What it does | When |
|-------|--------------|------|
| **Git source type** | Git App, Public repository, or Deploy key. | Always in panel |
| **Connection** | Bind a GitHub/GitLab source installation. | Git App |
| **Repository** | GitHub App repo picker (`owner/repo`). | Git App + GitHub |
| **Branch** | Branch to deploy (select or text). | Always |
| **Git repository** | Clone URL (HTTPS/SSH). | Public / Deploy key / GitLab |
| **Private key** | Workspace SSH key for private clone. | Deploy key |

### Build

*Git-based only.*

| Field | What it does | When |
|-------|--------------|------|
| **Install command** | Overrides pack install (`NIXPACKS_INSTALL_CMD`). Empty = auto-detect. | Non-Dockerfile pack |
| **Build command** | Overrides pack build (`NIXPACKS_BUILD_CMD`). | Non-Dockerfile pack |
| **Start command** | Overrides pack start / image CMD. Empty on Dockerfile = image CMD. | Always in Build |
| **Base directory** | Build-context subdirectory (default `/`). | Always |
| **Dockerfile location** | Dockerfile path vs base (e.g. `/Dockerfile`). | Dockerfile pack / DOCKERFILE kind |
| **Publish directory** | Static asset folder vs base (e.g. `dist`). | Non-Dockerfile pack |
| **Ports exposed / mappings** | Listen ports or `host:container` maps (`3000` or `8080:3000,8443:443`). | Always |
| **Watch paths** | Globs, one per line; auto-deploy only if the push touches a match. Empty = every push. | Always |
| **Disable build cache** | Force rebuild and clear cached source. | Always |

### Dockerfile / Docker image / Compose panels

| Field | What it does | When |
|-------|--------------|------|
| **Inline Dockerfile content** | When set, overrides the file at Dockerfile location. | Dockerfile pack / DOCKERFILE |
| **Image** | Registry image name (e.g. `nginx`). | **DOCKER_IMAGE** |
| **Tag** | Image tag (default `latest`). | **DOCKER_IMAGE** |
| **Ports exposed / mappings** | Same format as Build ports. | **DOCKER_IMAGE** |
| Compose editor (textarea) | Edits raw `docker-compose` YAML. | **COMPOSE** |

### Database / Compose engine configuration

*Shown for **DATABASE** and **COMPOSE** only.*

**DATABASE — engine fields**

| Field | What it does | Engines |
|-------|--------------|---------|
| **Image** | Docker image for the DB. | All |
| **Username** | Application DB user. | Postgres, MySQL, MariaDB, ClickHouse |
| **Password** | User password (masked). | Postgres, MySQL, MariaDB, MongoDB, ClickHouse |
| **Initial Database** / **Database Name** | Default database name. | Postgres/Mongo (`Initial Database`); MySQL/MariaDB/ClickHouse (`Database Name`) |
| **Root Password** | Root password (masked). | MySQL, MariaDB |
| **Root Username** | Mongo init root user. | MongoDB |

Redis / KeyDB / Dragonfly: **Image** only (no credential fields in UI).

**DATABASE — connection URLs (read-only)**

| Field | What it does |
|-------|--------------|
| **`{Engine} URL (internal)`** | URL on the Docker network (`containerName:internalPort`) for other services |
| **`{Engine} URL (public)`** | URL via server IP + public port; empty until Public access is enabled |

**COMPOSE — template-derived fields**

Auto-built from magic env keys in the stack:

| Pattern | UI label pattern |
|---------|------------------|
| `SERVICE_USER_{id}` | **`{Id} User`** |
| `SERVICE_PASSWORD_{id}` | **`{Id} Password`** (masked) |
| `SERVICE_DATABASE_{id}` | **`{Id} Database Name`** |
| `SERVICE_BASE64_*` / `HEX_*` | **`{Id} Secret`** (masked) |

Exact fields depend on the template.

### Public access (databases)

| Field | What it does |
|-------|--------------|
| **Publicly accessible** | Publish the DB port on the host |
| **Public port** | Host port for external clients (integer; clear to unset) |

### Healthcheck

*Hidden for **COMPOSE**. HTTP probe fields hidden for **DATABASE** (timing only).*

| Field | What it does | Default / range |
|-------|--------------|-----------------|
| **Enabled** | Adds Docker HEALTHCHECK | Off until enabled |
| **Method** | HTTP method for probe | GET, HEAD, POST, OPTIONS (default GET). Non-DB |
| **Scheme** | `http` or `https` | Non-DB |
| **Host** | Probe host | Default `localhost`. Non-DB |
| **Port** | Probe port; empty → first exposed port | Non-DB |
| **Path** | Probe path | Default `/`. Non-DB |
| **Return code** | Expected HTTP status | 100–599; UI default 200. Non-DB |
| **Response text** | Optional; body must contain this string | Non-DB |
| **Interval (s)** | Seconds between probes | 1–3600; default 5 |
| **Timeout (s)** | Probe timeout | 1–3600; default 5 |
| **Retries** | Failures before unhealthy | 1–100; default 10 |
| **Start period (s)** | Grace before failures count | 0–3600; default 5 |

### Advanced

| Field | What it does | When |
|-------|--------------|------|
| **Auto deploy** | Push/webhook queues a deploy for the configured branch | Git-based (default on) |
| **Preview deployments** | PR previews on `{sha}.{wildcard}` — needs server wildcard domain + Git permissions | Git-based |
| **Static site** | Flag for static hosting (Static pack actually enables serving) | Git-based |
| **Single-page app fallback** | Intended SPA index rewrite (may not be fully applied yet) | Git-based |
| **Raw compose deployment** | Deploy compose as-is (no Peon network/proxy inject) | **COMPOSE** |
| **Rolling update** | Start new container beside old until healthy (needs domain; no host port maps) | Not COMPOSE/DATABASE (default on) |
| **Pre-deploy command** | Shell after build, before compose up | Non-DATABASE |
| **Post-deploy command** | Shell after container is ready | Non-DATABASE |
| **Custom Docker options** | Extra `docker run` flags into compose (`--cap-add`, `--ulimit`, `--gpus`, …) | All |
| **Labels** | Extra Docker labels, one per line (e.g. Traefik/Caddy middleware) | Non-DATABASE |

Preview also shows a **DNS setup for preview deployments** callout (not a form field).

### Resource limits

| Field | What it does | Default / examples |
|-------|--------------|--------------------|
| **CPU limit** | Docker CPU quota | e.g. `0.5`; empty = unlimited |
| **Memory limit** | Docker memory cap | e.g. `512m`, `1g` |
| **Docker images to keep** | Keep N prior `peon/*` tags (+ running) for rollback | Default `3`; `0` = only running |
| **Stop grace period (seconds)** | Graceful stop before SIGKILL | Default `30` |

---

## Domains and HTTPS

**Where:** Service → **Domains** (hidden for databases)

| Field | What it does | Default |
|-------|--------------|---------|
| **Domains** | Public FQDNs (multi-row; stored as comma-separated). Use **Add New Domain**. Example: `https://app.example.com` | — |
| **Force HTTPS** | Redirect HTTP→HTTPS via the gateway | On |
| **Gzip compression** | Enable gzip middleware | On |
| **Strip prefix** | Strip path prefix `/` via proxy | Off |

Point DNS (A/AAAA or CNAME) at the server. Server **Wildcard domain** (Servers → General) helps previews.

**Common errors:** Certificate not issuing → DNS wrong, ports 80/443 blocked, or Gateway off.

---

## Environment variables

**Where:** Service → **Environment**

Two sections: **production** and **preview**.

| Field / control | What it does |
|-----------------|--------------|
| **KEY** / value | Add a variable. Key: `^[A-Za-z_][A-Za-z0-9_]*$`, ≤255 chars |
| **Build** | Available at build time (default on). Use for `NEXT_PUBLIC_*` etc. |
| **Runtime** | Available in the running container (default on) |
| **Developer mode** | Bulk `.env` editor (`KEY=value` per line). **Save all** replaces the whole set |
| **Import from production** | Copy prod vars into preview (overwrites matching keys) | Preview only |
| Reveal / mask | Manage role can reveal; project MEMBER sees masked values |

---

## Volumes

**Where:** Service → **Storage**

| Field | What it does |
|-------|--------------|
| **name** | Docker volume name (1–120 chars) |
| Mount path (placeholder **/data**) | Path inside the container |

UI creates named volumes only (no bind-mount host path in the form). Deleting a mapping updates Peon config; remote volume data may remain.

---

## Deployments

**Where:** Service → **Deployments**; detail `…/deployments/[deploymentId]`

| Action | What it does |
|--------|--------------|
| **Deploy now** | Queue production deploy |
| **Force rebuild** | Deploy with cache cleared |
| **Cancel** | Stop queued/in-progress deploy |
| **Rollback** | Re-point to a finished production deploy |
| Detail logs | Live build logs; download |
| Preview list | Active PR previews; delete preview env |

Shell may show active-deployment toast / redeploy prompt while builds run.

---

## Preview deployments

1. Configuration → **Advanced** → enable **Preview deployments**.
2. Set Servers → General → **Wildcard domain** and DNS per the in-app guide.
3. Open a PR → Peon builds `{sha}.{wildcard}`.
4. Delete finished previews from Deployments → preview panel.

**Common errors:** 404 → DNS/wildcard/gateway; auto-deploy or GitHub app permissions missing.

---

## Scheduled tasks

**Where:** Service → **Scheduled Tasks** (hidden for databases)

**New task**

| Field | What it does | Default / example |
|-------|--------------|-------------------|
| **Name** | Task label | e.g. `cleanup-cache` |
| **Frequency (cron)** | 5-field cron | Default `0 0 * * *` |
| **Command** | Shell command inside the container | e.g. `pnpm run scheduler:clean` |

**Edit task (extra)**

| Field | What it does |
|-------|--------------|
| **Timeout (seconds)** | 1–86400; default 300 |
| **Container name** | Optional target container |
| Enable / Disable | Toggle schedule |
| **Execute now** | Run immediately |
| History | Past executions |

---

## Database backups

**Where:** Service → **Backups** (DATABASE; engines PostgreSQL, MySQL, MariaDB, MongoDB)

**New schedule:** **Frequency (cron)** (default `0 0 * * *`).

**Edit schedule**

| Field | What it does |
|-------|--------------|
| **Frequency (cron)** | When dumps run |
| **Local backups to keep** | Local retention 0–1000 (default 7) |
| **Upload to S3** | Also upload to a workspace Storage (picker) |
| Enable / Disable / **Backup now** / Delete | Lifecycle controls |
| History + **Restore** | Restore from a successful dump |

**Common errors:** S3 upload fails → **Storages** → Test credentials.

---

## Logs and Terminal

### Logs

| Control | What it does |
|---------|--------------|
| Last N lines | 100 / 200 / 500 / 1000 / 2000 |
| Auto-refresh / follow | Stream new lines |
| Download / refetch | Export or reload |

### Terminal

Interactive shell in the container (or host on Servers). **Not** available via Chat or MCP.

**Who:** project manage (service); workspace OWNER/ADMIN (server).

---

## Webhooks

**Where:** Service → **Webhooks**

| Control | What it does |
|---------|--------------|
| Provider | **Generic**, **GitHub**, or **GitLab** |
| **New webhook** | Creates `/api/webhooks/{token}` URL — copy and register with your git host |
| Delete | Remove unused hooks |

Enable **Auto deploy** for push-triggered deploys. Branch filtering and signature checks follow provider rules.

---

## Danger zone (service)

**Where:** Service → **Danger Zone**

| Field | What it does |
|-------|--------------|
| Confirm name | Type the **exact** service name to enable delete |
| Delete | Removes the service from Peon and tears down containers per platform behavior |

---

## Servers

**Where:** Sidebar → **Servers** (`/servers`), detail `/servers/[serverId]`

**Who:** workspace OWNER or ADMIN for all server operations.

### Add server dialog

| Field | What it does | Default / rules |
|-------|--------------|-----------------|
| **Name** | Display name (required) | 1–80 chars |
| **IP / Hostname** | SSH host Peon connects to | IPv4, IPv6, or DNS; max 255. Placeholder e.g. `203.0.113.10` |
| **Port** | SSH port | Default `22` (1–65535) |
| **User** | SSH login user | Default `root` (1–80) |
| **Private key** | Workspace SSH key (required) | Create keys under Keys & Tokens first |
| **Gateway type** | Reverse proxy Peon manages | **Traefik** (default), **Caddy**, or **None** |

On create, Peon also creates default settings (Docker cleanup flags on) and a destination named **default** on network **peon**.

### General tab

**Connect / Reconnect:** saves connection fields, then runs validate (SSH → Docker setup → agent). Watch **Activity** for progress. Requires an SSH key.

| Field | What it does | Default / rules |
|-------|--------------|-----------------|
| **Name** | Server display name | 1–80 |
| **Description** | Optional notes | Max 500; empty → null |
| **User** | SSH user | Prefill current (often `root`) |
| **IP / Hostname** | SSH host | Same rules as create |
| **Port** | SSH port | Prefill; UI falls back to 22 |
| **SSH key** | Private key for SSH | Required to Save/Connect in UI |
| **Wildcard domain** | Base for preview FQDNs (`https://{sha}.{host}`) | Max 255; placeholder `https://example.com` |
| **SSH connection timeout (s)** | Seconds allowed for SSH connect | 1–300; default `30` |
| **Gateway type** | Traefik / Caddy / None | Prefill current |

Metrics (CPU/RAM/disk) appear when the agent is live.

### Gateway tab

No text fields — status + actions:

| Control | What it does |
|---------|--------------|
| Status | `on` when proxy running; `off` when exited |
| **Turn on** | Install/start gateway so public domains work |
| **Reload** | Restart gateway with current config |
| **Turn off** | Stop public routing; apps keep running locally |

Hidden when Gateway type is **None** — change type under General first.

### Terminal tab

Host SSH terminal (UI only). No form fields.

### Advanced tab

**Build and deployment limits**

| Field | What it does | Default |
|-------|--------------|---------|
| **Concurrent builds** | Max simultaneous builds/deploys on this server | `2` (1–50) |
| **Deployment queue limit** | Cap on queued deployments waiting for a slot | `25` (1–500) |

**Docker cleanup**

| Field | What it does | Default |
|-------|--------------|---------|
| **Force Docker cleanup** | When on, scheduled cleanups always prune unused images/builders/containers. When off, UI shows threshold-based messaging | New servers often created with force **on** |
| **Cleanup cron** | Cron for scheduled cleanup | `0 0 * * *` |
| **Cleanup threshold (%)** | Disk % that should trigger cleanup when force is off (field shown when force off) | `80` (1–100) |
| **Delete unused volumes** | Also `docker volume prune` (can destroy data of stopped containers) | Often **on** for new servers |
| **Delete unused networks** | Also `docker network prune` | Often **on** for new servers |
| **Trigger manual cleanup** | Run cleanup now (confirm). Always prunes images/builders/stopped containers; volumes/networks follow **saved** toggles | Action |

Save with **Save advanced settings**.

### Destinations tab

Docker networks services can join (with the gateway).

| Field | What it does | Default |
|-------|--------------|---------|
| **Name** | Friendly destination name | e.g. `staging` (1–80) |
| **Docker network** | Network name containers join | Default / reset `peon` |
| **Delete** | Remove destination (confirm). Reassign services first if needed | — |

A **default** / `peon` destination is created with the server.

### Danger tab — delete server

| Field | What it does |
|-------|--------------|
| **Server name** | Type exact name to enable delete |
| **Delete all resources (N total)** | Shown if services exist. Stops containers and deletes those services from Peon. Required when the server still has services |
| **Delete server** | Removes the server from Peon (not the VM). Cascades settings, destinations, logs |

**Common errors:** Validate fails → wrong IP/key/user, SSH port blocked, or missing sudo for first Docker install. Proxy issues → Gateway off or ports 80/443 busy on the host.

---

## Git sources

**Where:** Sidebar → **Git Sources** (`/sources`), detail `/sources/[sourceId]`

**Who:** workspace OWNER/ADMIN.

### Connect

- **Connect GitHub** (platform app) when the instance has it configured.
- **Create custom** GitHub or GitLab App: name, org, HTML/API URLs, app IDs/secrets, webhook secrets, SSH key, port/user.

### Detail

- **General:** edit connection fields; connect status; copy webhook/setup URLs.
- **Resources:** services using this source.
- Delete source when unused (ensure services are reassigned first if needed).

---

## Storages (S3)

**Where:** Sidebar → **Storages** (`/storages`)

**Who:** workspace OWNER/ADMIN.

1. Create: name, endpoint, region, bucket, access key, secret key.
2. **Test** reachability.
3. Delete when unused.
4. Select a storage on database backup schedules for off-site upload.

---

## Keys and tokens

**Where:** Sidebar → **Keys & Tokens** (`/keys-and-tokens`)

**Who:** SSH keys & infra tokens → workspace OWNER/ADMIN for keys; personal API tokens are per-user.

### SSH keys

- Generate a keypair or paste private (+ optional public).
- Name/description; download PEM; delete.
- Attach keys when adding servers or deploy-key git modes.

### API tokens and MCP

- Create a personal access token (`peon_…`); copy once when shown; revoke later.
- Token inherits your workspace role + project memberships.
- **MCP:** point clients at `{appOrigin}/mcp` with `Authorization: Bearer peon_…`.
- Shell exec tools (`exec_in_service`, `exec_on_server`) are **not** exposed on MCP or Chat — use UI Terminals.

---

## Notifications

**Where:** Sidebar → **Notifications** (`/notifications`)

**Who:** workspace OWNER/ADMIN.

### Channels

Tabs: **Email**, **Discord**, **Slack**, **Telegram**, **Pushover**, **Webhook**.

Configure channel-specific fields (emails, webhook URLs, bot token/chat id, Pushover keys, signing secret).

### Events

- `deployment_success`, `deployment_failure`, `server_unreachable`, `backup_failure`.

Enable the channel, select events, save, then **Test**.

---

## Shared variables

**Where:** `/shared-variables` (not in the main sidebar; use command palette or direct URL)

**Who:** workspace OWNER/ADMIN (scope-dependent).

- Create variables with scopes: **WORKSPACE**, **PROJECT**, or **SERVER** (provide project/server IDs when required).
- Key, value, optional comment; delete when unused.
- Shared variables complement per-service Environment — use for values reused across many services.

---

## Chat

**Where:** Sidebar → **Chat** (`/chat`)

### Basics

- Thread rail: create, select, delete threads.
- Model picker from workspace LLM credentials (**Settings → LLMs**).
- Streaming replies; empty-state example prompts.

### Capabilities

- Same operational tools as MCP (list/get/deploy/env/logs/…), subject to your permissions.
- **Cannot:** run shell in containers/hosts; invent secrets; bypass RBAC.
- Mutating tools require **Approve** in the UI approval card.
- How-to questions: Chat calls **`lookup_user_manual`** against this document.
- Charts/metrics: Chat may call **`present_visual`**.

### Gate

If no LLM key is configured, Chat prompts OWNER/ADMIN to add keys under Settings → LLMs.

---

## End-to-end workflows

### First deploy

1. **Keys & Tokens** → create/generate SSH key.
2. **Servers** → add server with that key → Connect until healthy; turn Gateway on.
3. **Git Sources** → connect GitHub/GitLab (or use public repo).
4. **Projects** → create project → **New service** (Git) → pick repo/branch/server → save Configuration.
5. **Environment** → add vars.
6. **Domains** → add FQDN + DNS to server IP.
7. **Overview** → Deploy; watch **Deployments** logs until healthy.

### Deploy a marketplace service

1. **Servers** → ensure a validated server with **Gateway** on (and optional **Wildcard domain**).
2. Open **Marketplace** on a project (or peon.sh Marketplace → **Deploy** → `/deploy/[slug]`).
3. On one-click deploy: pick **Workspace** (defaults to current), **Project**, and **Server** → **Deploy**. In-app Marketplace: pick **Server** (and optional **Service name**) → **Create service**.
4. Open the service → **Configuration → Service Specific Configuration** (and **Environment**) for generated passwords/users.
5. **Domains** → set the public FQDN (copy from generated hostname or use your own) + DNS.
6. **Overview** → **Deploy**; wait until healthy; **Visit** or open the domain.
7. Log into the app with the generated credentials from Service Specific Configuration.

### Auto-deploy and webhooks

1. Enable **Auto deploy** in Configuration → Advanced.
2. Ensure Git source webhooks are installed (or create Service → Webhooks URL and register it).
3. Push to the watched branch → deployment should appear.

### Add a teammate

1. Settings → Members → invite with ADMIN or MEMBER.
2. For MEMBER: Project → Members → add them as project ADMIN or MEMBER.

### Database backup and restore

1. Create DATABASE service; wait until running.
2. **Storages** → add S3 bucket; Test.
3. Service → Backups → schedule + optional S3 upload.
4. Backup now; later Restore from a successful execution.

### Preview deploys for PRs

1. Server wildcard domain + DNS.
2. Enable preview deployments on the service.
3. Open PR; watch Deployments → previews; delete when finished.

### Rollback

1. Service → Deployments (or deployment detail).
2. Choose a previous successful production deploy → **Rollback**.

### Transfer ownership or leave

1. Danger → Transfer ownership (OWNER) or Leave (non-OWNER).
2. To delete workspace: remove all services and projects first, then Danger → Delete.

---

## Troubleshooting

### Server connect failures

- Verify IP, SSH port, user, and private key.
- Ensure the user can sudo for first-time Docker install.
- Read Servers → Activity logs for the validate session.

### Deploy or healthcheck failures

- Open the failed deployment → read build logs.
- Check start command, ports, and healthcheck path.
- Confirm env vars (buildtime vs runtime).
- Force rebuild if a bad layer/cache is suspected.

### Domain or SSL not issuing

- DNS must resolve to the server.
- Gateway (Traefik/Caddy) must be on; ports 80/443 open.
- Wait for certificate issuance; check proxy/gateway logs via server activity if available.

### Permission denied / masked env

- Project MEMBER cannot reveal secrets or deploy — ask a project ADMIN or workspace OWNER/ADMIN.
- Infra pages empty → need workspace OWNER/ADMIN.

### Chat has no models

- Settings → LLMs: add OpenAI or Anthropic key (OWNER/ADMIN).
- Pick a model in the Chat header after keys save.

### Still stuck

- Service **Logs** and **Deployments** detail.
- Workspace **Settings → Audit** (OWNER) for who changed what.
- Server **Terminal** or Service **Terminal** for live inspection (UI only).
