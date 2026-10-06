import type { Guild, VoiceBasedChannel } from "discord.js";
import { clearMusicRuntime } from "./music.js";
import {
  getGuildVoiceConnection,
  leaveGuildVoiceChannel,
} from "./voice-connection.js";
import { stopStudySessionsForGuild } from "./voice-time.js";

const AUTO_LEAVE_DELAY_MS = 60_000;
const pendingLeaves = new Map<string, ReturnType<typeof setTimeout>>();

function clearPendingLeave(guildId: string): void {
  const timer = pendingLeaves.get(guildId);
  if (!timer) return;
  clearTimeout(timer);
  pendingLeaves.delete(guildId);
}

async function getConnectedVoiceChannel(guild: Guild): Promise<VoiceBasedChannel | null> {
  const channelId = getGuildVoiceConnection(guild.id)?.joinConfig.channelId;
  if (!channelId) return null;

  const channel = guild.channels.cache.get(channelId) ?? await guild.channels.fetch(channelId).catch(() => null);
  return channel?.isVoiceBased() ? channel : null;
}

function humanCount(channel: VoiceBasedChannel): number {
  return channel.members.filter((member) => !member.user.bot).size;
}

async function leaveIfStillEmpty(guild: Guild, expectedChannelId: string): Promise<void> {
  pendingLeaves.delete(guild.id);

  const connection = getGuildVoiceConnection(guild.id);
  if (!connection || connection.joinConfig.channelId !== expectedChannelId) return;

  const channel = await getConnectedVoiceChannel(guild);
  if (!channel || channel.id !== expectedChannelId) return;
  if (humanCount(channel) > 0) return;

  const stopped = await stopStudySessionsForGuild(guild.id);
  clearMusicRuntime(guild.id);
  const left = leaveGuildVoiceChannel(guild.id);

  if (left) {
    console.log(
      `음성 채널 자동 퇴장 (${guild.id}/${expectedChannelId}) · 사람 0명 · 공부 세션 ${stopped.length}개 저장`,
    );
  }
}

export async function handleVoiceAutoLeave(guild: Guild): Promise<void> {
  const channel = await getConnectedVoiceChannel(guild);

  if (!channel) {
    clearPendingLeave(guild.id);
    return;
  }

  if (humanCount(channel) > 0) {
    clearPendingLeave(guild.id);
    return;
  }

  if (pendingLeaves.has(guild.id)) return;

  const channelId = channel.id;
  const timer = setTimeout(() => {
    void leaveIfStillEmpty(guild, channelId).catch((error) => {
      pendingLeaves.delete(guild.id);
      console.error(`음성 채널 자동 퇴장 실패 (${guild.id}/${channelId})`, error);
    });
  }, AUTO_LEAVE_DELAY_MS);

  pendingLeaves.set(guild.id, timer);
  console.log(`음성 채널 자동 퇴장 대기 (${guild.id}/${channelId}): 60초`);
}
