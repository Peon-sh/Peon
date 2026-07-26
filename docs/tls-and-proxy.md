# TLS and the gateway

Peon installs a reverse proxy (Traefik or Caddy) on every server it manages, and
that proxy owns ports 80 and 443. On a **single-server** installation the control
plane lives on that same machine — so without care you get two proxies fighting
over the same ports, and neither works.

This document describes the arrangement that avoids it.

## The rule

> **One gateway per machine owns :80 and :443. Peon is routed *through* it, not
> beside it.**

The gateway Peon already installs (`peon-proxy`) is the one. The control plane
does not publish 80/443 itself and does not run a second proxy; it publishes only
its app port on loopback and attaches to the shared `peon` Docker network, where
the gateway discovers it by label like any other service.

```
                  :80 / :443
                      │
              ┌───────▼────────┐
              │   peon-proxy   │   Traefik or Caddy, network_mode: host
              │  (one per box) │   discovers containers via the Docker socket
              └───────┬────────┘
                      │  peon network
        ┌─────────────┼─────────────┬──────────────┐
        │             │             │              │
  peon.example.com  app1.example  app2.example   …
   Peon control       customer      customer
      plane          workload      workload
```

The control plane is just another labelled container. That is the whole idea: no
special case, no second proxy, no port juggling.

## Single-server setup

**1. DNS.** Point both names at the server's public IP:

```
peon.example.com.   A    203.0.113.10
app.example.com.    A    203.0.113.10
```

A wildcard is convenient once you deploy several apps:

```
*.apps.example.com. A    203.0.113.10
```

Peon does not manage DNS. Records must resolve **before** requesting
certificates — ACME's HTTP-01 challenge fails otherwise, and repeated failures
hit Let's Encrypt rate limits.

**2. Tell Peon its own domain.** In `/opt/peon/.env`:

```bash
APP_URL=https://peon.example.com
NEXT_PUBLIC_APP_URL=https://peon.example.com
PEON_CONTROL_PLANE_DOMAIN=peon.example.com
```

`APP_URL` must be reachable **from your managed servers** — the monitoring agent
posts metrics to `${APP_URL}/api/v1/agents/push`. `localhost` stops working the
moment you add a remote server.

**3. Restart with the gateway overlay:**

```bash
cd /opt/peon
docker compose -f docker-compose.yml -f docker-compose.gateway.yml up -d
```

The overlay stops publishing `3000` publicly, attaches the app to the `peon`
network, and adds the router labels the gateway reads.

## What the overlay does

| Without it | With it |
|---|---|
| App publishes `3000:3000` | App publishes `127.0.0.1:3000` only |
| Reached over plain HTTP | Reached via the gateway on 443 |
| No certificate | ACME certificate for the control-plane domain |
| Not on the `peon` network | Attached, so the gateway can route to it |

## Certificates

Issued by the gateway, not by Peon:

- **Traefik** — `letsencrypt` resolver, HTTP-01 challenge, storage at
  `$PEON_DATA_DIR/proxy/acme.json`. Renews automatically at ~30 days remaining.
- **Caddy** — automatic HTTPS, storage at `$PEON_DATA_DIR/proxy/caddy_data`.

Back up `$PEON_DATA_DIR/proxy`. Losing it means re-issuing every certificate,
which is fine occasionally and rate-limited if you do it repeatedly.

Set a contact address so the CA can warn you about expiry:

```bash
ACME_EMAIL=ops@example.com
```

## HTTP behaviour

Port 80 stays open — it is required for the ACME HTTP-01 challenge. It serves
only the challenge and a redirect to HTTPS; the control plane is never served
over plain HTTP once the overlay is active.

## Remote servers are unchanged

Nothing here alters how managed servers work. Each remote server runs its own
`peon-proxy` owning its own 80/443, and Peon writes router labels onto the
containers it deploys there. The single-server case is the same mechanism applied
to a machine that happens to also host the control plane.

## Ports

| Port | Where | Purpose |
|---|---|---|
| 80 | public | ACME challenge, redirect to HTTPS |
| 443 | public | Everything |
| 3000 | loopback | Control plane behind the gateway |
| 8081 | via gateway | Terminal WebSocket, if enabled |
| 5432 | internal | Postgres, never published publicly |

Publishing 5432 or 3000 to the internet is not required and should be avoided.

## Troubleshooting

**Certificate never issues.** Check DNS resolves to this machine, that 80 is
reachable from the internet, and `docker logs peon-proxy`. Cloudflare proxying
(orange cloud) breaks HTTP-01 — use DNS-only, or switch to a DNS-01 challenge.

**Port 80 already in use.** Usually a distro nginx or apache:

```bash
ss -ltnp | grep -E ':(80|443)'
systemctl disable --now nginx apache2
```

**Control plane unreachable after enabling the overlay.** The app now publishes
only on loopback, so reach it through the domain. To check locally:

```bash
curl -sS http://127.0.0.1:3000/api/health
```

**Deployed app 404s while Peon works.** The app is missing its router labels or
is not on the `peon` network — check the service's domain setting and redeploy.
