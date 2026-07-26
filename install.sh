#!/usr/bin/env bash
#
# Peon one-command installer.
#
#   curl -fsSL https://get.peon.sh/install.sh | bash
#
# NOTE: that URL does not exist yet — this script lives in the repository and is
# intended to be served from an official location once the maintainer approves.
# Until then:
#
#   curl -fsSL https://raw.githubusercontent.com/Peon-sh/Peon/main/install.sh | bash
#
# Installs a complete single-server Peon: control plane, worker, PostgreSQL,
# the built-in queue, local storage, and the host itself registered as a
# deployment target.
#
# Requires no AWS account, no second server, and no SSH key for the local host.
# AWS providers remain available afterwards by editing the .env file.
#
# Safe to re-run: existing secrets, data and configuration are preserved.

set -euo pipefail

# --------------------------------------------------------------------------
# Configuration
# --------------------------------------------------------------------------

PEON_DIR="${PEON_DIR:-/opt/peon}"
PEON_DATA_DIR="${PEON_DATA_DIR:-/data/peon}"
PEON_REPO="${PEON_REPO:-https://github.com/Peon-sh/Peon.git}"
PEON_REF="${PEON_REF:-main}"
PEON_PORT="${PEON_PORT:-3000}"

MIN_RAM_MB=2048
MIN_DISK_GB=20
REQUIRED_PORTS=(80 443 "${PEON_PORT}")

# --------------------------------------------------------------------------
# Output helpers
# --------------------------------------------------------------------------

if [ -t 1 ]; then
  BOLD=$'\033[1m'; RED=$'\033[31m'; GREEN=$'\033[32m'; YELLOW=$'\033[33m'; DIM=$'\033[2m'; RESET=$'\033[0m'
else
  BOLD=''; RED=''; GREEN=''; YELLOW=''; DIM=''; RESET=''
fi

step()  { printf '\n%s==>%s %s%s%s\n' "$GREEN" "$RESET" "$BOLD" "$1" "$RESET"; }
info()  { printf '    %s\n' "$1"; }
warn()  { printf '    %s!%s %s\n' "$YELLOW" "$RESET" "$1"; }
skip()  { printf '    %s· %s%s\n' "$DIM" "$1" "$RESET"; }
die()   { printf '\n%serror:%s %s\n\n' "$RED" "$RESET" "$1" >&2; exit 1; }

# --------------------------------------------------------------------------
# 1. Preflight
# --------------------------------------------------------------------------

require_root() {
  if [ "$(id -u)" -ne 0 ]; then
    die "This installer must run as root (it installs Docker and writes to ${PEON_DIR}).
       Re-run with:  curl -fsSL <url> | sudo bash"
  fi
}

check_os() {
  [ -f /etc/os-release ] || die "Cannot detect the operating system (/etc/os-release is missing)."
  # shellcheck disable=SC1091
  . /etc/os-release

  case "${ID:-}" in
    ubuntu|debian|raspbian|pop|centos|fedora|rhel|ol|rocky|amzn|almalinux|sles|opensuse-leap|opensuse-tumbleweed|arch|alpine)
      info "OS: ${PRETTY_NAME:-$ID}"
      ;;
    *)
      die "Unsupported distribution: ${PRETTY_NAME:-${ID:-unknown}}.
       Peon supports Ubuntu, Debian, RHEL-family, SUSE, Arch and Alpine."
      ;;
  esac
}

check_arch() {
  local arch
  arch="$(uname -m)"
  case "$arch" in
    x86_64|amd64)  info "Architecture: ${arch}" ;;
    aarch64|arm64) info "Architecture: ${arch}" ;;
    *)
      die "Unsupported architecture: ${arch}. Peon needs x86_64 or arm64."
      ;;
  esac
}

check_resources() {
  local ram_mb disk_gb
  ram_mb="$(awk '/MemTotal/ {print int($2/1024)}' /proc/meminfo 2>/dev/null || echo 0)"
  disk_gb="$(df -BG --output=avail "$(dirname "$PEON_DIR")" 2>/dev/null | tail -1 | tr -dc '0-9' || echo 0)"

  if [ "${ram_mb:-0}" -lt "$MIN_RAM_MB" ]; then
    die "Peon needs at least ${MIN_RAM_MB} MB of RAM; this machine has ${ram_mb} MB.
       The control plane plus a build will not fit. Use a larger instance, or
       deploy workloads to a separate server instead of this one."
  fi
  info "RAM: ${ram_mb} MB"

  if [ "${disk_gb:-0}" -lt "$MIN_DISK_GB" ]; then
    die "Peon needs at least ${MIN_DISK_GB} GB free; this machine has ${disk_gb} GB.
       Docker images and database backups need room."
  fi
  info "Disk: ${disk_gb} GB free"
}

