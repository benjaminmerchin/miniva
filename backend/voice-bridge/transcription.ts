import { fetchJson } from "./http.js";
import type { VoiceBridgeConfig } from "./config.js";

type SttResponse = {
  text?: string;
  transcript?: string;
  transcription?: string;
};

export async function transcribeAudio(
  config: VoiceBridgeConfig,
  wav: Buffer,
): Promise<string> {
  if (!config.sttUrl) {
    throw new Error("No STT_URL/SUPERWHISPER_URL configured for voice transcription");
  }

  const form = new FormData();
  form.append(
    "file",
    new Blob([new Uint8Array(wav)], { type: "audio/wav" }),
    "discord-utterance.wav",
  );

  const data = await fetchJson<SttResponse>(
    config.sttUrl,
    { method: "POST", body: form },
    config.sttTimeoutMs,
  );
  return (
    data.text ??
    data.transcript ??
    data.transcription ??
    ""
  ).trim();
}
