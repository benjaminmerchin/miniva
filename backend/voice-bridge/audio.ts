import { Readable } from "node:stream";
import { spawn } from "node:child_process";
import {
  AudioPlayerStatus,
  StreamType,
  createAudioResource,
  entersState,
  type AudioPlayer,
} from "@discordjs/voice";

export function pcmToWav(pcm: Buffer, sampleRate = 48_000, channels = 2): Buffer {
  const bitsPerSample = 16;
  const byteRate = (sampleRate * channels * bitsPerSample) / 8;
  const blockAlign = (channels * bitsPerSample) / 8;
  const header = Buffer.alloc(44);

  header.write("RIFF", 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write("data", 36);
  header.writeUInt32LE(pcm.length, 40);

  return Buffer.concat([header, pcm]);
}

export async function playTtsBuffer(player: AudioPlayer, audio: Buffer): Promise<void> {
  const ffmpeg = spawn(ffmpegBinary(), [
    "-hide_banner",
    "-loglevel",
    "error",
    "-i",
    "pipe:0",
    "-ac",
    "2",
    "-ar",
    "48000",
    "-c:a",
    "libopus",
    "-f",
    "ogg",
    "pipe:1",
  ]);

  Readable.from(audio).pipe(ffmpeg.stdin);
  const resource = createAudioResource(ffmpeg.stdout, { inputType: StreamType.OggOpus });
  player.play(resource);

  await entersState(player, AudioPlayerStatus.Playing, 10_000);
  await entersState(player, AudioPlayerStatus.Idle, 120_000);
}

function ffmpegBinary(): string {
  return process.env.FFMPEG_PATH ?? "ffmpeg";
}
