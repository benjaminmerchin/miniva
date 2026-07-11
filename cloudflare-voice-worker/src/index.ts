import { Agent, routeAgentRequest } from "agents";
import {
  WorkersAIFluxSTT,
  WorkersAITTS,
  type VoiceTurnContext,
  withVoice,
} from "@cloudflare/voice";

export interface Env {
  AI: Ai;
  HermesVoiceAgent: DurableObjectNamespace<HermesVoiceAgent>;
  VPS_API_URL: string;
  VPS_SHARED_TOKEN?: string;
}

const VoiceAgent = withVoice(Agent);

type AgentTurnResponse = {
  reply?: string;
  source?: string;
};

export class HermesVoiceAgent extends VoiceAgent<Env> {
  transcriber = new WorkersAIFluxSTT(this.env.AI);
  tts = new WorkersAITTS(this.env.AI);

  async onTurn(transcript: string, context: VoiceTurnContext) {
    const apiUrl = this.env.VPS_API_URL.replace(/\/$/, "");
    const response = await fetch(`${apiUrl}/agents/turn`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(this.env.VPS_SHARED_TOKEN
          ? { "X-Agent-Token": this.env.VPS_SHARED_TOKEN }
          : {}),
      },
      body: JSON.stringify({
        transcript,
        agent: "voice",
        message_count: context.messages?.length ?? 0,
      }),
    });

    if (!response.ok) {
      return "The voice backend is not available right now.";
    }

    const data = (await response.json()) as AgentTurnResponse;
    return data.reply || "I heard you, but the backend returned no reply.";
  }
}

export default {
  async fetch(request: Request, env: Env) {
    return (
      (await routeAgentRequest(request, env)) ||
      new Response("Not found", { status: 404 })
    );
  },
} satisfies ExportedHandler<Env>;
