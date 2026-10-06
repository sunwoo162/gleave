import { ChannelType, Client, Guild } from "discord.js";
import { findProject, listProjects, withProjectDeleteLock, type StoredProject } from "./projects.js";
import { withDiscordChannelEnsureLock } from "./discord-channel-ensure-lock.js";

const ANNOUNCEMENT_CHANNEL_NAME = "📢・공지";
const DISCUSSION_CHANNEL_NAME = "💬・토론";

async function repairProjectDiscussionChannels(project: StoredProject, guild: Guild): Promise<void> {
  await withDiscordChannelEnsureLock(`project:${project.guildId}:${project.categoryId}`, async () => {
    const channels = await guild.channels.fetch();
    const category = channels.get(project.categoryId);
    if (!category || category.type !== ChannelType.GuildCategory) return;

    let children = channels.filter((channel) => channel?.parentId === category.id);
    const announcement = children.find((channel) =>
      channel?.type === ChannelType.GuildText
      && channel.name === ANNOUNCEMENT_CHANNEL_NAME,
    );

    if (!announcement) {
      const created = await guild.channels.create({
        name: ANNOUNCEMENT_CHANNEL_NAME,
        type: ChannelType.GuildText,
        parent: category.id,
        reason: `${project.name} 프로젝트 공지 채널 추가`,
      });

      const firstChildPosition = Math.min(
        ...children.map((channel) => channel?.position ?? Number.MAX_SAFE_INTEGER),
      );
      if (Number.isFinite(firstChildPosition) && firstChildPosition !== Number.MAX_SAFE_INTEGER) {
        await created.setPosition(firstChildPosition).catch(() => undefined);
      }

      console.log(`프로젝트 공지 채널 생성 완료: ${project.name}`);
      children = (await guild.channels.fetch()).filter((channel) => channel?.parentId === category.id);
    }

    const discussion = children.find((channel) =>
      channel?.type === ChannelType.GuildText
      && channel.name === DISCUSSION_CHANNEL_NAME,
    );

    if (discussion) return;

    const figma = children.find((channel) =>
      channel?.type === ChannelType.GuildText
      && channel.name === "🎨・figma",
    );

    const created = await guild.channels.create({
      name: DISCUSSION_CHANNEL_NAME,
      type: ChannelType.GuildText,
      parent: category.id,
      reason: `${project.name} 프로젝트 토론 채널 추가`,
    });

    if (figma) {
      await created.setPosition(figma.position + 1).catch(() => undefined);
    }

    console.log(`프로젝트 토론 채널 생성 완료: ${project.name}`);
  });
}

export async function ensureProjectDiscussionChannels(client: Client): Promise<void> {
  const projects = await listProjects();

  for (const project of projects) {
    try {
      const guild = client.guilds.cache.get(project.guildId)
        ?? await client.guilds.fetch(project.guildId).catch(() => null);
      if (!guild) continue;

      await withProjectDeleteLock(project.guildId, project.id, async () => {
        const current = await findProject(project.id);
        if (!current) return;
        await repairProjectDiscussionChannels(current, guild);
      });
    } catch (error) {
      console.error(`프로젝트 채널 확인 실패 (${project.name})`, error);
    }
  }
}
