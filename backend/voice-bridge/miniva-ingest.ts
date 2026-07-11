import { fetchJson } from "./http.js";
import type { VoiceBridgeConfig } from "./config.js";

export type MinivaAgent = {
  key: string;
  version: number;
};

type MinivaConfig = {
  guildId: string;
  agents: MinivaAgent[];
};

export async function readCrew(config: VoiceBridgeConfig): Promise<MinivaConfig> {
  return await minivaFetch<MinivaConfig>(config, "/v1/config", { method: "GET" });
}

export async function startRun(
  config: VoiceBridgeConfig,
  input: {
    runId: string;
    transcript: string;
    discordUserId: string;
    agentVersions: MinivaAgent[];
  },
): Promise<void> {
  await minivaFetch(config, "/v1/runs", {
    method: "POST",
    body: JSON.stringify({
      runId: input.runId,
      taskKind: "discord_voice",
      input: input.transcript,
      discordChannelId: config.discordVoiceChannelId,
      discordUserId: input.discordUserId,
      agentVersions: input.agentVersions.map((agent) => ({
        key: agent.key,
        version: agent.version,
      })),
    }),
  });
}

export async function appendSteps(
  config: VoiceBridgeConfig,
  input: {
    runId: string;
    transcript: string;
    hermesReply?: string;
    ttsBytes?: number;
    startedAt: number;
  },
): Promise<void> {
  const hermesEndedAt = Date.now();
  const steps = [
    {
      runId: input.runId,
      stepId: "voice-stt",
      agentKey: "voice-concierge",
      type: "tool_call",
      name: "speech.transcribe",
      input: "discord voice",
      output: input.transcript,
      tokensIn: 0,
      tokensOut: 0,
      costUsd: 0,
      startedAt: input.startedAt,
      endedAt: input.startedAt,
      status: "ok",
    },
    {
      runId: input.runId,
      stepId: "hermes-turn",
      parentStepId: "voice-stt",
      agentKey: "ops-manager",
      type: "llm_call",
      name: "hermes.agent",
      input: input.transcript,
      output: input.hermesReply ?? "",
      tokensIn: 0,
      tokensOut: 0,
      costUsd: 0,
      startedAt: input.startedAt,
      endedAt: hermesEndedAt,
      status: "ok",
    },
    {
      runId: input.runId,
      stepId: "voice-tts",
      parentStepId: "hermes-turn",
      agentKey: "voice-concierge",
      type: "tool_call",
      name: "pocket-tts.speak",
      input: input.hermesReply ?? "",
      output: `${input.ttsBytes ?? 0} bytes`,
      tokensIn: 0,
      tokensOut: 0,
      costUsd: 0,
      startedAt: hermesEndedAt,
      endedAt: Date.now(),
      status: "ok",
    },
  ];

  await minivaFetch(config, "/v1/steps", {
    method: "POST",
    body: JSON.stringify({ steps }),
  });
}

export async function completeRun(
  config: VoiceBridgeConfig,
  input: { runId: string; outcome: string; error?: string },
): Promise<void> {
  await minivaFetch(config, "/v1/runs/complete", {
    method: "POST",
    body: JSON.stringify({
      runId: input.runId,
      status: input.error ? "failed" : "succeeded",
      outcome: input.outcome,
      error: input.error,
    }),
  });
}

async function minivaFetch<T>(
  config: VoiceBridgeConfig,
  path: string,
  init: RequestInit,
): Promise<T> {
  if (!config.minivaIngestKey) {
    throw new Error("MINIVA_INGEST_KEY is required for Miniva ingest");
  }
  return await fetchJson<T>(
    `${config.minivaBaseUrl.replace(/\/$/, "")}${path}`,
    {
      ...init,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.minivaIngestKey}`,
        ...init.headers,
      },
    },
    config.hermesTimeoutMs,
  );
}
