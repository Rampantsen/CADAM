#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND_DIR="$ROOT_DIR/backend"
cd "$ROOT_DIR"

log() {
  printf '\n[%s] %s\n' "$(date '+%H:%M:%S')" "$*"
}

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    printf 'Missing required command: %s\n' "$1" >&2
    exit 1
  fi
}

ensure_env_files() {
  if [ ! -f .env.local ]; then
    log "Creating .env.local from template"
    cp .env.local.template .env.local
  fi

  if [ ! -f "$BACKEND_DIR/.env" ]; then
    log "Creating backend/.env from template"
    cp "$BACKEND_DIR/.env.template" "$BACKEND_DIR/.env"
  fi
}

ensure_frontend_dependencies() {
  require_command npm

  if [ ! -x node_modules/.bin/vite ]; then
    log "Installing npm dependencies"
    npm ci
  fi
}

ensure_backend_dependencies() {
  require_command python3

  if [ ! -x "$BACKEND_DIR/.venv/bin/uvicorn" ]; then
    log "Creating backend virtual environment"
    python3 -m venv "$BACKEND_DIR/.venv"

    log "Installing backend dependencies"
    "$BACKEND_DIR/.venv/bin/pip" install -r "$BACKEND_DIR/requirements.txt"
  fi
}

main() {
  ensure_env_files
  ensure_frontend_dependencies
  ensure_backend_dependencies

  log "Starting FastAPI backend and Vite frontend"
  printf 'Backend:  http://127.0.0.1:8000\n'
  printf 'Frontend: http://localhost:6000/cadam\n'
  printf 'Mapped:   http://10.15.89.71:20330/cadam\n\n'

  (
    cd "$BACKEND_DIR"
    .venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
  ) &
  local backend_pid=$!

  npm run dev &
  local frontend_pid=$!

  cleanup() {
    kill "$backend_pid" "$frontend_pid" 2>/dev/null || true
  }
  trap cleanup INT TERM EXIT

  wait -n "$backend_pid" "$frontend_pid"
}

main "$@"
