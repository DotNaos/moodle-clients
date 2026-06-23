#!/usr/bin/env bash
set -euo pipefail

IMAGE="${MOODLE_DOCKER_IMAGE:-ghcr.io/dotnaos/moodle:latest}"
DEPLOY_DIR="${MOODLE_DEPLOY_DIR:-${HOME}/moodle-services}"
COMPOSE_FILE="${MOODLE_COMPOSE_FILE:-docker-compose.yml}"
COMPOSE_PROJECT="${MOODLE_COMPOSE_PROJECT:-}"
DOCKER_SERVICE="${MOODLE_DOCKER_SERVICE:-}"
HEALTH_URL="${MOODLE_HEALTH_URL:-http://127.0.0.1:8080/healthz}"
MIGRATIONS_DIR="${MOODLE_MIGRATIONS_DIR:-${DEPLOY_DIR}/migrations}"
POSTGRES_SERVICE="${MOODLE_POSTGRES_SERVICE:-postgres}"

if [[ ! -d "${DEPLOY_DIR}" ]]; then
  echo "Deploy directory not found: ${DEPLOY_DIR}" >&2
  exit 1
fi

if [[ ! -f "${DEPLOY_DIR}/${COMPOSE_FILE}" ]]; then
  echo "Compose file not found: ${DEPLOY_DIR}/${COMPOSE_FILE}" >&2
  exit 1
fi

cd "${DEPLOY_DIR}"

compose_args=(-f "${COMPOSE_FILE}")
if [[ -n "${COMPOSE_PROJECT}" ]]; then
  compose_args=(-p "${COMPOSE_PROJECT}" "${compose_args[@]}")
fi
compose_services=()
if [[ -n "${DOCKER_SERVICE}" ]]; then
  compose_services=("${DOCKER_SERVICE}")
fi

if [[ -n "${GHCR_TOKEN:-}" && -n "${GHCR_USERNAME:-}" ]]; then
  echo "Logging in to ghcr.io..."
  echo "${GHCR_TOKEN}" | docker login ghcr.io -u "${GHCR_USERNAME}" --password-stdin >/dev/null
fi

echo "Pulling ${IMAGE}..."
docker pull "${IMAGE}"

echo "Recreating moodle-services..."
docker compose "${compose_args[@]}" pull "${compose_services[@]}"
docker compose "${compose_args[@]}" up -d --remove-orphans "${compose_services[@]}"

if [[ -d "${MIGRATIONS_DIR}" ]]; then
  echo "Applying database migrations from ${MIGRATIONS_DIR}..."
  shopt -s nullglob
  migrations=("${MIGRATIONS_DIR}"/*.sql)
  if [[ "${#migrations[@]}" -eq 0 ]]; then
    echo "No migration files found."
  else
    POSTGRES_USER="${MOODLE_POSTGRES_USER:-$(docker compose "${compose_args[@]}" exec -T "${POSTGRES_SERVICE}" printenv POSTGRES_USER 2>/dev/null || true)}"
    POSTGRES_DB="${MOODLE_POSTGRES_DB:-$(docker compose "${compose_args[@]}" exec -T "${POSTGRES_SERVICE}" printenv POSTGRES_DB 2>/dev/null || true)}"
    POSTGRES_USER="${POSTGRES_USER:-postgres}"
    POSTGRES_DB="${POSTGRES_DB:-${POSTGRES_USER}}"
    for migration in "${migrations[@]}"; do
      echo "Applying $(basename "${migration}")..."
      docker compose "${compose_args[@]}" exec -T "${POSTGRES_SERVICE}" \
        psql -v ON_ERROR_STOP=1 -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" < "${migration}"
    done
  fi
else
  echo "Migration directory not found: ${MIGRATIONS_DIR}. Skipping database migrations."
fi

echo "Waiting for ${HEALTH_URL}..."
for _ in $(seq 1 30); do
  if curl -fsS "${HEALTH_URL}" >/dev/null; then
    curl -fsS "${HEALTH_URL}"
    echo
    echo "Deploy OK (${IMAGE})"
    exit 0
  fi
  sleep 2
done

echo "Health check failed after deploy." >&2
docker compose "${compose_args[@]}" ps >&2
exit 1