check_ports() {
  local busy=()
  for port in "${REQUIRED_PORTS[@]}"; do
    # ss is present on modern distros; fall back to netstat, then skip.
    if command -v ss >/dev/null 2>&1; then
      ss -ltn "sport = :${port}" 2>/dev/null | grep -q LISTEN && busy+=("$port") || true
    elif command -v netstat >/dev/null 2>&1; then
      netstat -ltn 2>/dev/null | grep -qE "[:.]${port}[[:space:]]" && busy+=("$port") || true
    fi
  done

  if [ ${#busy[@]} -gt 0 ]; then
    warn "Ports already in use: ${busy[*]}"
    warn "Peon needs 80 and 443 for its gateway and ${PEON_PORT} for the app."
    warn "Stop the conflicting service, or set PEON_PORT before re-running."
    # Not fatal: an existing Peon install legitimately holds these.
  else
    info "Ports ${REQUIRED_PORTS[*]} are free"
  fi
}

# --------------------------------------------------------------------------
# 2. Dependencies
# --------------------------------------------------------------------------

install_docker() {
  if command -v docker >/dev/null 2>&1; then
    skip "Docker already installed ($(docker --version))"
  else
    info "Installing Docker via the official convenience script…"
    curl -fsSL https://get.docker.com -o /tmp/peon-get-docker.sh
    sh /tmp/peon-get-docker.sh >/dev/null
    rm -f /tmp/peon-get-docker.sh
    info "Docker installed"
  fi

  systemctl enable docker >/dev/null 2>&1 || true
  systemctl start docker  >/dev/null 2>&1 || true

  docker info >/dev/null 2>&1 || die "Docker is installed but the daemon is not responding."

  if ! docker compose version >/dev/null 2>&1; then
    die "The Docker Compose v2 plugin is missing.
       Install 'docker-compose-plugin' for your distribution and re-run."
  fi
  skip "Docker Compose $(docker compose version --short)"
}

install_git() {
  if command -v git >/dev/null 2>&1; then
    skip "git already installed"
    return
  fi
  info "Installing git…"
  # shellcheck disable=SC1091
  . /etc/os-release
  case "${ID:-}" in
    ubuntu|debian|raspbian|pop) apt-get update -qq && apt-get install -y -qq git ;;
    centos|fedora|rhel|ol|rocky|amzn|almalinux) (dnf install -y -q git || yum install -y -q git) ;;
    sles|opensuse-leap|opensuse-tumbleweed) zypper --non-interactive install git ;;
    arch) pacman -Sy --noconfirm git ;;
    alpine) apk add --no-cache git ;;
    *) die "Cannot install git automatically on ${ID:-unknown}." ;;
  esac
}

# --------------------------------------------------------------------------
# 3. Filesystem
# --------------------------------------------------------------------------

create_directories() {
  # PEON_DATA_DIR must be identical inside the worker container and on the host
  # so the worker and the Docker daemon agree on what a path means.
  # See docs/server-modes.md.
  mkdir -p "$PEON_DIR"
  mkdir -p "$PEON_DATA_DIR"/{services,backups,proxy,storage,ping-pong}
  chmod 700 "$PEON_DATA_DIR"
  info "Data directory: ${PEON_DATA_DIR}"
}

fetch_source() {
  if [ -d "$PEON_DIR/.git" ]; then
    skip "Existing installation found at ${PEON_DIR}"
    info "Fetching updates…"
    git -C "$PEON_DIR" fetch --quiet origin "$PEON_REF"
    git -C "$PEON_DIR" checkout --quiet "$PEON_REF"
    git -C "$PEON_DIR" pull --quiet --ff-only origin "$PEON_REF" || \
      warn "Could not fast-forward; leaving the working tree as it is."
  else
    info "Cloning ${PEON_REPO} (${PEON_REF})…"
    git clone --quiet --branch "$PEON_REF" --depth 1 "$PEON_REPO" "$PEON_DIR"
  fi
}

# --------------------------------------------------------------------------
# 4. Secrets and configuration
# --------------------------------------------------------------------------

generate_secret_hex() { openssl rand -hex 32; }
generate_secret_b64() { openssl rand -base64 32; }

