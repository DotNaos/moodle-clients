#!/usr/bin/env bash
# Real dev-server launch, expected to run inside `portless` (see dev.sh).
# Refuses to start directly unless explicitly allowed, so the dev server can
# never come up on a bare port by accident.
set -euo pipefail

if [[ "${WEB_VIA_PORTLESS:-}" != "1" && "${WEB_ALLOW_DIRECT:-}" != "1" ]]; then
  echo "✋ The web dev server must be started through portless."
  echo "   Use:  bun run dev            (from apps/web)"
  echo "   Or:   bun run web:dev        (from the repo root)"
  echo "   To bypass intentionally:  WEB_ALLOW_DIRECT=1 bun run dev"
  exit 1
fi

if [[ -z "${CLERK_SECRET_KEY:-}" || -z "${NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY:-}" ]]; then
  echo "Missing Clerk dev keys."
  echo "Start the web app with: bun run web:dev"
  echo "That command loads .env.op through 1Password before Next.js starts."
  exit 1
fi

exec bun next dev --hostname 0.0.0.0 --port "${PORT:-3008}"
