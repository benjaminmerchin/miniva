---
name: hermes_discord_fleet_context
description: >
  Context about the M1 Discord Fleet architecture. Trigger this when modifying bots, master controller, or routing logic.
---

# Hermes Discord Fleet (M1 Architecture)

## Context
Multi-bot Discord topology.
Master bot (@HermesMaster) routes intents via OpenRouter (`router.py`) and delegates to Sub-Bots (AgentA, AgentB, AgentC).

## Structure
- `master_controller.py`: Receives `/delegate {agent}: {task}`, checks auth, runs `hermes delegate --goal ...` via subprocess.
- `router.py`: LLM routing logic mapping text to sub-agent name (Tripo, Taxy, Grogro, General).
- `voice_core.py` / `voice_api.py`: FastAPI backend for voice sessions and chunks.
- `cloudflare-voice-worker/`: Cloudflare worker for browser mic streaming.
- Sub-bots are distinct apps with separate tokens (handled in `~/.hermes/.env` via `set_token.sh`).

## Rules
- Sub-bots only act when explicitly targeted (@mention). No auto-reply loops.
- `run_fleet.sh` starts all bots.
- Avoid modifying core Hermes CLI behaviour; rely on subprocess wrapper for Master.
