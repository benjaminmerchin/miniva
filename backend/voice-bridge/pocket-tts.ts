import { existsSync, readFileSync } from "node:fs";
import { basename, extname } from "node:path";
import { endpoint, fetchBuffer } from "./http.js";
import type { VoiceBridgeConfig } from "./config.js";

export async function synthesizeWithPocketTts(
  config: VoiceBridgeConfig,
  text: string,
): Promise<Buffer> {
  if (config.pocketTtsMode === "openai") {
    const url = endpoint(config.pocketTtsUrl, "/v1/audio/speech");
    const { buffer } = await fetchBuffer(
      url,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: config.pocketTtsModel,
          voice: config.pocketTtsVoice ?? "default",
          input: text,
          response_format: "wav",
        }),
      },
      config.hermesTimeoutMs,
    );
    return buffer;
  }

  const url = endpoint(config.pocketTtsUrl, "/tts");
  const form = new FormData();
  form.set("text", text);
  appendPocketVoice(form, config.pocketTtsVoice);

  const { buffer } = await fetchBuffer(
    url,
    {
      method: "POST",
      body: form,
    },
    config.hermesTimeoutMs,
  );
  return buffer;
}

function appendPocketVoice(form: FormData, voice?: string): void {
  if (!voice) return;

  if (existsSync(voice)) {
    const bytes = readFileSync(voice);
    form.set(
      "voice_wav",
      new Blob([new Uint8Array(bytes)], { type: contentTypeForVoice(voice) }),
      basename(voice),
    );
    return;
  }

  form.set("voice_url", voice);
}

function contentTypeForVoice(path: string): string {
  switch (extname(path).toLowerCase()) {
    case ".mp3":
      return "audio/mpeg";
    case ".wav":
      return "audio/wav";
    case ".ogg":
    case ".opus":
      return "audio/ogg";
    case ".m4a":
      return "audio/mp4";
    default:
      return "application/octet-stream";
  }
}
