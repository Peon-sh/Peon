# Server modes: local, remote, hybrid

Peon deploys to servers. A server is either **remote** (reached over SSH, the
original behaviour) or **local** (the machine Peon itself runs on). One Peon
instance can manage any mix of both.

```
                        Peon control plane
                                │
              ┌─────────────────┴─────────────────┐
              │                                   │
         LOCAL server                       REMOTE servers
     (this machine, no SSH)          ┌──────┬──────┬──────┐
              │                      │      │      │      │
           Docker                   B      C      D    (SSH)
              │                      │      │      │
        apps + databases          Docker  Docker  Docker
```

`Server.executionMode` distinguishes them. It defaults to `REMOTE`, so every
existing server row is unaffected by the upgrade.

## Why not "just add localhost as an SSH server"

That already works — `lib/ssh/host.ts` accepts `localhost` — but it requires
running `sshd`, generating a keypair, and authorising Peon to SSH into its own
host. That is a workaround, not a feature: it adds an attack surface, an extra
daemon, and a confusing server record that looks remote but is not.

`executionMode: LOCAL` removes all of that. The same deployment engine runs the
same commands; only the transport changes.

---

## The filesystem model (read this before changing local execution)

This is the part that silently breaks. **Three processes can each see a different
filesystem**, and a deployment involves all three:

| Actor | What it does | Sees |
|---|---|---|
| Peon worker | writes `docker-compose.yml`, `.env`, clones repos | its own filesystem |
| Docker daemon | resolves bind mounts, build contexts | the **host** filesystem |
| Container | runs the workload | its own mounts |

Under SSH this is trivially consistent: the worker's commands execute *on the
remote host*, so the worker and the daemon see the same paths by construction.

Under **local execution the worker is usually itself a container**, and this
stops being true. If the worker writes `/data/peon/services/abc/docker-compose.yml`
inside its container and then runs `docker compose up -d`, the daemon resolves
every relative path in that file against the **host**, not the worker container.
Bind mounts silently point at the wrong place, or nothing.

### The rule

> The Peon data directory must be mounted at the **same absolute path** in the
> worker container as it is on the host.

```yaml
worker:
  volumes:
    - /var/run/docker.sock:/var/run/docker.sock
    - ${PEON_DATA_DIR:-/data/peon}:${PEON_DATA_DIR:-/data/peon}
  environment:
    PEON_DATA_DIR: ${PEON_DATA_DIR:-/data/peon}
```

Identical on both sides of the colon. Then a path written by the worker means the
same thing to the daemon, and `docker compose -f /data/peon/services/x/docker-compose.yml`
resolves correctly from either side.

This is why `PEON_DATA_DIR` exists and why `BASE_DIR` in
`services/internal/deploy/helpers.ts` is no longer a hardcoded constant.

### Paths involved

| Path | Purpose |
|---|---|
| `$PEON_DATA_DIR/services/<uuid>` | compose file, `.env`, cloned source |
| `$PEON_DATA_DIR/services/<uuid>-pr-<n>` | preview deployments |
| `$PEON_DATA_DIR/proxy` | Traefik/Caddy compose and ACME storage |
| `$PEON_DATA_DIR/backups` | database dumps before upload |
| `$PEON_DATA_DIR/storage` | local object storage (avatars, screenshots) |
| `$PEON_DATA_DIR/ping-pong` | monitoring agent state |

On a **remote** server these live on that server. On the **local** server they
live on the control-plane host, at the same path inside and outside the worker.

### Named volumes

Docker named volumes are resolved by the daemon and never touch the worker's
filesystem, so they are immune to this problem. Prefer them for workload data
(database volumes already work this way). Bind mounts are only used where Peon
needs to *write a file that the daemon then reads* — compose files and env files.

---

## Docker socket exposure

Local execution needs the Docker socket. This is a genuine privilege boundary:

> Access to `/var/run/docker.sock` is equivalent to root on the host.

A container with the socket can start a privileged container mounting `/`. There
is no way around this while still building and running arbitrary images.

Peon's rules:

1. **Only the worker gets the socket.** The web process never does. This is
   asserted in CI against every compose file.
2. **Docker is never exposed over TCP**, authenticated or otherwise.
3. **A socket proxy is not a security boundary here.** Proxies such as
   `docker-socket-proxy` allow-list API endpoints, but Peon legitimately needs
   container create, image build, exec and volume management — that set is
   already enough to take over the host. Documenting a proxy as "safe" would be
   dishonest. It is worth deploying only to limit *accidental* API surface, not
   to contain a compromised worker.
4. Treat a compromised worker as a compromised host. Isolation, if you need it,
   means putting workloads on a separate remote server — which is exactly what
   remote mode is for.

---

## Choosing a mode

| Situation | Mode |
|---|---|
| One VPS, want to deploy on it | Local |
| Control plane separate from workloads | Remote |
| Blast-radius isolation between projects | Remote |
| Control plane on a small box, heavy builds elsewhere | Hybrid |
| Build load competing with the dashboard | Remote, or set `concurrentBuilds: 1` |

Local mode shares CPU, RAM and disk between the control plane and the workloads.
A heavy Nixpacks build will make the dashboard sluggish. That is the trade-off of
running everything on one machine, and it is why `concurrentBuilds` defaults low.

---

## Hybrid

Nothing special is required. Add a local server and any number of remote servers;
each service picks a `serverId` as it always has. Deployments route to the right
executor automatically based on that server's `executionMode`.
