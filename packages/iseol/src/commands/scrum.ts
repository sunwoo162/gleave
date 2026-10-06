import {
  AutocompleteInteraction,
  ChannelType,
  ChatInputCommandInteraction,
  EmbedBuilder,
  PermissionFlagsBits,
  SlashCommandBuilder,
  TextChannel,
} from "discord.js";
import {
  clearDailyScrumProject,
  DAILY_SCRUM_CHANNEL_NAME,
  findDailyScrumChannel,
  getDailyScrumRecord,
  previousSeoulDateKey,
  saveDailyScrumRecord,
} from "../services/daily-scrum.js";
import { findProject, listProjects, withProjectDeleteLock, type StoredProject } from "../services/projects.js";
import { seoulDateKey } from "../services/voice-time.js";
import { withDiscordChannelEnsureLock } from "../services/discord-channel-ensure-lock.js";
import { formatUserFacingError } from "../security/user-error.js";

export const scrumCommand = new SlashCommandBuilder()
  .setName("scrum")
  .setDescription("프로젝트 데일리 스크럼 채널과 기록을 관리합니다.")
  .addSubcommand((subcommand) =>
    subcommand
      .setName("create")
      .setDescription("선택한 프로젝트에 데일리 스크럼 채널을 생성합니다.")
      .addStringOption((option) =>
        option
          .setName("project")
          .setDescription("데일리 스크럼 채널을 만들 프로젝트")
          .setRequired(true)
          .setAutocomplete(true),
      ),
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName("write")
      .setDescription("오늘의 TODO와 DID를 기록합니다.")
      .addStringOption((option) =>
        option
          .setName("todo")
          .setDescription("오늘 할 일 (쉼표로 여러 개 구분)")
          .setRequired(true)
          .setMinLength(1)
          .setMaxLength(1000),
      )
      .addStringOption((option) =>
        option
          .setName("did")
          .setDescription("완료한 일 (선택, 전날 TODO에서 선택 가능)")
          .setRequired(false)
          .setAutocomplete(true)
          .setMaxLength(1000),
      ),
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName("delete")
      .setDescription("선택한 프로젝트의 데일리 스크럼 채널과 기록을 삭제합니다.")
      .addStringOption((option) =>
        option
          .setName("project")
          .setDescription("데일리 스크럼 채널을 삭제할 프로젝트")
          .setRequired(true)
          .setAutocomplete(true),
      ),
  );

