import { fetchJson } from "./http.js";
import type { VoiceBridgeConfig } from "./config.js";

type HermesResponse = {
  reply?: string;
  response?: string;
  content?: string;
  text?: string;
  message?: string;
  answer?: string;
};

export async function sendToHermes(
  config: VoiceBridgeConfig,
  input: {
    transcript: string;
    runId: string;
    discordUserId: string;
  },
): Promise<{ reply: string; raw: unknown }> {
  const payload = {
    message: input.transcript,
    input: input.transcript,
    source: "discord_voice",
    runId: input.runId,
    discord: {
      guildId: config.discordGuildId,
      channelId: config.discordVoiceChannelId,
      userId: input.discordUserId,
    },
  };

  const raw = await fetchJson<HermesResponse>(
    config.hermesAgentUrl,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    },
    config.hermesTimeoutMs,
  );

  const reply =
    raw.reply ??
    raw.response ??
    raw.content ??
    raw.text ??
    raw.message ??
    raw.answer ??
    "";

  if (!reply.trim()) throw new Error("Hermes returned no speakable reply");
  return { reply: reply.trim(), raw };
}
