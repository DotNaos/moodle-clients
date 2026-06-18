#!/usr/bin/env bash
# Only supported entrypoint for the web dev server.
#
# The app must always run behind portless so it is reachable at a stable
# http://moodle.localhost URL (Clerk/OAuth redirects depend on the hostname,
# not a port). Keep this URL fixed so every web dev start lands in the same
# browser tab and cannot accidentally point at a branch-specific hostname.
#
# We hand off to dev-raw.sh *inside* portless (which assigns $PORT) and pass a
# sentinel so dev-raw.sh can refuse a direct, non-portless start.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/../../.." && pwd)"

if [[ "${MOODLE_CLIENTS_OP_ENV_LOADED:-}" != "1" && -f "$ROOT_DIR/.env.op" ]]; then
  exec op run --env-file="$ROOT_DIR/.env.op" -- env MOODLE_CLIENTS_OP_ENV_LOADED=1 bash "$0"
fi

exec env WEB_VIA_PORTLESS=1 portless moodle bash "$(dirname "$0")/dev-raw.sh"
