# Miniva

**Give a Discord server an ops crew, and see every decision it made.**

Live: **[miniva.co](https://miniva.co)** · Demo account: `demo@miniva.co` / `miniva-demo-2026`
(there's a one-click "Open the demo account" button on the sign-in screen)

A manager agent reads what lands in the server, decides what it needs, and delegates to
specialists - docs answers, billing and refunds, moderation, a voice concierge. Miniva is
the control surface: define the roles, watch the crew work, see what it cost, and find out
where it went wrong.

Built on [Hermes](https://github.com/nousresearch/hermes-agent).

---

## For the mentor, in 60 seconds

| What you want to check | Where |
|---|---|
| **Trace tree** - who called whom, cost and tokens per step | `/app/runs/:runId` - click any run. Steps nest by `parentStepId`; the bar on the right is when in the run each step actually ran |
| **Diff two runs** - find where a regression started | `/app/runs/compare` - pick two runs, Miniva names the exact step where they diverged |
| **Alerts** - failures and cost spikes | `/app/alerts` - a run costing 3x this server's rolling baseline pages you |
| **Search and filter across runs** | `/app/runs` - by agent, by status, by free text over the trigger / outcome / error |
| **Evals, closed loop** | `/app/evals` - every failed or escalated run becomes a test case automatically. The chart is the score per version |
| **Management UI** | `/app/crew` - define a role (job, tools, guardrails) with no code. Saving bumps the version; Hermes re-reads it on the next message |

## How Hermes is used

Both of the qualifying ways.

**As the base harness.** Hermes runs the crew. Miniva writes the agent config; Hermes reads
it from `GET /v1/config` and builds the crew from it. Hermes then posts its execution trace
back to Miniva as it works. The wire is documented in [CONTRACT.md](./CONTRACT.md), and
[`scripts/hermes-smoke.mjs`](./scripts/hermes-smoke.mjs) exercises it end to end against
production.

**As the coding partner.** This repo was built during the sprint; the commit history is the
receipt.

## Architecture

Convex is the shared memory. There is no other backend.

```
Discord -> Hermes instance --+-- GET  /v1/config       reads the crew Miniva defined
                             +-- POST /v1/runs         a task starts
                             +-- POST /v1/steps        every agent action, with parentStepId
                             +-- POST /v1/runs/complete
                                       |
                                       v
                                   Convex  <---- Miniva writes agent roles, guardrails,
                                       |          prompt versions, eval cases
                                       v
                             miniva.co (Cloudflare)
                             live traces via Convex subscriptions
```

- **Convex** - database, the `/v1/*` ingest API as HTTP actions, Better Auth as a component,
  and real-time subscriptions so traces stream into the dashboard without polling.
- **Cloudflare** - hosts the SPA on `miniva.co`; a small worker in front of the assets sends
  `www` to the apex.
- **Vite + React + Tailwind + shadcn/ui + motion**.

`parentStepId` is the load-bearing field: it is what makes the trace a tree rather than a
list. Cost and tokens are attributed per step, not just per run.

## The data is real

The runs in the dashboard are the actual sessions of the Hermes instance running the demo
Discord (`hermes-fra-01`), ingested through the `/v1/*` API by
[`scripts/hermes-bridge.mjs`](./scripts/hermes-bridge.mjs): every assistant turn, every tool
invocation with its real result, on the session's own timestamps. Development fixtures
existed earlier in the day (`convex/seed.ts` can recreate them) and were purged with
`seed:clearFixtures` once the real instance came online.

Two honest caveats: the Hermes session API does not expose token usage, so per-step cost
shows $0 on bridged runs; and bridged sessions are single-agent, so their traces are
shallower than the multi-specialist shape the UI is built for.

## Partner integrations

- **Convex** - the main backend. Product state, ingest API, auth, real-time subscriptions.
- **Cloudflare** - hosting, the www-redirect worker, and email routing on `miniva.co`.
- **Linkup** - exposed to agents as the `linkup.search` tool (live web search).
- **ElevenLabs** - exposed as `elevenlabs.speak`; the voice concierge joins a Discord voice
  channel and answers out loud.
- **Wispr Flow** - dictation during the build.

## Running Miniva

```bash
pnpm install
npx convex dev                 # pushes the schema, generates types, watches
npx vite                       # http://localhost:5173
npx convex run seed:demo       # optional: the demo fixtures
node scripts/hermes-smoke.mjs  # prove the ingest contract works
```

Environment (`.env.local`, gitignored):

```bash
CONVEX_DEPLOY_KEY=...
VITE_CONVEX_URL=https://<deployment>.convex.cloud
VITE_CONVEX_SITE_URL=https://<deployment>.convex.site
VITE_SITE_URL=http://localhost:5173
```

---

## Hermes Discord Fleet - M1

This repository also contains the local Hermes Discord fleet and voice stack. It is a
multi-bot Discord topology where a **Master** bot controls separate **sub-bots** (A/B/C),
each a distinct Discord application with its own bot token. Routing between them is done by
**@mention**, using Hermes' native anti-loop behavior so multiple bots can safely share one
channel.

```
Discord guild 1525451187959365703
  \- channel 1525451187959365706
        @HermesMaster   -> controller. Accepts `/delegate {agent}: {task}`
        @AgentA         -> sub-bot (role: drum)
        @AgentB         -> sub-bot (role: skill)
        @AgentC         -> sub-bot (role: dmcp)
```

Each bot is launched by its own `hermes gateway run --profile <NAME>`, reading its token
from `~/.hermes/.env` (`DISCORD_BOT_TOKEN_<NAME>`). The Master parses
`/delegate C: ...`, checks the sender is the authorized controller, and runs the task as a
Hermes subagent via the `hermes` CLI.

### Why M1

Hermes' Discord adapter stays silent when a message mentions another bot but not itself.
That gives clean conversation isolation per bot and avoids multiple Hermes bots
auto-replying to each other. Sub-bots only act when explicitly targeted.

### Setup

Create four Discord applications in the Discord Developer Portal:
`HermesMaster`, `AgentA`, `AgentB`, `AgentC`. For each bot, reset and copy the bot token,
enable **Server Members Intent** and **Message Content Intent**, then install it into the
guild with `bot` and `applications.commands` scopes.

Set tokens from your own terminal:

```bash
./set_token.sh MASTER <master-token>
./set_token.sh A      <agentA-token>
./set_token.sh B      <agentB-token>
./set_token.sh C      <agentC-token>
```

Run the fleet:

```bash
./run_fleet.sh          # launches configured gateway(s); Ctrl+C stops them together
```

Each bot's log lands in `logs/fleet_<NAME>.log`. The Discord voice bridge is
started by default and logs to `logs/voice_bridge.log`; set
`START_VOICE_BRIDGE=0 ./run_fleet.sh` for text-only operation. A successful
connect shows the bot **online** in the guild - if you instead see
`401 Improper token`, the token in `.env` is wrong (e.g. the public key,
application ID, client secret, or another non-bot value was pasted instead of
the Bot token from **Developer Portal -> Bot -> Reset Token**).

Test in Discord:

```text
@HermesMaster /delegate C: run the GD configurator
```

### Project layout

```text
router.py            pure routing logic (self/other_bot/general) - unit-tested
tests/test_router.py pytest covering all branches + multi-bot case
master_controller.py /delegate parse, authorize, run subagent via hermes CLI
run_fleet.sh         launches one gateway per bot; safe token handling
set_token.sh         writes tokens to .env without exposing them to the agent
config/bots.yaml     topology reference (app ids, roles, guild/channel)
voice_core.py        SQLite auth/storage core for voice samples and sessions
voice_api.py         FastAPI VPS API for auth, uploads, chunks, transcripts
static/panel/        browser panel for login, sample recording, live chunk upload
cloudflare-voice-worker/
                     Cloudflare Agents Voice scaffold using @cloudflare/voice
docs/voice_architecture.md
                     end-to-end voice streaming integration notes
```

### Voice API / VPS MVP

Install and run:

```bash
python -m pip install -r requirements.txt
export VOICE_API_SECRET="replace-with-a-long-random-secret"
uvicorn voice_api:app --host 0.0.0.0 --port 8080
```

Open the panel:

```text
http://127.0.0.1:8080/panel/
```

The API supports:

- `POST /auth/register` and `POST /auth/login` for basic email/password auth.
- `POST /voices` to store a recorded voice sample.
- `POST /voice-sessions` to create a live session.
- `POST /voice-sessions/{id}/chunks` to store microphone chunks.
- `POST /voice-sessions/{id}/transcripts` for Super Whisper transcript intake.
- `POST /agents/turn` for the Cloudflare Voice worker to request an agent reply.

Cloudflare Voice scaffold:

```bash
cd cloudflare-voice-worker
npm install
npm run dev
```

Before deploy, set `VPS_API_URL` in `cloudflare-voice-worker/wrangler.jsonc`. For the
server-to-server callback, set the same secret in Cloudflare and on the VPS:

```bash
wrangler secret put VPS_SHARED_TOKEN
export VOICE_AGENT_SHARED_TOKEN="same-secret"
```

See `docs/voice_architecture.md` for the full flow and the Discord voice bridge caveat.

## Docker / VPS deploy

The API and voice stack do not require Convex. The Miniva React frontend uses
Convex and needs the `VITE_*` values at build time.

Runtime secrets live in `~/.hermes/.env` on the host. Use
`config/hermes.env.example` as the checklist:

```bash
mkdir -p ~/.hermes
$EDITOR ~/.hermes/.env
```

The frontend build reads `VITE_CONVEX_URL`, `VITE_CONVEX_SITE_URL`, and
`VITE_SITE_URL` from that same file when `deploy.sh` runs. If you run
`docker compose` directly, export those variables in your shell or put them in
the project `.env`.

Start the Docker stack locally or on the VPS:

```bash
docker compose up -d --build
docker compose ps
```

Services:

```text
api           FastAPI voice API on 127.0.0.1:8080, proxied by nginx
gateway       Hermes Discord gateway using DISCORD_BOT_TOKEN_MASTER
voice_bridge  Discord voice listener + ElevenLabs STT/TTS
frontend      Miniva React app built from this repo and served by nginx
nginx         public HTTP entrypoint on port 80; routes API paths to api and / to frontend
```

Deploy directly on the server:

```bash
./deploy.sh
```

Deploy from this machine to the configured server alias `viz`
(`144.76.184.186`):

```bash
DEPLOY_HOST=viz DEPLOY_PATH=/opt/hermes_hackaton_discord ./deploy.sh remote
```

## Discord Voice Bridge

The Discord voice bridge joins voice channels, records user speech, sends audio
to ElevenLabs STT, routes the transcript through the Master controller, and
plays the final response back through ElevenLabs TTS.

Required values in `~/.hermes/.env`:

```bash
DISCORD_BOT_TOKEN_MASTER=<discord bot token from Bot -> Reset Token>
ELEVENLABS_API_KEY=<elevenlabs api key>
```

Run it through the normal fleet launcher:

```bash
./run_fleet.sh
```

The current py-cord voice receive path may warn about Discord DAVE/E2EE voice
reception. If `logs/voice_bridge.log` says the bot token does not look valid,
reset/copy the Bot token again in the Discord Developer Portal.

## Limitations

- `master_controller.py` delegates through a subprocess wrapper to the `hermes` CLI.
- `run_fleet.sh` launches each bot under its own Hermes profile (`--profile <NAME>`).
- A real bot token is required for any live connect. The public key shown in the portal is
  not a login token and will always 401.
- Cloudflare Voice handles browser microphone streaming to a Durable Object. It does not
  join Discord voice channels directly; a separate Discord voice bridge is needed for users
  speaking inside Discord voice.
