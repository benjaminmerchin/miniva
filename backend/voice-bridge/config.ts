import { existsSync, readFileSync } from "node:fs";

export type TtsMode = "pocket" | "openai";

export type VoiceBridgeConfig = {
  discordBotToken: string;
  discordGuildId: string;
  discordVoiceChannelId?: string;
  minivaBaseUrl: string;
  minivaIngestKey?: string;
  hermesAgentUrl: string;
  hermesTimeoutMs: number;
  pocketTtsUrl: string;
  pocketTtsMode: TtsMode;
  pocketTtsVoice?: string;
  pocketTtsModel: string;
  debugAgentName: string;
  sttUrl?: string;
  sttTimeoutMs: number;
  silenceMs: number;
  minUtteranceMs: number;
  debugTextOnly: boolean;
};

export function loadConfig(env = process.env): VoiceBridgeConfig {
  loadDotEnv(env);
  const debugTextOnly = boolEnv(env, "DEBUG_TEXT_ONLY", false);
  return {
    discordBotToken: required(env, "DISCORD_BOT_TOKEN"),
    discordGuildId: required(env, "DISCORD_GUILD_ID"),
    discordVoiceChannelId: debugTextOnly
      ? env.DISCORD_VOICE_CHANNEL_ID
      : required(env, "DISCORD_VOICE_CHANNEL_ID"),
    minivaBaseUrl: env.MINIVA_BASE_URL ?? env.MINIVA_BASE ?? "https://friendly-lion-451.convex.site",
    minivaIngestKey: debugTextOnly ? env.MINIVA_INGEST_KEY : required(env, "MINIVA_INGEST_KEY"),
    hermesAgentUrl: env.HERMES_AGENT_URL ?? "http://127.0.0.1:8787/api/agent",
    hermesTimeoutMs: intEnv(env, "HERMES_AGENT_TIMEOUT_MS", 60_000),
    pocketTtsUrl: env.POCKET_TTS_URL ?? "http://127.0.0.1:8000",
    pocketTtsMode: ttsMode(env.POCKET_TTS_MODE),
    pocketTtsVoice: env.POCKET_TTS_VOICE,
    pocketTtsModel: env.POCKET_TTS_MODEL ?? "pocket-tts",
    debugAgentName: env.DEBUG_AGENT_NAME ?? "DEBUG",
    sttUrl: env.STT_URL ?? env.SUPERWHISPER_URL,
    sttTimeoutMs: intEnv(env, "STT_TIMEOUT_MS", 60_000),
    silenceMs: intEnv(env, "VOICE_SILENCE_MS", 900),
    minUtteranceMs: intEnv(env, "VOICE_MIN_UTTERANCE_MS", 650),
    debugTextOnly,
  };
}

function loadDotEnv(env: NodeJS.ProcessEnv): void {
  const path = ".env";
  if (!existsSync(path)) return;
  const file = readFileSync(path, "utf8");
  for (const rawLine of file.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#") || !line.includes("=")) continue;
    const [key, ...rest] = line.split("=");
    const value = rest.join("=").trim().replace(/^['"]|['"]$/g, "");
    env[key.trim()] ??= value;
  }
}

function required(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name]?.trim();
  if (!value) throw new Error(`Missing required env var ${name}`);
  return value;
}

function intEnv(env: NodeJS.ProcessEnv, name: string, fallback: number): number {
  const raw = env[name];
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
  return parsed;
}

function boolEnv(env: NodeJS.ProcessEnv, name: string, fallback: boolean): boolean {
  const raw = env[name]?.toLowerCase();
  if (!raw) return fallback;
  return raw === "1" || raw === "true" || raw === "yes";
}

function ttsMode(raw: string | undefined): TtsMode {
  if (!raw) return "pocket";
  if (raw === "pocket" || raw === "openai") return raw;
  throw new Error("POCKET_TTS_MODE must be pocket or openai");
}
