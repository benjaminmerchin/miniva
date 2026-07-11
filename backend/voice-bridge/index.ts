import prism from "prism-media";
import { Client, GatewayIntentBits, ChannelType } from "discord.js";
import {
  AudioPlayerStatus,
  EndBehaviorType,
  type VoiceReceiver,
  VoiceConnectionStatus,
  createAudioPlayer,
  entersState,
  joinVoiceChannel,
} from "@discordjs/voice";
import { loadConfig } from "./config.js";
import { pcmToWav, playTtsBuffer } from "./audio.js";
import { transcribeAudio } from "./transcription.js";
import { sendToHermes } from "./hermes.js";
import { synthesizeWithPocketTts } from "./pocket-tts.js";
import { appendSteps, completeRun, readCrew, startRun } from "./miniva-ingest.js";

const config = loadConfig();
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates],
});

const activeSpeakers = new Set<string>();
const player = createAudioPlayer();
let agentVersions: { key: string; version: number }[] = [];

client.once("ready", async () => {
  if (!client.user) throw new Error("Discord client has no user after ready");

  const guild = await client.guilds.fetch(config.discordGuildId);
  const channel = await guild.channels.fetch(config.discordVoiceChannelId);
  if (!channel || channel.type !== ChannelType.GuildVoice) {
    throw new Error("DISCORD_VOICE_CHANNEL_ID must point to a guild voice channel");
  }

  const crew = await readCrew(config);
  agentVersions = crew.agents.map(({ key, version }) => ({ key, version }));

  const connection = joinVoiceChannel({
    guildId: guild.id,
    channelId: channel.id,
    adapterCreator: guild.voiceAdapterCreator,
    selfDeaf: false,
  });
  connection.subscribe(player);
  await entersState(connection, VoiceConnectionStatus.Ready, 30_000);

  connection.receiver.speaking.on("start", (userId) => {
    void captureUtterance(connection.receiver, userId).catch((error) => {
      console.error("voice turn failed", error);
    });
  });

  console.log(
    `Miniva voice bridge ready as ${client.user.tag} in ${guild.name} / ${channel.name}`,
  );
});

client.login(config.discordBotToken);

async function captureUtterance(receiver: VoiceReceiver, userId: string) {
  if (activeSpeakers.has(userId)) return;
  if (player.state.status !== AudioPlayerStatus.Idle) return;
  activeSpeakers.add(userId);

  const startedAt = Date.now();
  const opus = receiver.subscribe(userId, {
    end: { behavior: EndBehaviorType.AfterSilence, duration: config.silenceMs },
  });
  const decoder = new prism.opus.Decoder({
    rate: 48_000,
    channels: 2,
    frameSize: 960,
  });
  const chunks: Buffer[] = [];

  await new Promise<void>((resolve, reject) => {
    opus.pipe(decoder);
    decoder.on("data", (chunk: Buffer) => chunks.push(chunk));
    decoder.once("end", resolve);
    decoder.once("error", reject);
    opus.once("error", reject);
  }).finally(() => activeSpeakers.delete(userId));

  const pcm = Buffer.concat(chunks);
  const durationMs = Math.round(pcm.length / (48_000 * 2 * 2) * 1000);
  if (durationMs < config.minUtteranceMs) return;

  await processTurn({
    userId,
    wav: pcmToWav(pcm),
    startedAt,
  });
}

async function processTurn(input: {
  userId: string;
  wav: Buffer;
  startedAt: number;
}) {
  const runId = `voice_${Date.now()}_${input.userId}`;
  let transcript = "";

  try {
    transcript = await transcribeAudio(config, input.wav);
    if (!transcript) return;

    await startRun(config, {
      runId,
      transcript,
      discordUserId: input.userId,
      agentVersions,
    });

    const hermes = await sendToHermes(config, {
      transcript,
      runId,
      discordUserId: input.userId,
    });
    const audio = await synthesizeWithPocketTts(config, hermes.reply);

    await appendSteps(config, {
      runId,
      transcript,
      hermesReply: hermes.reply,
      ttsBytes: audio.length,
      startedAt: input.startedAt,
    });
    await playTtsBuffer(player, audio);
    await completeRun(config, {
      runId,
      outcome: `Answered a Discord voice turn: ${hermes.reply.slice(0, 180)}`,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`voice turn ${runId} failed`, message);
    if (transcript) {
      await completeRun(config, {
        runId,
        outcome: "Discord voice turn failed before playback.",
        error: message,
      }).catch((ingestError) => console.error("failed to report run failure", ingestError));
    }
  }
}
