# Hermes Voice Streaming Architecture

## Goal

Users create a basic account, open the voice panel, record a voice sample, and
stream microphone audio to the VPS. The VPS stores samples, chunks, and
transcripts. Cloudflare Voice can host the real-time browser voice pipeline and
call back into the VPS for Hermes agent turns.

## Components

- `voice_api.py`: FastAPI app for auth, voice samples, live chunks, transcripts,
  and agent turn routing.
- `voice_core.py`: SQLite-backed service for users, signed tokens, files, live
  sessions, chunks, and transcripts.
- `static/panel/index.html`: browser panel using `MediaRecorder` for sample
  recording and chunk upload.
- `cloudflare-voice-worker/`: `@cloudflare/voice` Durable Object scaffold for
  browser WebSocket audio, Cloudflare STT/TTS, and persistence.

## VPS API

Set these environment variables on the VPS:

```bash
export VOICE_API_SECRET="replace-with-a-long-random-secret"
export VOICE_DB_PATH="/opt/hermes-voice/voice.sqlite3"
export VOICE_STORAGE_DIR="/opt/hermes-voice/storage"
export VOICE_AGENT_SHARED_TOKEN="replace-with-worker-shared-secret"
```

Start the API:

```bash
python -m pip install -r requirements.txt
uvicorn voice_api:app --host 0.0.0.0 --port 8080
```

Main endpoints:

- `POST /auth/register`: `{ "email": "...", "password": "..." }`
- `POST /auth/login`: returns a bearer token
- `GET /me`: current user
- `POST /voices`: multipart `label` plus audio `file`
- `GET /voices`: list samples for the current user
- `GET /voices/{voice_id}/content`: download sample
- `POST /voice-sessions`: create a live session
- `POST /voice-sessions/{session_id}/chunks`: multipart `seq` plus audio `file`
- `POST /voice-sessions/{session_id}/transcripts`: store Super Whisper text
- `POST /agents/turn`: server-to-server endpoint used by Cloudflare Voice

## Cloudflare Voice

The worker in `cloudflare-voice-worker/` uses `withVoice(Agent)`,
`WorkersAIFluxSTT`, and `WorkersAITTS`. Cloudflare receives browser microphone
audio over WebSocket, runs turn detection and STT, then calls:

```text
POST {VPS_API_URL}/agents/turn
```

The worker returns the VPS reply as TTS audio to the browser.

Deploy:

```bash
cd cloudflare-voice-worker
npm install
wrangler secret put VPS_SHARED_TOKEN
npm run deploy
```

Update `wrangler.jsonc` with the public VPS URL before deploying.

## Super Whisper

The API already accepts transcripts from a local or external Super Whisper
bridge through:

```text
POST /voice-sessions/{session_id}/transcripts
```

That makes Super Whisper an input provider. If Super Whisper is responsible for
all STT, the Cloudflare worker can be reduced to transport/TTS, or the panel can
continue uploading chunks while the Super Whisper bridge posts final transcripts.

## TTS / Inference Backend

The current `/agents/turn` endpoint returns a placeholder unless
`HERMES_VOICE_EXEC_ENABLED=true`. Once the Pocket TTS or inference backend URL is
available, plug it into this endpoint or replace the Cloudflare `WorkersAITTS`
provider with a custom provider that streams that backend's audio format.

## Discord Voice Caveat

`@cloudflare/voice` is a browser-to-Durable-Object voice stack. It does not join
Discord voice channels by itself. For a user speaking directly inside a Discord
voice channel, add a Discord voice bridge that captures Discord voice audio,
posts chunks/transcripts to the VPS API, and plays agent TTS back into the
Discord voice connection. The existing repository currently handles Discord
text/master delegation only.
