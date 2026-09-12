#!/usr/bin/env bash
set -euo pipefail

project_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$project_dir"

if [[ ! -d apps/web/node_modules ]]; then
  echo "Frontend dependencies are missing. Run: npm --prefix apps/web install" >&2
  exit 1
fi

server_pid=""
web_pid=""
cleanup() {
  [[ -z "$server_pid" ]] || kill "$server_pid" 2>/dev/null || true
  [[ -z "$web_pid" ]] || kill "$web_pid" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

npm run dev:server &
server_pid=$!
npm run dev:web &
web_pid=$!

node scripts/check-local.mjs --wait
echo "AllAbout Campus is ready at http://127.0.0.1:5174"

while kill -0 "$server_pid" 2>/dev/null && kill -0 "$web_pid" 2>/dev/null; do
  sleep 1
done

echo "One development service exited; stopping the other service." >&2
exit 1
