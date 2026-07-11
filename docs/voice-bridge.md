# Discord Voice Bridge

## Flow

```text
Discord voice channel
  -> @discordjs/voice receiver
  -> utterance ends after VOICE_SILENCE_MS
  -> STT_URL receives multipart file=discord-utterance.wav
  -> HERMES_AGENT_URL receives the transcript
  -> POCKET_TTS_URL generates speech
  -> ffmpeg converts the audio to Discord-playable Ogg Opus
  -> @discordjs/voice player speaks in the same channel
```

Each spoken turn is also written to Miniva through the existing ingest contract:

- `POST /v1/runs` with `taskKind: "discord_voice"`
- `POST /v1/steps` for STT, Hermes, and Pocket TTS
- `POST /v1/runs/complete` after playback or failure

That keeps auth clean: Better Auth protects the product UI, while the voice
bridge uses the server ingest key already generated during Discord server setup.

## Local Dependencies

- Node 22+
- `ffmpeg` in PATH or `FFMPEG_PATH=/absolute/path/to/ffmpeg`
- A Discord bot token with permission to join/speak in the target voice channel
- An STT bridge, for example a Super Whisper wrapper exposing multipart
  `POST /transcribe`
- Kyutai Pocket TTS, usually served locally with `pocket-tts serve`
- A local reference voice such as `/Users/mac/Desktop/te2.mp3`, set through
  `POCKET_TTS_VOICE`

## Hermes Contract

The bridge posts to `HERMES_AGENT_URL`:

```json
{
  "message": "transcript from Discord voice",
  "input": "transcript from Discord voice",
  "source": "discord_voice",
  "runId": "voice_...",
  "discord": {
    "guildId": "...",
    "channelId": "...",
    "userId": "..."
  }
}
```

It accepts a reply from any of these fields:

```text
reply, response, content, text, message, answer
```

For local Hermes connected to Codex/tooling, set:

```bash
HERMES_AGENT_URL=hermes-cli://local
```

The bridge then invokes:

```bash
hermes chat -q "<task>" --yolo -Q --max-turns 8 --source miniva-voice-bridge
```

Switching to a deployed Hermes server remains a one-line env change:

```bash
HERMES_AGENT_URL=https://your-hermes.example/api/agent
```

## DEBUG Agent

Text command:

```text
DEBUG
```

The bridge posts a dedicated DEBUG payload to Hermes:

```json
{
  "agent": "DEBUG",
  "agentKey": "DEBUG",
  "skip_gemma4_evaluation": true,
  "debug": {
    "connector_test": "shell_ping_google",
    "command": "ping -c 3 google.com"
  }
}
```

The response is sent back into the Discord text channel. This gives a direct
smoke test that Hermes can leverage its Codex/shell connector before we trust it
inside the live voice loop.

## Pocket TTS Modes

Default Kyutai server mode, using the desktop voice file as the clone prompt:

```bash
POCKET_TTS_MODE=pocket
POCKET_TTS_URL=http://127.0.0.1:8000
POCKET_TTS_VOICE=/Users/mac/Desktop/te2.mp3
```

Request:

```text
POST /tts
Content-Type: multipart/form-data

text=...
voice_wav=@/Users/mac/Desktop/te2.mp3
```

OpenAI-compatible mode:

```bash
POCKET_TTS_MODE=openai
POCKET_TTS_URL=http://127.0.0.1:8000
```

Request:

```text
POST /v1/audio/speech
```
