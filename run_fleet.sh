#!/usr/bin/env bash
# run_fleet.sh — launch the single Discord orchestrator bot.
# The bot reads DISCORD_BOT_TOKEN_MASTER from ~/.hermes/.env and routes to
# internal personas (Tripo, Taxy, Grogro, DEBUG, General) in-process.
# Tokens are NEVER hard-coded here. Stop all with Ctrl+C (trap kills children).
set -euo pipefail

ENV_FILE="$HOME/.hermes/.env"
HERMES_BIN="$(command -v hermes)"
[ -x "$HERMES_BIN" ] || { echo "hermes not found in PATH" >&2; exit 1; }
[ -f "$ENV_FILE" ] || { echo "$ENV_FILE missing" >&2; exit 1; }
mkdir -p logs

get_env_value() {
  awk -F= -v key="$1" '$1 == key {value = substr($0, length(key) + 2)} END {if (value != "") print value}' "$ENV_FILE"
}

START_DISCORD_ORCHESTRATOR="${START_DISCORD_ORCHESTRATOR:-$(get_env_value START_DISCORD_ORCHESTRATOR)}"
START_DISCORD_ORCHESTRATOR="${START_DISCORD_ORCHESTRATOR:-1}"
DISCORD_ENABLE_VOICE="${DISCORD_ENABLE_VOICE:-$(get_env_value DISCORD_ENABLE_VOICE)}"
DISCORD_ENABLE_VOICE="${DISCORD_ENABLE_VOICE:-0}"
STOP_HERMES_GATEWAY="${STOP_HERMES_GATEWAY:-$(get_env_value STOP_HERMES_GATEWAY)}"
STOP_HERMES_GATEWAY="${STOP_HERMES_GATEWAY:-1}"

python_has_voice_deps() {
  "$1" -c 'import discord, elevenlabs, dotenv' >/dev/null 2>&1
}

find_voice_python() {
  if [ -n "${PYTHON_BIN:-}" ]; then
    if python_has_voice_deps "$PYTHON_BIN"; then
      echo "$PYTHON_BIN"
      return 0
    fi
    return 1
  fi

  for candidate in python python3; do
    if command -v "$candidate" >/dev/null 2>&1 && python_has_voice_deps "$candidate"; then
      command -v "$candidate"
      return 0
    fi
  done
  return 1
}

PIDS=()
cleanup() {
  echo ""
  echo "Stopping fleet..."
  if [ ${#PIDS[@]} -gt 0 ]; then
    for pid in "${PIDS[@]}"; do
      [ -n "$pid" ] && kill "$pid" 2>/dev/null || true
    done
    wait 2>/dev/null || true
  fi
  echo "All bots stopped."
}
trap cleanup EXIT INT TERM

if [ "$START_DISCORD_ORCHESTRATOR" = "1" ]; then
  if grep -q "^DISCORD_BOT_TOKEN_MASTER=.\{1,\}" "$ENV_FILE"; then
    if VOICE_PYTHON="$(find_voice_python)"; then
      if [ "$STOP_HERMES_GATEWAY" = "1" ]; then
        echo "Stopping built-in Hermes gateway to avoid duplicate Discord sessions..."
        "$HERMES_BIN" gateway stop >/dev/null 2>&1 || true
      fi
      echo "Launching Discord orchestrator with $VOICE_PYTHON (logs/discord_orchestrator.log)"
      PYTHONUNBUFFERED=1 \
        DISCORD_ENABLE_VOICE="$DISCORD_ENABLE_VOICE" \
        "$VOICE_PYTHON" discord_voice_bridge.py >>"logs/discord_orchestrator.log" 2>&1 &
      PIDS+=("$!")
    else
      echo "SKIP Discord orchestrator: no Python interpreter with discord, elevenlabs, and dotenv installed." >&2
    fi
  else
    echo "SKIP Discord orchestrator: DISCORD_BOT_TOKEN_MASTER not set in $ENV_FILE" >&2
  fi
else
  echo "Discord orchestrator disabled (START_DISCORD_ORCHESTRATOR=$START_DISCORD_ORCHESTRATOR)."
fi

if [ ${#PIDS[@]} -eq 0 ]; then
  echo "No bot launched — set DISCORD_BOT_TOKEN_MASTER first with ./set_token.sh MASTER <token>" >&2
  exit 1
fi

echo "Fleet running (${#PIDS[@]} process(es)). Ctrl+C to stop."
wait
