#!/bin/sh
set -e
# Custom start commands are often stored as a single string like "pnpm worker".
# The node image entrypoint then does `node "pnpm worker"` when pnpm isn't
# on PATH — map known aliases to the real process.

entry_for() {
  case "$1" in
    worker) echo "worker/index.ts" ;;
    schedule) echo "worker/schedule.ts" ;;
    socket) echo "worker/socket.ts" ;;
    *) return 1 ;;
  esac
}

if [ "$#" -eq 1 ]; then
  case "$1" in
    "pnpm worker"|"worker")
      exec node --import tsx worker/index.ts
      ;;
    "pnpm schedule"|"schedule")
      exec node --import tsx worker/schedule.ts
      ;;
    "pnpm socket"|"socket")
      exec node --import tsx worker/socket.ts
      ;;
  esac
fi

if [ "$1" = "pnpm" ] && [ -n "${2:-}" ]; then
  file="$(entry_for "$2" || true)"
  if [ -n "$file" ]; then
    shift 2
    exec node --import tsx "$file" "$@"
  fi
fi

file="$(entry_for "${1:-}" || true)"
if [ -n "$file" ]; then
  shift
  exec node --import tsx "$file" "$@"
fi

exec "$@"
