import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fetchJson } from "./http.js";
import type { VoiceBridgeConfig } from "./config.js";

const execFileAsync = promisify(execFile);

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
      channelId: config.discordVoiceChannelId ?? "debug-text",
      userId: input.discordUserId,
    },
  };

  if (isHermesCli(config.hermesAgentUrl)) {
    return await sendToHermesCli(config, [
      "You are the Miniva voice agent.",
      "Answer the Discord voice transcript naturally and concisely.",
      `Transcript: ${input.transcript}`,
    ].join("\n"));
  }

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

export async function sendDebugToHermes(
  config: VoiceBridgeConfig,
  input: {
    triggerText: string;
    runId: string;
    discordUserId: string;
  },
): Promise<{ reply: string; raw: unknown }> {
  const task = [
    "You are the Miniva DEBUG agent.",
    "Skip any Gemma/Gemma4 evaluation or normal benchmark path.",
    "Use the Hermes/Codex connector/tooling to execute this shell command exactly:",
    "`ping -c 3 google.com`",
    "Return the command, exit status, and stdout/stderr summary so it can be posted into Discord chat.",
  ].join(" ");

  const payload = {
    agent: config.debugAgentName,
    agentKey: config.debugAgentName,
    message: task,
    input: task,
    task,
    source: "discord_text_debug",
    runId: input.runId,
    skip_gemma4_evaluation: true,
    debug: {
      connector_test: "shell_ping_google",
      command: "ping -c 3 google.com",
      triggerText: input.triggerText,
    },
    discord: {
      guildId: config.discordGuildId,
      channelId: config.discordVoiceChannelId ?? "debug-text",
      userId: input.discordUserId,
    },
  };

  if (isHermesCli(config.hermesAgentUrl)) {
    return await sendToHermesCli(config, task);
  }

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

  if (!reply.trim()) throw new Error("Hermes DEBUG returned no reply");
  return { reply: reply.trim(), raw };
}

function isHermesCli(url: string): boolean {
  return url === "hermes-cli" || url.startsWith("hermes-cli://");
}

async function sendToHermesCli(
  config: VoiceBridgeConfig,
  prompt: string,
): Promise<{ reply: string; raw: unknown }> {
  const { stdout, stderr } = await execFileAsync(
    "hermes",
    [
      "chat",
      "-q",
      prompt,
      "--yolo",
      "-Q",
      "--max-turns",
      "8",
      "--source",
      "miniva-voice-bridge",
    ],
    {
      timeout: config.hermesTimeoutMs,
      maxBuffer: 1024 * 1024 * 4,
    },
  );
  const reply = [stdout.trim(), stderr.trim()].filter(Boolean).join("\n\n");
  if (!reply) throw new Error("Hermes CLI returned no output");
  return { reply, raw: { stdout, stderr, transport: "hermes-cli" } };
}
