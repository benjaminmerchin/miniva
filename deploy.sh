#!/usr/bin/env bash
set -euo pipefail

BRANCH="${DEPLOY_BRANCH:-main}"
DEPLOY_HOST="${DEPLOY_HOST:-viz}"
DEPLOY_PATH="${DEPLOY_PATH:-/opt/hermes_hackaton_discord}"
COMPOSE_PROFILES="${COMPOSE_PROFILES:-}"
VOICE_API_PORT="${VOICE_API_PORT:-}"
HTTP_PORT="${HTTP_PORT:-}"
HERMES_ENV_FILE="${HERMES_ENV_FILE:-${HOME}/.hermes/.env}"

load_env_file() {
  if [ -f "$HERMES_ENV_FILE" ]; then
    set -a
    # shellcheck disable=SC1090
    . "$HERMES_ENV_FILE"
    set +a
  fi
}

compose() {
  if [ -n "$COMPOSE_PROFILES" ]; then
    docker compose --profile "$COMPOSE_PROFILES" "$@"
  else
    docker compose "$@"
  fi
}

deploy_here() {
  load_env_file

  echo "Pulling latest ${BRANCH}..."
  git pull --no-rebase --autostash origin "$BRANCH"

  echo "Stopping legacy native voice bridge if present..."
  pkill -f "python.*discord_voice_bridge.py" || true

  echo "Building and starting Docker services..."
  compose up -d --build --remove-orphans

  echo "Current service status:"
  compose ps
}

if [ "${1:-}" = "remote" ]; then
  echo "Deploying on ${DEPLOY_HOST}:${DEPLOY_PATH}..."
  ssh "$DEPLOY_HOST" "cd '$DEPLOY_PATH' && DEPLOY_BRANCH='$BRANCH' COMPOSE_PROFILES='$COMPOSE_PROFILES' VOICE_API_PORT='$VOICE_API_PORT' HTTP_PORT='$HTTP_PORT' ./deploy.sh"
else
  deploy_here
fi
