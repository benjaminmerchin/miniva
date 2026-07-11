# Hermes Cloudflare Voice Worker

This worker hosts the real-time browser voice agent through `@cloudflare/voice`.
The Python VPS API remains responsible for accounts, voice sample storage, live
chunk storage, Super Whisper transcript intake, and Hermes turn routing.

## Local setup

```bash
npm install
npm run dev
```

Set the VPS URL in `wrangler.jsonc`:

```jsonc
"vars": {
  "VPS_API_URL": "https://your-vps.example"
}
```

For a private server-to-server link, set the same shared secret on both sides:

```bash
wrangler secret put VPS_SHARED_TOKEN
export VOICE_AGENT_SHARED_TOKEN="same-secret"
```

## Client path

Cloudflare Agents route instances as:

```text
/agents/HermesVoiceAgent/{instance-name}
```

A browser client can use `useVoiceAgent({ agent: "HermesVoiceAgent", name })`
from `@cloudflare/voice/react`.
