#!/usr/bin/env sh
set -eu

if [ -z "${DISCORD_BOT_TOKEN:-}" ]; then
  if [ -z "${DISCORD_BOT_TOKEN_MASTER:-}" ]; then
    echo "DISCORD_BOT_TOKEN_MASTER is missing in ~/.hermes/.env" >&2
    exit 1
  fi
  export DISCORD_BOT_TOKEN="$DISCORD_BOT_TOKEN_MASTER"
fi

exec hermes gateway run --replace "$@"
