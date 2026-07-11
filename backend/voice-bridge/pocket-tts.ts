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
  const form = new URLSearchParams();
  form.set("text", text);
  if (config.pocketTtsVoice) form.set("voice", config.pocketTtsVoice);

  const { buffer } = await fetchBuffer(
    url,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form,
    },
    config.hermesTimeoutMs,
  );
  return buffer;
}
