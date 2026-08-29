#!/usr/bin/env bash
# Dev Postgres in a container (podman or docker), no compose needed.
#   scripts/pg-dev.sh start | stop | psql | logs | destroy
# Databases created: pms (app) and pms_test (test suite). User/pass: pms/pms.
set -euo pipefail

ENGINE="${PMS_CONTAINER_ENGINE:-}"
if [ -z "$ENGINE" ]; then
  if command -v podman >/dev/null; then ENGINE=podman
  elif command -v docker >/dev/null; then ENGINE=docker
  else echo "need podman or docker" >&2; exit 1; fi
fi

NAME=pms-db
IMAGE="${PMS_PG_IMAGE:-docker.io/library/postgres:16}"
PORT="${PMS_PG_PORT:-5432}"

case "${1:-}" in
  start)
    if "$ENGINE" container exists "$NAME" 2>/dev/null || "$ENGINE" ps -a --format '{{.Names}}' | grep -qx "$NAME"; then
      "$ENGINE" start "$NAME"
    else
      "$ENGINE" run -d --name "$NAME" \
        -e POSTGRES_USER=pms -e POSTGRES_PASSWORD=pms -e POSTGRES_DB=pms \
        -p "${PORT}:5432" "$IMAGE"
    fi
    for _ in $(seq 1 30); do
      "$ENGINE" exec "$NAME" pg_isready -U pms >/dev/null 2>&1 && break
      sleep 1
    done
    "$ENGINE" exec "$NAME" psql -U pms -d pms -tc \
      "SELECT 1 FROM pg_database WHERE datname='pms_test'" | grep -q 1 \
      || "$ENGINE" exec "$NAME" createdb -U pms pms_test
    echo "Postgres up on 127.0.0.1:${PORT}  (db: pms / pms_test, user/pass: pms/pms)"
    ;;
  stop)    "$ENGINE" stop "$NAME" ;;
  psql)    shift; exec "$ENGINE" exec -it "$NAME" psql -U pms "${@:-pms}" ;;
  logs)    exec "$ENGINE" logs -f "$NAME" ;;
  destroy) "$ENGINE" rm -f "$NAME" ;;
  *) echo "usage: $0 {start|stop|psql|logs|destroy}" >&2; exit 1 ;;
esac
