#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

require_command() {
  local command_name="$1"

  if ! command -v "$command_name" >/dev/null 2>&1; then
    echo "Missing required command: $command_name" >&2
    exit 1
  fi
}

require_command npm
require_command uv

echo "Installing frontend dependencies..."
npm install --prefix "$ROOT_DIR/frontend"

echo "Installing desktop dependencies..."
npm install --prefix "$ROOT_DIR/desktop"

echo "Syncing backend Python environment with uv..."
uv sync --project "$ROOT_DIR/backend"

echo "Install complete."
echo "Run ./start.sh to launch GitOdyssey."