write_env() {
  local env_file="$PEON_DIR/.env"

  if [ -f "$env_file" ]; then
    # Never regenerate secrets for an existing installation: a new
    # ENCRYPTION_KEY would make every stored secret unreadable.
    skip "Existing .env preserved (secrets untouched)"
    return
  fi

  command -v openssl >/dev/null 2>&1 || die "openssl is required to generate secrets."

  local jwt_secret encryption_key db_password
  jwt_secret="$(generate_secret_hex)"
  encryption_key="$(generate_secret_b64)"
  db_password="$(openssl rand -hex 16)"

  # Written with a restrictive umask so secrets are never briefly world-readable.
  ( umask 077; cat > "$env_file" <<EOF
# Generated by install.sh on $(date -u +%Y-%m-%dT%H:%M:%SZ)
#
# ENCRYPTION_KEY is the master key for every stored secret: SSH keys, database
# passwords, environment variables, LLM credentials. BACK IT UP. Changing it
# makes existing data unreadable unless you rotate properly -- see
# docs/self-hosting.md.

NODE_ENV=production
PORT=${PEON_PORT}
APP_URL=http://localhost:${PEON_PORT}
NEXT_PUBLIC_APP_URL=http://localhost:${PEON_PORT}

POSTGRES_USER=peon
POSTGRES_PASSWORD=${db_password}
POSTGRES_DB=peon
DATABASE_URL=postgresql://peon:${db_password}@localhost:5432/peon?schema=public
DATABASE_URL_DOCKER=postgresql://peon:${db_password}@postgres:5432/peon?schema=public

JWT_SECRET=${jwt_secret}
ENCRYPTION_KEY=${encryption_key}

# Standalone defaults: no AWS account required.
QUEUE_DRIVER=postgres
STORAGE_DRIVER=local
EMAIL_DRIVER=test
PEON_DATA_DIR=${PEON_DATA_DIR}

# Configure SMTP to enable invitations, password reset and notifications:
# EMAIL_DRIVER=smtp
# SMTP_HOST=
# SMTP_PORT=587
# SMTP_USER=
# SMTP_PASSWORD=
EMAIL_FROM=no-reply@peon.local
EMAIL_FROM_NAME=Peon

INSTANCE_OWNER_EMAIL=

WORKER_POLL_WAIT_SECONDS=20
WORKER_MAX_CONCURRENCY=2
TERMINAL_WS_PORT=8081

# Optional AWS providers -- set QUEUE_DRIVER=sqs / STORAGE_DRIVER=s3 to use them.
# AWS_REGION=us-east-1
# AWS_ACCESS_KEY_ID=
# AWS_SECRET_ACCESS_KEY=
# SQS_DEPLOYMENT_QUEUE_URL=
# SQS_TASKS_QUEUE_URL=
# S3_BUCKET=
EOF
  )
  chmod 600 "$env_file"
  info "Generated .env with fresh secrets (mode 600)"
  warn "Back up ${env_file} — losing ENCRYPTION_KEY means losing every stored secret."
}

# --------------------------------------------------------------------------
# 5. Start
# --------------------------------------------------------------------------

start_stack() {
  cd "$PEON_DIR"
  info "Building images (first run takes several minutes)…"
  docker compose build --quiet
  info "Starting PostgreSQL, running migrations, starting Peon…"
  # --wait blocks until healthchecks pass and the migrate service exits 0.
  docker compose up -d --wait --wait-timeout 600
}

wait_for_health() {
  local url="http://127.0.0.1:${PEON_PORT}/api/health"
  for _ in $(seq 1 60); do
    if curl -fsS "$url" >/dev/null 2>&1; then
      info "Peon is responding on port ${PEON_PORT}"
      return 0
    fi
    sleep 2
  done
  warn "Peon did not become healthy within two minutes."
  warn "Inspect with:  cd ${PEON_DIR} && docker compose logs --tail 100"
  return 1
}

bootstrap_admin() {
  cd "$PEON_DIR"
  # Idempotent: prints an existing valid token rather than minting a second one.
  docker compose exec -T app pnpm exec tsx scripts/bootstrap-admin.ts 2>/dev/null || {
    warn "Could not create the bootstrap token automatically."
    warn "Run it manually:  cd ${PEON_DIR} && docker compose exec app pnpm exec tsx scripts/bootstrap-admin.ts"
    return 1
  }
}

# --------------------------------------------------------------------------
# Main
# --------------------------------------------------------------------------

main() {
  printf '\n%sPeon installer%s\n' "$BOLD" "$RESET"
  printf '%sSelf-hosted deployment platform — https://peon.sh%s\n' "$DIM" "$RESET"

  step "Checking this machine"
  require_root
  check_os
  check_arch
  check_resources
  check_ports

  step "Installing dependencies"
  install_docker
  install_git

  step "Preparing directories"
  create_directories

  step "Fetching Peon"
  fetch_source

  step "Configuring"
  write_env

  step "Starting Peon"
  start_stack
  wait_for_health || true

  step "Creating the first administrator"
  bootstrap_admin || true

  cat <<EOF

${GREEN}${BOLD}Peon is installed.${RESET}

  Dashboard   http://$(hostname -I 2>/dev/null | awk '{print $1}'):${PEON_PORT}
  Directory   ${PEON_DIR}
  Data        ${PEON_DATA_DIR}

${BOLD}Next steps${RESET}

  1. Open the setup link printed above to create your administrator account.
  2. Set a domain and enable HTTPS      — docs/self-hosting.md
  3. Configure SMTP for invitations     — EMAIL_DRIVER=smtp in ${PEON_DIR}/.env
  4. Deploy something to ${BOLD}This server${RESET}, which is already registered.

${BOLD}Managing${RESET}

  cd ${PEON_DIR}
  docker compose logs -f        # follow logs
  docker compose restart        # restart
  docker compose down           # stop
  git pull && docker compose up -d --build   # upgrade

${YELLOW}Back up ${PEON_DIR}/.env${RESET} — it holds ENCRYPTION_KEY, without which
every stored secret becomes unreadable.

EOF
}

main "$@"
