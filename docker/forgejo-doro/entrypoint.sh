#!/usr/bin/env bash
set -euo pipefail

filebrowser_root="${OPENMANBO_FILEBROWSER_ROOT:-/app/.openmanbo}"
filebrowser_address="${OPENMANBO_FILEBROWSER_ADDRESS:-0.0.0.0}"
filebrowser_port="${OPENMANBO_FILEBROWSER_PORT:-8081}"
filebrowser_database="${OPENMANBO_FILEBROWSER_DATABASE:-/workspace/.filebrowser/filebrowser.db}"

mkdir -p "$(dirname "$filebrowser_database")"

filebrowser \
  --root "$filebrowser_root" \
  --address "$filebrowser_address" \
  --port "$filebrowser_port" \
  --database "$filebrowser_database" \
  --noauth &
filebrowser_pid=$!

node dist/cli/index.js daemon "$@" &
daemon_pid=$!

cleanup() {
  kill "$daemon_pid" "$filebrowser_pid" 2>/dev/null || true
}

trap cleanup INT TERM HUP

set +e
wait -n "$daemon_pid" "$filebrowser_pid"
status=$?
set -e

cleanup
wait "$daemon_pid" 2>/dev/null || true
wait "$filebrowser_pid" 2>/dev/null || true

exit "$status"