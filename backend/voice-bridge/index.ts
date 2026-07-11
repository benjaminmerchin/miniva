import prism from "prism-media";
import { ChannelType, Client, GatewayIntentBits, type Message } from "discord.js";
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
import { sendDebugToHermes, sendToHermes } from "./hermes.js";
import { synthesizeWithPocketTts } from "./pocket-tts.js";
import { appendSteps, completeRun, readCrew, startRun } from "./miniva-ingest.js";

const config = loadConfig();
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.MessageContent,
  ],
});

const activeSpeakers = new Set<string>();
const player = createAudioPlayer();
let agentVersions: { key: string; version: number }[] = [];

// Discord.js can leave no ref'ed handles in text-only smoke mode after READY.
// Keep the process alive so the messageCreate handler remains active.
setInterval(() => undefined, 60_000);

client.once("ready", async () => {
  if (!client.user) throw new Error("Discord client has no user after ready");

  const guild = await client.guilds.fetch(config.discordGuildId);

  if (config.debugTextOnly) {
    console.log(
      `Miniva DEBUG text bridge ready as ${client.user.tag} in ${guild.name}`,
    );
    return;
  }

  if (!config.discordVoiceChannelId) {
    throw new Error("DISCORD_VOICE_CHANNEL_ID is required outside DEBUG_TEXT_ONLY");
  }

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

client.on("messageCreate", (message) => {
  if (message.author.bot) return;
  if (!isDebugInvocation(message.content)) return;

  void processDebugMessage(message).catch(async (error) => {
    const text = error instanceof Error ? error.message : String(error);
    console.error("DEBUG text handler failed", text);
    await sendLongMessage(message.channel, `DEBUG failed: ${text}`).catch((sendError) => {
      console.error("failed to send DEBUG failure to Discord", sendError);
    });
  });
});

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

    const hermes = isDebugInvocation(transcript)
      ? await sendDebugToHermes(config, {
          triggerText: transcript,
          runId,
          discordUserId: input.userId,
        })
      : await sendToHermes(config, {
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

async function processDebugMessage(message: Message) {
  const runId = `debug_${Date.now()}_${message.author.id}`;
  const startedAt = Date.now();

  console.log(
    `DEBUG text invocation ${runId} from ${message.author.tag} in channel ${message.channelId}`,
  );
  await sendLongMessage(
    message.channel,
    "DEBUG agent invoked. Asking Hermes to run `ping -c 3 google.com` through its connector/tooling...",
  );
  console.log(`DEBUG text invocation ${runId} acknowledgement sent`);

  await startRun(config, {
    runId,
    transcript: message.content,
    discordUserId: message.author.id,
    agentVersions,
  }).catch((error) => {
    if (config.minivaIngestKey) throw error;
  });

  try {
    console.log(`DEBUG text invocation ${runId} calling Hermes`);
    const hermes = await sendDebugToHermes(config, {
      triggerText: message.content,
      runId,
      discordUserId: message.author.id,
    });
    console.log(
      `DEBUG text invocation ${runId} Hermes reply received (${hermes.reply.length} chars)`,
    );
    if (config.minivaIngestKey) {
      await appendSteps(config, {
        runId,
        transcript: message.content,
        hermesReply: hermes.reply,
        startedAt,
      });
      await completeRun(config, {
        runId,
        outcome: `DEBUG connector test returned: ${hermes.reply.slice(0, 180)}`,
      });
    }
    await sendLongMessage(message.channel, `DEBUG result:\n${hermes.reply}`);
    console.log(`DEBUG text invocation ${runId} result sent to Discord`);
  } catch (error) {
    const text = error instanceof Error ? error.message : String(error);
    console.error(`DEBUG text invocation ${runId} failed`, text);
    if (config.minivaIngestKey) {
      await completeRun(config, {
        runId,
        outcome: "DEBUG connector test failed.",
        error: text,
      }).catch((ingestError) => console.error("failed to report debug failure", ingestError));
    }
    throw error;
  }
}

function isDebugInvocation(text: string): boolean {
  return /\bDEBUG\b/i.test(text);
}

async function sendLongMessage(channel: Message["channel"], text: string) {
  if (!("send" in channel)) {
    throw new Error("DEBUG response channel cannot send messages");
  }
  const maxLength = 1900;
  for (let i = 0; i < text.length; i += maxLength) {
    await channel.send(text.slice(i, i + maxLength));
  }
}