function splitScrumItems(value: string): string[] {
  return value
    .split(/[,\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function formatScrumItems(value: string): string {
  const items = splitScrumItems(value);
  if (items.length === 0) return value.trim();
  return items.map((item, index) => `${index + 1}. ${item}`).join("\n");
}

async function listGuildProjects(guildId: string): Promise<StoredProject[]> {
  return (await listProjects()).filter((project) => project.guildId === guildId);
}

async function resolveCurrentProject(
  interaction: ChatInputCommandInteraction | AutocompleteInteraction,
): Promise<StoredProject | null> {
  if (!interaction.guild || !(interaction.channel instanceof TextChannel)) return null;

  const parentId = interaction.channel.parentId;
  if (!parentId) return null;

  const projects = await listGuildProjects(interaction.guild.id);
  return projects.find((project) => project.categoryId === parentId) ?? null;
}

async function resolveSelectedProject(
  interaction: ChatInputCommandInteraction,
): Promise<StoredProject | null> {
  if (!interaction.guildId) return null;

  const target = interaction.options.getString("project", true).trim();
  const normalized = target.toLowerCase();
  const projects = await listGuildProjects(interaction.guildId);
  return projects.find((project) =>
    project.categoryId === target
    || project.id === target
    || project.name.trim().toLowerCase() === normalized,
  ) ?? null;
}

async function respondProjectChoices(interaction: AutocompleteInteraction): Promise<void> {
  if (!interaction.guildId) {
    await interaction.respond([]);
    return;
  }

  const query = String(interaction.options.getFocused() ?? "").trim().toLowerCase();
  const projects = await listGuildProjects(interaction.guildId);
  const choices = projects
    .filter((project) => !query || project.name.toLowerCase().includes(query))
    .slice(0, 25)
    .map((project) => ({
      name: project.name.slice(0, 100),
      value: project.categoryId,
    }));

  await interaction.respond(choices);
}

export async function handleScrumAutocomplete(interaction: AutocompleteInteraction): Promise<void> {
  if (!interaction.inGuild() || !interaction.guild || interaction.commandName !== "scrum") return;

  let subcommand: string;
  try {
    subcommand = interaction.options.getSubcommand();
  } catch {
    await interaction.respond([]);
    return;
  }

  const focused = interaction.options.getFocused(true);
  if ((subcommand === "create" || subcommand === "delete") && focused.name === "project") {
    await respondProjectChoices(interaction);
    return;
  }

  if (subcommand !== "write" || focused.name !== "did") {
    await interaction.respond([]);
    return;
  }

  const project = await resolveCurrentProject(interaction);
  if (!project) {
    await interaction.respond([]);
    return;
  }

  const yesterday = previousSeoulDateKey();
  const yesterdayRecord = await getDailyScrumRecord(project.id, interaction.user.id, yesterday);
  const previousItems = splitScrumItems(yesterdayRecord?.todo ?? "");
  if (previousItems.length === 0) {
    await interaction.respond([]);
    return;
  }

  const rawFocused = String(focused.value ?? "");
  const parts = rawFocused.split(",");
  const query = (parts.pop() ?? "").trim().toLowerCase();
  const selected = parts.map((item) => item.trim()).filter(Boolean);
  const selectedLower = new Set(selected.map((item) => item.toLowerCase()));
  const prefix = selected.length > 0 ? `${selected.join(", ")}, ` : "";

  const choices: Array<{ name: string; value: string }> = [];
  const allValue = previousItems.join(", ");
  if (!rawFocused.trim() && allValue.length <= 100) {
    choices.push({ name: "✅ 전날 TODO 전체 선택", value: allValue });
  }

  for (const item of previousItems) {
    if (choices.length >= 25) break;
    if (selectedLower.has(item.toLowerCase())) continue;
    if (query && !item.toLowerCase().includes(query)) continue;

    const value = `${prefix}${item}`;
    if (value.length > 100) continue;

    choices.push({
      name: `${selected.length > 0 ? "+ " : ""}${item}`.slice(0, 100),
      value,
    });
  }

  await interaction.respond(choices.slice(0, 25));
}

function canManageScrumChannel(interaction: ChatInputCommandInteraction): boolean {
  return interaction.memberPermissions?.has(PermissionFlagsBits.ManageChannels) ?? false;
}

async function handleCreateScrumChannel(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.guild) return;

  if (!canManageScrumChannel(interaction)) {
    await interaction.reply({ content: "❌ 채널 관리 권한이 있는 사용자만 데일리 스크럼 채널을 생성할 수 있습니다.", ephemeral: true });
    return;
  }

  await interaction.deferReply({ ephemeral: true });
  const project = await resolveSelectedProject(interaction);
  if (!project) {
    await interaction.editReply("❌ 이설로 생성한 프로젝트를 찾을 수 없습니다.");
    return;
  }

  await withProjectDeleteLock(project.guildId, project.id, async () => {
    const current = await findProject(project.id);
    if (!current) {
      await interaction.editReply("❌ 이설로 생성한 프로젝트를 찾을 수 없습니다.");
      return;
    }

    await withDiscordChannelEnsureLock(`daily-scrum:${current.guildId}:${current.categoryId}`, async () => {
      const existing = await findDailyScrumChannel(interaction.guild!, current);
      if (existing) {
        await interaction.editReply(`ℹ️ **${current.name}** 프로젝트에는 이미 데일리 스크럼 채널이 있습니다.\n<#${existing.id}>`);
        return;
      }

      const category = await interaction.guild!.channels.fetch(current.categoryId).catch(() => null);
      if (!category || category.type !== ChannelType.GuildCategory) {
        await interaction.editReply("❌ 프로젝트 카테고리를 찾을 수 없습니다.");
        return;
      }

      try {
        const channel = await interaction.guild!.channels.create({
          name: DAILY_SCRUM_CHANNEL_NAME,
          type: ChannelType.GuildText,
          parent: category.id,
          reason: `${current.name} 데일리 스크럼 채널 사용자 생성`,
        });

        const children = await interaction.guild!.channels.fetch();
        const discussion = children.find((item) =>
          item?.type === ChannelType.GuildText
          && item.parentId === category.id
          && item.name === "💬・토론",
        );
        if (discussion) {
          await channel.setPosition(discussion.position + 1).catch(() => undefined);
        }

        await channel.send({
          content:
            "📋 **데일리 스크럼 채널입니다.**\n" +
            "`/scrum write todo:...`로 오늘 할 일을 기록하세요.\n" +
            "TODO/DID는 쉼표(`,`)로 여러 항목을 구분할 수 있습니다.\n" +
            "DID는 선택값이며 입력할 때 전날 TODO를 자동완성으로 선택할 수 있습니다.\n" +
            "매일 오전 8시(한국시간)에 @everyone 작성 알림이 전송됩니다.",
          allowedMentions: { parse: [] },
        });

        await interaction.editReply(`✅ **${current.name}** 프로젝트에 데일리 스크럼 채널을 생성했습니다.\n<#${channel.id}>`);
      } catch (error) {
        const message = formatUserFacingError(error);
        await interaction.editReply(`❌ 데일리 스크럼 채널 생성에 실패했습니다.\n\`${message}\``);
      }
    });
  });
}

async function handleDeleteScrumChannel(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.guild) return;

  if (!canManageScrumChannel(interaction)) {
    await interaction.reply({ content: "❌ 채널 관리 권한이 있는 사용자만 데일리 스크럼 채널을 삭제할 수 있습니다.", ephemeral: true });
    return;
  }

  await interaction.deferReply({ ephemeral: true });
  const project = await resolveSelectedProject(interaction);
  if (!project) {
    await interaction.editReply("❌ 이설로 생성한 프로젝트를 찾을 수 없습니다.");
    return;
  }

  await withProjectDeleteLock(project.guildId, project.id, async () => {
    const current = await findProject(project.id);
    if (!current) {
      await interaction.editReply("❌ 이설로 생성한 프로젝트를 찾을 수 없습니다.");
      return;
    }

    const channel = await findDailyScrumChannel(interaction.guild!, current);
    if (!channel) {
      await interaction.editReply(`ℹ️ **${current.name}** 프로젝트에는 데일리 스크럼 채널이 없습니다.`);
      return;
    }

    try {
      await channel.delete(`${current.name} 데일리 스크럼 채널 사용자 삭제`);
      const cleared = await clearDailyScrumProject(current.id);
      await interaction.editReply(
        `✅ **${current.name}** 프로젝트의 데일리 스크럼 채널을 삭제했습니다.\n저장된 스크럼 기록 **${cleared.toLocaleString("ko-KR")}개**도 함께 정리했습니다.`,
      );
    } catch (error) {
      const message = formatUserFacingError(error);
      await interaction.editReply(`❌ 데일리 스크럼 채널 삭제에 실패했습니다.\n\`${message}\``);
    }
  });
}

async function handleWriteScrum(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.guild) return;

  await interaction.deferReply({ ephemeral: true });

  const project = await resolveCurrentProject(interaction);
  if (!project) {
    await interaction.editReply("❌ 이설로 생성한 프로젝트 카테고리 안에서 사용해주세요.");
    return;
  }

  await withProjectDeleteLock(project.guildId, project.id, async () => {
    const current = await findProject(project.id);
    if (!current) {
      await interaction.editReply("❌ 이설로 생성한 프로젝트를 찾을 수 없습니다.");
      return;
    }

    const scrumChannel = await findDailyScrumChannel(interaction.guild!, current);
    if (!scrumChannel) {
      await interaction.editReply("❌ 이 프로젝트에는 데일리 스크럼 채널이 없습니다. 채널 관리 권한이 있는 사용자가 `/scrum create`로 먼저 생성해주세요.");
      return;
    }

    const now = new Date();
    const today = seoulDateKey(now);
    const todo = interaction.options.getString("todo", true).trim();
    const did = interaction.options.getString("did")?.trim() ?? "";
    const existing = await getDailyScrumRecord(current.id, interaction.user.id, today);

    const embed = new EmbedBuilder()
      .setAuthor({
        name: interaction.user.globalName ?? interaction.user.username,
        iconURL: interaction.user.displayAvatarURL(),
      })
      .setTitle(`📋 ${today} 데일리 스크럼`)
      .setFooter({ text: current.name })
      .setTimestamp(now);

    if (did) {
      embed.addFields({
        name: "✅ DID",
        value: formatScrumItems(did).slice(0, 1024),
      });
    }

    embed.addFields({
      name: "🎯 TODO",
      value: formatScrumItems(todo).slice(0, 1024),
    });

    let messageId = existing?.messageId ?? "";
    let channelId = existing?.channelId ?? scrumChannel.id;
    let updatedExisting = false;

    if (existing?.messageId && existing.channelId === scrumChannel.id) {
      const previousMessage = await scrumChannel.messages.fetch(existing.messageId).catch(() => null);
      if (previousMessage) {
        await previousMessage.edit({ embeds: [embed] });
        messageId = previousMessage.id;
        channelId = scrumChannel.id;
        updatedExisting = true;
      }
    }

    if (!updatedExisting) {
      const message = await scrumChannel.send({ embeds: [embed] });
      messageId = message.id;
      channelId = scrumChannel.id;
    }

    await saveDailyScrumRecord({
      guildId: interaction.guild!.id,
      projectId: current.id,
      userId: interaction.user.id,
      date: today,
      todo,
      did,
      channelId,
      messageId,
      updatedAt: now.toISOString(),
    });

    await interaction.editReply(
      `${updatedExisting ? "✅ 오늘 스크럼을 수정했습니다." : "✅ 오늘 스크럼을 기록했습니다."}\n<#${scrumChannel.id}>`,
    );
  });
}

export async function handleScrumCommand(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.inGuild() || !interaction.guild) {
    await interaction.reply({ content: "서버 안에서만 사용할 수 있습니다.", ephemeral: true });
    return;
  }

  const subcommand = interaction.options.getSubcommand();
  if (subcommand === "create") {
    await handleCreateScrumChannel(interaction);
    return;
  }
  if (subcommand === "delete") {
    await handleDeleteScrumChannel(interaction);
    return;
  }
  if (subcommand === "write") {
    await handleWriteScrum(interaction);
  }
}
