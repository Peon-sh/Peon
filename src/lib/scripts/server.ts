import { DEFAULT_NETWORK } from '@/lib/docker/naming';

/** Idempotent Docker installation via the official convenience script. */
export const INSTALL_DOCKER_SCRIPT = `
set -e
if command -v docker >/dev/null 2>&1; then
  echo "docker already installed: $(docker --version)"
else
  echo "installing docker..."
  curl -fsSL https://get.docker.com -o /tmp/get-docker.sh
  sh /tmp/get-docker.sh
fi
systemctl enable docker >/dev/null 2>&1 || true
systemctl start docker >/dev/null 2>&1 || true
docker network inspect ${DEFAULT_NETWORK} >/dev/null 2>&1 || docker network create --attachable ${DEFAULT_NETWORK}
echo "docker ready"
`.trim();

/** Install baseline commands required before Docker setup. */
export const INSTALL_PREREQUISITES_SCRIPT = `
set -e
. /etc/os-release 2>/dev/null || true
case "$ID" in
  ubuntu|debian|raspbian|pop)
    apt-get update
    DEBIAN_FRONTEND=noninteractive apt-get install -y git curl jq ca-certificates
    ;;
  centos|fedora|rhel|ol|rocky|amzn|almalinux)
    (dnf install -y git curl jq ca-certificates || yum install -y git curl jq ca-certificates)
    ;;
  sles|opensuse-leap|opensuse-tumbleweed)
    zypper --non-interactive install git curl jq ca-certificates
    ;;
  arch)
    pacman -Sy --noconfirm git curl jq ca-certificates
    ;;
  alpine)
    apk add --no-cache git curl jq ca-certificates
    ;;
  *)
    echo "unsupported os: \${ID:-unknown}"
    exit 1
    ;;
esac
echo "prerequisites ready"
`.trim();

/** Collect basic server facts used for validation. */
export const SERVER_INFO_SCRIPT = `
echo "OS=$(. /etc/os-release 2>/dev/null; echo \\"$PRETTY_NAME\\")"
echo "OS_ID=$(. /etc/os-release 2>/dev/null; echo \\"$ID\\")"
echo "HAS_GIT=$(command -v git >/dev/null 2>&1 && echo yes || echo no)"
echo "HAS_CURL=$(command -v curl >/dev/null 2>&1 && echo yes || echo no)"
echo "HAS_JQ=$(command -v jq >/dev/null 2>&1 && echo yes || echo no)"
echo "DOCKER=$(docker --version 2>/dev/null || echo none)"
echo "DOCKER_SERVER_VERSION=$(docker version --format '{{.Server.Version}}' 2>/dev/null || echo none)"
echo "COMPOSE=$(docker compose version --short 2>/dev/null || echo none)"
echo "CPU=$(nproc 2>/dev/null || echo ?)"
echo "MEM=$(free -m 2>/dev/null | awk '/Mem:/{print $2}' || echo ?)"
echo "DISK=$(df -h / 2>/dev/null | awk 'NR==2{print $5}')"
`.trim();

export function proxyComposePath(): string {
  return '/data/peon/proxy';
}

/** Traefik proxy docker-compose written to the server. */
export function traefikComposeFile(): string {
  return `
services:
  traefik:
    image: traefik:v3.6.6
    container_name: peon-proxy
    restart: unless-stopped
    network_mode: host
    command:
      - "--providers.docker=true"
      - "--providers.docker.exposedbydefault=false"
      - "--entrypoints.http.address=:80"
      - "--entrypoints.https.address=:443"
      - "--certificatesresolvers.letsencrypt.acme.httpchallenge=true"
      - "--certificatesresolvers.letsencrypt.acme.httpchallenge.entrypoint=http"
      - "--certificatesresolvers.letsencrypt.acme.storage=/acme.json"
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock:ro
      - ${proxyComposePath()}/acme.json:/acme.json
`.trimStart();
}

/** Caddy proxy (caddy-docker-proxy) docker-compose written to the server. */
export function caddyComposeFile(): string {
  return `
services:
  caddy:
    image: lucaslorentz/caddy-docker-proxy:2.9-alpine
    container_name: peon-proxy
    restart: unless-stopped
    network_mode: host
    environment:
      - CADDY_INGRESS_NETWORKS=${DEFAULT_NETWORK}
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock:ro
      - ${proxyComposePath()}/caddy_data:/data
`.trimStart();
}

/** Return the proxy compose file for the given proxy type. */
export function proxyComposeFile(proxyType: string): string {
  return proxyType === 'CADDY' ? caddyComposeFile() : traefikComposeFile();
}

export function startProxyScript(): string {
  const dir = proxyComposePath();
  return `
set -e
mkdir -p ${dir}
touch ${dir}/acme.json
chmod 600 ${dir}/acme.json
docker network inspect ${DEFAULT_NETWORK} >/dev/null 2>&1 || docker network create --attachable ${DEFAULT_NETWORK}
cd ${dir}
docker compose up -d
echo "proxy started"
`.trim();
}

export function stopProxyScript(): string {
  return `cd ${proxyComposePath()} && docker compose down || true; echo "proxy stopped"`;
}

export { cleanupScript } from './docker-cleanup';
export type { CleanupScriptOptions } from './docker-cleanup';

/** peon-ping-pong agent (server monitoring heartbeat). */
export const PEON_PING_PONG_IMAGE = 'ghcr.io/peon-sh/peon-ping-pong:0.0.1';
export const PEON_PING_PONG_CONTAINER = 'peon-ping-pong';

export function agentComposePath(): string {
  return '/data/peon/ping-pong';
}

export function agentComposeFile(opts: {
  token: string;
  pushEndpoint: string;
  serverId: string;
  pushIntervalSeconds?: number;
}): string {
  const interval = opts.pushIntervalSeconds ?? 60;
  // YAML single-quoted strings escape ' as ''
  const q = (v: string) => `'${v.replace(/'/g, "''")}'`;
  return `
services:
  peon-ping-pong:
    image: ${PEON_PING_PONG_IMAGE}
    container_name: ${PEON_PING_PONG_CONTAINER}
    restart: unless-stopped
    environment:
      TOKEN: ${q(opts.token)}
      PUSH_ENDPOINT: ${q(opts.pushEndpoint)}
      SERVER_ID: ${q(opts.serverId)}
      PUSH_INTERVAL_SECONDS: "${interval}"
      COLLECTOR_ENABLED: "true"
      LISTEN_ADDR: ":8888"
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock:ro
      - ${agentComposePath()}/data:/data/peon/ping-pong
    ports:
      - "127.0.0.1:8888:8888"
    labels:
      peon.managed: "true"
`.trimStart();
}

export function startAgentScript(): string {
  const dir = agentComposePath();
  return `
set -e
mkdir -p ${dir}/data
cd ${dir}
docker compose pull || true
docker compose up -d --force-recreate
echo "peon-ping-pong started"
`.trim();
}

export function stopAgentScript(): string {
  return `
cd ${agentComposePath()} 2>/dev/null && docker compose down || true
docker rm -f ${PEON_PING_PONG_CONTAINER} 2>/dev/null || true
echo "peon-ping-pong stopped"
`.trim();
}
