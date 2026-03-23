#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_VENV_PYTHON="$ROOT_DIR/backend/.venv/bin/python"
BACKEND_VENV_PYTHON3="$ROOT_DIR/backend/.venv/bin/python3"
SKIP_DB=0

if [[ -f "$ROOT_DIR/.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "$ROOT_DIR/.env"
  set +a
fi

if [[ "${SKIP_DB_CONTAINER:-0}" == "1" ]]; then
  SKIP_DB=1
fi

print_usage() {
  cat <<'EOF'
Usage: ./start.sh [--skip-db]

Options:
  --skip-db    Do not start the bundled PostgreSQL container.
EOF
}

require_command() {
  local command_name="$1"

  if ! command -v "$command_name" >/dev/null 2>&1; then
    echo "Missing required command: $command_name" >&2
    exit 1
  fi
}

while (($# > 0)); do
  case "$1" in
    --skip-db)
      SKIP_DB=1
      shift
      ;;
    -h|--help)
      print_usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      print_usage >&2
      exit 1
      ;;
  esac
done

if [[ "$SKIP_DB" -eq 0 ]]; then
  require_command docker
fi

require_command npm

if [[ ! -d "$ROOT_DIR/frontend/node_modules" || ! -d "$ROOT_DIR/desktop/node_modules" ]]; then
  echo "JavaScript dependencies are missing." >&2
  echo "Run ./install.sh first." >&2
  exit 1
fi

if [[ ! -x "$BACKEND_VENV_PYTHON" && ! -x "$BACKEND_VENV_PYTHON3" ]]; then
  echo "The backend virtual environment was not found at backend/.venv." >&2
  echo "Run ./install.sh first." >&2
  exit 1
fi

if [[ "$SKIP_DB" -eq 0 ]]; then
  echo "Starting local PostgreSQL..."
  if ! docker compose -f "$ROOT_DIR/docker-compose.yml" up -d db; then
    cat >&2 <<'EOF'
Failed to start the bundled PostgreSQL container.

If this is the first run, Docker needs network access to pull
`pgvector/pgvector:pg16`. The error you saw usually means Docker cannot
reach Docker Hub right now.

Try one of these:
1. Restore Docker/Desktop network access and retry `./start.sh`.
2. Pre-pull the image manually with `docker pull pgvector/pgvector:pg16`.
3. If you already have PostgreSQL running elsewhere, start without the bundled
   container by using `./start.sh --skip-db`.
EOF
    exit 1
  fi
else
  echo "Skipping bundled PostgreSQL startup."
fi

echo "Launching GitOdyssey desktop development app..."
npm --prefix "$ROOT_DIR" run desktop:dev
