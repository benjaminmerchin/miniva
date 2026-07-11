# Miniva

**Give a Discord server an ops crew, and see every decision it made.**

Live: **[miniva.co](https://miniva.co)** · Demo account: `demo@miniva.co` / `miniva-demo-2026`
(there's a one-click "Open the demo account" button on the sign-in screen)

A manager agent reads what lands in the server, decides what it needs, and delegates to
specialists — docs answers, billing and refunds, moderation, a voice concierge. Miniva is
the control surface: define the roles, watch the crew work, see what it cost, and find out
where it went wrong.

Built on [Hermes](https://github.com/nousresearch/hermes-agent).

---

## For the mentor, in 60 seconds

| What you want to check | Where |
|---|---|
| **Trace tree** — who called whom, cost and tokens per step | `/app/runs/:runId` — click any run. Steps nest by `parentStepId`; the bar on the right is when in the run each step actually ran |
| **Diff two runs** — find where a regression started | `/app/runs/compare` — pick two runs, Miniva names the exact step where they diverged |
| **Alerts** — failures and cost spikes | `/app/alerts` — a run costing 3× this server's rolling baseline pages you |
| **Search and filter across runs** | `/app/runs` — by agent, by status, by free text over the trigger / outcome / error |
| **Evals, closed loop** | `/app/evals` — every failed or escalated run becomes a test case automatically. The chart is the score per version |
| **Management UI** | `/app/crew` — define a role (job, tools, guardrails) with no code. Saving bumps the version; Hermes re-reads it on the next message |

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
Discord ──► Hermes instance ──┬── GET  /v1/config       reads the crew Miniva defined
                              ├── POST /v1/runs         a task starts
                              ├── POST /v1/steps        every agent action, with parentStepId
                              └── POST /v1/runs/complete
                                        │
                                        ▼
                                    Convex  ◄──── Miniva writes agent roles, guardrails,
                                        │         prompt versions, eval cases
                                        ▼
                              miniva.co (Cloudflare)
                              live traces via Convex subscriptions
```

- **Convex** — database, the `/v1/*` ingest API as HTTP actions, Better Auth as a component,
  and real-time subscriptions so traces stream into the dashboard without polling.
- **Cloudflare** — hosts the SPA on `miniva.co`; a small worker in front of the assets sends
  `www` to the apex.
- **Vite + React + Tailwind + shadcn/ui + motion**.

`parentStepId` is the load-bearing field: it is what makes the trace a tree rather than a
list. Cost and tokens are attributed per step, not just per run.

## What is real and what is not

Stated plainly, because it changes how you should read the dashboard.

- **Real**: the platform, the Convex backend, the `/v1/*` ingest API (verified live — see the
  smoke test), auth, the deploy on `miniva.co`, email routing, and every feature in the table
  above.
- **Seeded**: the demo server's seven runs (`convex/seed.ts`) are fixtures, not agent output.
  They exist so the dashboard could be built and shown before the Hermes instance was
  provisioned, and they carry the exact shape Hermes posts — so when the real instance
  connects, nothing in the UI changes, the data just becomes real. **They are not presented as
  agent work.** Real runs are the ones ingested through `/v1/*`.

## Partner integrations

- **Convex** — the main backend. Product state, ingest API, auth, real-time subscriptions.
- **Cloudflare** — hosting, the www-redirect worker, and email routing on `miniva.co`.
- **Linkup** — exposed to agents as the `linkup.search` tool (live web search).
- **ElevenLabs** — exposed as `elevenlabs.speak`; the voice concierge joins a Discord voice
  channel and answers out loud.
- **Wispr Flow** — dictation during the build.

## Running it

```bash
pnpm install
npx convex dev                 # pushes the schema, generates types, watches
npx vite                       # http://localhost:5173
npx convex run seed:demo       # optional: the demo fixtures
node scripts/hermes-smoke.mjs  # prove the ingest contract works
```

Environment (`.env.local`, gitignored):

```
CONVEX_DEPLOY_KEY=...
VITE_CONVEX_URL=https://<deployment>.convex.cloud
VITE_CONVEX_SITE_URL=https://<deployment>.convex.site
VITE_SITE_URL=http://localhost:5173
```

## Discord Voice Bridge

The voice bridge joins a Discord voice channel, listens for user utterances,
sends them to STT, forwards the transcript to Hermes, generates speech with
Pocket TTS, and plays the reply back into the same channel.

For local desktop Hermes connected to Codex/tooling:

```bash
HERMES_AGENT_URL=hermes-cli://local
```

When Hermes moves to an HTTP server, VPS, or Cloudflare endpoint, only change
that value:

```bash
HERMES_AGENT_URL=http://127.0.0.1:8787/api/agent
```

Required bridge env:

```bash
DISCORD_BOT_TOKEN=replace-me
DISCORD_GUILD_ID=123456789012345678
DISCORD_VOICE_CHANNEL_ID=123456789012345678
MINIVA_BASE_URL=https://your-deployment.convex.site
MINIVA_INGEST_KEY=mnv_replace_me
HERMES_AGENT_URL=hermes-cli://local
STT_URL=http://127.0.0.1:9000/transcribe
POCKET_TTS_URL=http://127.0.0.1:8000
POCKET_TTS_MODE=pocket
POCKET_TTS_VOICE=/Users/mac/Desktop/te2.mp3
FFMPEG_PATH=ffmpeg
DEBUG_AGENT_NAME=DEBUG
DEBUG_TEXT_ONLY=false
```

Run it:

```bash
pnpm voice:bridge
```

The bridge authenticates to Miniva with `MINIVA_INGEST_KEY`, not a user session.
User-facing auth remains Better Auth in Convex; server-to-server trace ingest
uses the per-server bearer key.

## DEBUG Agent

When any Discord text message contains `DEBUG`, the bridge skips the normal
voice/chat path and asks Hermes for a connector test:

```text
agent: DEBUG
skip_gemma4_evaluation: true
command: ping -c 3 google.com
```

The Hermes response is posted back into the same Discord text channel. If a
voice transcript contains `DEBUG`, the same DEBUG agent path is used before
Pocket TTS speaks the result.

For a text-only DEBUG smoke test without joining a voice channel or writing
Miniva ingest traces, set:

```bash
DEBUG_TEXT_ONLY=true
```

## Checks

```bash
pnpm voice:check
pnpm build
pnpm lint
```
