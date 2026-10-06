import { ChannelType, Client } from "discord.js";
import { listContestVotes } from "./contest-votes.js";
import { withDiscordChannelEnsureLock } from "./discord-channel-ensure-lock.js";

const ANNOUNCEMENT_CHANNEL_NAME = "📢・공지";

export async function ensureContestPrepAnnouncementChannels(client: Client): Promise<void> {
  const votes = await listContestVotes();
  const prepRooms = new Map<string, { guildId: string; categoryId: string; title: string }>();

  for (const vote of votes) {
    if (!vote.prepCategoryId) continue;
    prepRooms.set(`${vote.guildId}:${vote.prepCategoryId}`, {
      guildId: vote.guildId,
      categoryId: vote.prepCategoryId,
      title: vote.title,
    });
  }

  for (const prepRoom of prepRooms.values()) {
    try {
      const guild = client.guilds.cache.get(prepRoom.guildId)
        ?? await client.guilds.fetch(prepRoom.guildId).catch(() => null);
      if (!guild) continue;

      await withDiscordChannelEnsureLock(`contest-prep:${prepRoom.guildId}:${prepRoom.categoryId}`, async () => {
        const channels = await guild.channels.fetch();
        const category = channels.get(prepRoom.categoryId);
        if (!category || category.type !== ChannelType.GuildCategory) return;

        const children = channels.filter((channel) => channel?.parentId === category.id);
        const existing = children.find((channel) =>
          channel?.type === ChannelType.GuildText
          && channel.name === ANNOUNCEMENT_CHANNEL_NAME,
        );
        if (existing) return;

        const created = await guild.channels.create({
          name: ANNOUNCEMENT_CHANNEL_NAME,
          type: ChannelType.GuildText,
          parent: category.id,
          reason: `${prepRoom.title} 공모전 준비방 공지 채널 추가`,
        });

        const firstChildPosition = Math.min(
          ...children.map((channel) => channel?.position ?? Number.MAX_SAFE_INTEGER),
        );
        if (Number.isFinite(firstChildPosition) && firstChildPosition !== Number.MAX_SAFE_INTEGER) {
          await created.setPosition(firstChildPosition).catch(() => undefined);
        }

        console.log(`공모전 준비방 공지 채널 생성 완료: ${prepRoom.title}`);
      });
    } catch (error) {
      console.error(`공모전 준비방 공지 채널 확인 실패 (${prepRoom.title})`, error);
    }
  }
}
