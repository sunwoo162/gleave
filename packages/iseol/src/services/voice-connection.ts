import {
  VoiceConnectionStatus,
  entersState,
  getVoiceConnection,
  joinVoiceChannel,
  type VoiceConnection,
} from "@discordjs/voice";
import type { Guild, VoiceBasedChannel } from "discord.js";
import { stopStudySessionsForGuild } from "./voice-time.js";

export async function getUserVoiceChannel(guild: Guild, userId: string): Promise<VoiceBasedChannel> {
  const member = guild.members.cache.get(userId) ?? await guild.members.fetch(userId);
  const channel = member.voice.channel;
  if (!channel) throw new Error("먼저 음성 채널에 들어가주세요.");
  return channel;
}

export async function joinUserVoiceChannel(guild: Guild, userId: string): Promise<VoiceConnection> {
  const channel = await getUserVoiceChannel(guild, userId);
  const current = getVoiceConnection(guild.id);

  if (current && current.joinConfig.channelId === channel.id) return current;
  if (current?.joinConfig.channelId) {
    throw new Error(`이설이가 이미 <#${current.joinConfig.channelId}> 음성 채널에 있습니다. 먼저 /voice leave를 사용해주세요.`);
  }

  const connection = joinVoiceChannel({
    channelId: channel.id,
    guildId: guild.id,
    adapterCreator: guild.voiceAdapterCreator,
    selfDeaf: true,
  });

  connection.on("stateChange", (_oldState, newState) => {
    if (newState.status === VoiceConnectionStatus.Destroyed) {
      void stopStudySessionsForGuild(guild.id).catch((error) => {
        console.error(`음성 공부 시간 종료 처리 실패 (${guild.id})`, error);
      });
    }
  });

  try {
    await entersState(connection, VoiceConnectionStatus.Ready, 15_000);
    return connection;
  } catch (error) {
    connection.destroy();
    throw new Error(`음성 채널 연결에 실패했습니다: ${error instanceof Error ? error.message : "알 수 없는 오류"}`);
  }
}

export async function assertUserInBotVoiceChannel(guild: Guild, userId: string): Promise<void> {
  const connection = getVoiceConnection(guild.id);
  if (!connection?.joinConfig.channelId) throw new Error("이설이가 들어가 있는 음성 채널이 없습니다.");

  const channel = await getUserVoiceChannel(guild, userId);
  if (channel.id !== connection.joinConfig.channelId) {
    throw new Error("이설이와 같은 음성 채널에서 실행해주세요.");
  }
}

export function leaveGuildVoiceChannel(guildId: string): boolean {
  const connection = getVoiceConnection(guildId);
  if (!connection) return false;
  connection.destroy();
  return true;
}

export function getGuildVoiceConnection(guildId: string): VoiceConnection | undefined {
  return getVoiceConnection(guildId);
}
