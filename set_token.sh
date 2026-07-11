#!/usr/bin/env bash
# Safe token inserter — runs ONLY in your terminal, never inside the agent.
# Usage:  ./set_token.sh <APP_NAME> <TOKEN>
# Example: ./set_token.sh MASTER Nzk4NjYx...realbottoken
# The agent never reads or prints the token value; it only checks key presence.
set -euo pipefail

ENV_FILE="$HOME/.hermes/.env"
APP="$1"
TOKEN="$2"

if [ -z "$APP" ] || [ -z "$TOKEN" ]; then
  echo "Usage: $0 <APP_NAME> <TOKEN>" >&2
  exit 1
fi

KEY="DISCORD_BOT_TOKEN_${APP}"
# Remove any existing line for this key, then append fresh.
grep -v "^${KEY}=" "$ENV_FILE" > "${ENV_FILE}.tmp" || true
printf '%s=%s\n' "$KEY" "$TOKEN" >> "${ENV_FILE}.tmp"
mv "${ENV_FILE}.tmp" "$ENV_FILE"
chmod 600 "$ENV_FILE"

echo "Wrote $KEY to $ENV_FILE ($(printf '%s' "$TOKEN" | wc -c | tr -d ' ') chars). Agent can verify presence without seeing value."
