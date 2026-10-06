import {
  ButtonInteraction,
  ChannelType,
  ChatInputCommandInteraction,
  EmbedBuilder,
  SlashCommandBuilder,
  TextChannel,
} from "discord.js";
import {
  contestAudienceFilterLabel,
  contestInfoEmbed,
  contestVoteComponents,
  contestVoteEmbed,
  createContestFeed,
  findContestFeed,
  getEligibleHumans,
  majorityOf,
  repostContest,
  setContestAudienceFilter,
  syncContestFeed,
  type ContestAudienceFilter,
} from "../services/contest-feed.js";
import { formatUserFacingError } from "../security/user-error.js";
import {
  findContestVote,
  listContestVotesByUser,
  updateContestVote,
  withContestVoteLock,
  type ContestVote,
} from "../services/contest-votes.js";

export const contestCommand = new SlashCommandBuilder()
  .setName("contest")
  .setDescription("IT 공모전 자동 수집 공간을 관리합니다.")
  .addSubcommand((subcommand) => subcommand
    .setName("setup")
    .setDescription("공모전 카테고리와 자동 수집 채널을 생성합니다."))
  .addSubcommand((subcommand) => subcommand
    .setName("filter")
    .setDescription("참가대상 기준으로 새 공모전을 필터링합니다.")
    .addStringOption((option) => option
      .setName("target")
      .setDescription("공모전에 참가할 사람의 대상")
      .setRequired(true)
      .addChoices(
        { name: "전체 (필터 없음)", value: "all" },
        { name: "고등학생", value: "high-school" },
        { name: "대학생", value: "university" },
      )))
  .addSubcommand((subcommand) => subcommand
    .setName("repost")
    .setDescription("테스트용으로 이미 게시한 공모전을 다시 올립니다.")
    .addStringOption((option) => option
      .setName("name")
      .setDescription("다시 올릴 공모전 이름 또는 이름 일부")
      .setRequired(true)))
  .addSubcommand((subcommand) => subcommand
    .setName("my-votes")
    .setDescription("내가 투표한 공모전 목록을 확인합니다."));

const processingVotes = new Set<string>();

function voterMentions(voterIds: string[]): string {
  if (voterIds.length === 0) return "아직 투표한 사람이 없습니다.";
  return voterIds.map((id) => `<@${id}>`).join(" ");
}

function escapeMarkdownLinkText(value: string): string {
  return value.replace(/([\\[\]])/g, "\\$1");
}

function parseAudienceFilter(value: string): ContestAudienceFilter {
  if (value === "all" || value === "high-school" || value === "university") return value;
  throw new Error("지원하지 않는 참가대상 필터입니다.");
}

function normalizeContestTitle(title: string): string {
  return title
    .normalize("NFKC")
    .toLowerCase()
    .replace(/제\s*\d+\s*회/g, "")
    .replace(/[\[\](){}<>「」『』【】'"“”‘’·•,:.!?~_\-–—/\\|]/g, "")
    .replace(/\s+/g, "")
    .trim();
}

function uniqueUserVotes(votes: ContestVote[]): ContestVote[] {
  const unique = new Map<string, ContestVote>();

  for (const vote of votes) {
    const key = normalizeContestTitle(vote.title) || vote.homepage || vote.url;
    const current = unique.get(key);
    if (!current || (!current.finalized && vote.finalized)) {
      unique.set(key, vote);
    }
  }

  return [...unique.values()];
}

function myVotesEmbeds(votes: ContestVote[]): EmbedBuilder[] {
  const lines = votes.map((vote, index) => {
    const link = vote.homepage || vote.url;
    const state = vote.finalized ? "✅ 참여 확정" : "🗳️ 투표 중";
    const period = vote.period ? ` · ${vote.period}` : "";
    return `**${index + 1}. [${vote.title}](${link})**\n${state}${period}`;
  });

  const chunks: string[] = [];
  let current = "";

  for (const line of lines) {
    const next = current ? `${current}\n\n${line}` : line;
    if (next.length > 3800) {
      if (current) chunks.push(current);
      current = line;
    } else {
      current = next;
    }
  }
  if (current) chunks.push(current);

  return chunks.slice(0, 10).map((description, index) => new EmbedBuilder()
    .setTitle(index === 0 ? "🗳️ 내가 투표한 공모전" : `🗳️ 내가 투표한 공모전 (${index + 1})`)
    .setDescription(description));
}

function prepCategoryName(title: string): string {
  const clean = title.replace(/\s+/g, " ").trim();
  return `🏆 ${clean} 준비`.slice(0, 100);
}

async function createPrepRoom(source: TextChannel, vote: ContestVote) {
  const permissionOverwrites = source.permissionOverwrites.cache.map((overwrite) => ({
    id: overwrite.id,
    type: overwrite.type,
    allow: overwrite.allow.bitfield,
    deny: overwrite.deny.bitfield,
  }));

  const category = await source.guild.channels.create({
    name: prepCategoryName(vote.title),
    type: ChannelType.GuildCategory,
    permissionOverwrites,
  });
  const createdChannelIds: string[] = [];

  try {
    const info = await source.guild.channels.create({
      name: "📋・공모전-정보",
      type: ChannelType.GuildText,
      parent: category.id,
    });
    createdChannelIds.push(info.id);

    const infoMessage = await info.send({ embeds: [contestInfoEmbed(vote)] });
    await infoMessage.pin();

    const idea = await source.guild.channels.create({
      name: "💡・아이디어",
      type: ChannelType.GuildText,
      parent: category.id,
    });
    createdChannelIds.push(idea.id);

    const discussion = await source.guild.channels.create({
      name: "💬・토론",
      type: ChannelType.GuildText,
      parent: category.id,
    });
    createdChannelIds.push(discussion.id);

    const personal = await source.guild.channels.create({
      name: "🔒・개인정보",
      type: ChannelType.GuildText,
      parent: category.id,
    });
    createdChannelIds.push(personal.id);

    return {
      categoryId: category.id,
      infoChannelId: info.id,
      ideaChannelId: idea.id,
      discussionChannelId: discussion.id,
      personalChannelId: personal.id,
    };
  } catch (error) {
    for (const channelId of createdChannelIds.reverse()) {
      await source.guild.channels.delete(channelId, "공모전 준비방 생성 실패 롤백").catch(() => undefined);
    }
    await category.delete("공모전 준비방 생성 실패 롤백").catch(() => undefined);
    throw error;
  }
}

export async function handleContestCommand(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.inGuild() || !interaction.guild) {
    await interaction.reply({ content: "서버 안에서만 사용할 수 있습니다.", ephemeral: true });
    return;
  }

  const subcommand = interaction.options.getSubcommand();

  if (subcommand === "filter") {
    await interaction.deferReply();
    try {
      const filter = parseAudienceFilter(interaction.options.getString("target", true));
      const state = await setContestAudienceFilter(interaction.guild.id, filter);
      const added = await syncContestFeed(interaction.client, state);
      const label = contestAudienceFilterLabel(filter);

      await interaction.editReply(
        `✅ 공모전 참가대상 필터를 **${label}** 기준으로 설정했습니다.\n` +
        "**일반인 / 누구나 / 제한없음** 대상 공모전은 모든 필터에서 포함됩니다.\n" +
        `기존에 올라온 공모전은 삭제하지 않고, 앞으로 새로 수집되는 공모전에 적용됩니다.${added > 0 ? `\n조건에 맞는 미게시 공모전 **${added}개**를 바로 추가했습니다.` : ""}`,
      );
    } catch (error) {
      const message = formatUserFacingError(error);
      await interaction.editReply(`❌ 공모전 참가대상 필터 설정 실패\n\`${message}\``);
    }
    return;
  }

  if (subcommand === "my-votes") {
    await interaction.deferReply({ ephemeral: true });
    try {
      const votes = uniqueUserVotes(await listContestVotesByUser(interaction.guild.id, interaction.user.id));
      if (votes.length === 0) {
        await interaction.editReply("아직 투표한 공모전이 없습니다.");
        return;
      }

      const embeds = myVotesEmbeds(votes);
      await interaction.editReply({
        content: `내가 투표한 공모전은 **${votes.length}개**입니다.`,
        embeds,
      });
    } catch (error) {
      const message = formatUserFacingError(error);
      await interaction.editReply(`❌ 투표한 공모전 조회 실패\n\`${message}\``);
    }
    return;
  }

  if (subcommand === "repost") {
    await interaction.deferReply({ ephemeral: true });
    try {
      const name = interaction.options.getString("name", true).trim();
      const contest = await repostContest(interaction.client, interaction.guild.id, name);
      await interaction.editReply(`✅ **${contest.title}** 공모전을 중복 기록과 상관없이 다시 게시했습니다.`);
    } catch (error) {
      const message = formatUserFacingError(error);
      await interaction.editReply(`❌ 공모전 재게시 실패\n\`${message}\``);
    }
    return;
  }

  if (subcommand !== "setup") return;

  await interaction.deferReply();

  try {
    const existing = await findContestFeed(interaction.guild.id);
    if (existing) {
      const filter = contestAudienceFilterLabel(existing.audienceFilter ?? "all");
      await interaction.editReply(`🏆 공모전 자동 수집 공간이 이미 설정되어 있습니다.\n<#${existing.channelId}>에서 새 공모전을 계속 확인합니다.\n현재 참가대상 필터: **${filter}**`);
      return;
    }

    const state = await createContestFeed(interaction.guild);
    const added = await syncContestFeed(interaction.client, state);

    await interaction.editReply(`✅ 공모전 자동 수집 공간을 만들었습니다.\n<#${state.channelId}>에 현재 진행 중인 IT 공모전 **${added}개**를 게시했고, 이후 **1시간마다** 새 공모전을 확인합니다.\n기본 참가대상 필터는 **전체**입니다.`);
  } catch (error) {
    const message = formatUserFacingError(error);
    await interaction.editReply(`❌ 공모전 자동 수집 설정에 실패했습니다.\n\`${message}\``);
  }
}

export async function handleContestVoteButton(interaction: ButtonInteraction): Promise<void> {
  if (!interaction.customId.startsWith("contest_vote:")) return;

  const voteId = interaction.customId.split(":")[1];
  if (!voteId) return;

  if (processingVotes.has(voteId)) {
    await interaction.reply({ content: "다른 투표를 처리 중입니다. 잠시 후 다시 눌러주세요.", ephemeral: true });
    return;
  }

  processingVotes.add(voteId);
  await interaction.deferUpdate();

  try {
    await withContestVoteLock(voteId, async () => {
      const vote = await findContestVote(voteId);
    if (!vote || !interaction.guild || interaction.guildId !== vote.guildId) {
      await interaction.followUp({ content: "투표 정보를 찾을 수 없습니다.", ephemeral: true });
      return;
    }

    const channel = await interaction.guild.channels.fetch(vote.channelId).catch(() => null);
    if (!(channel instanceof TextChannel)) {
      await interaction.followUp({ content: "투표가 진행된 채널을 찾을 수 없습니다.", ephemeral: true });
      return;
    }

    let eligibleVoterIds = vote.eligibleVoterIds;
    let majority = vote.majority;

    if (!eligibleVoterIds || majority === undefined) {
      const eligibleHumans = await getEligibleHumans(channel);
      eligibleVoterIds = [...eligibleHumans.keys()];
      majority = majorityOf(eligibleVoterIds.length);

      const migrated = await updateContestVote(vote.id, {
        eligibleVoterIds,
        majority,
      });
      if (!migrated) throw new Error("기존 투표의 참여 기준을 저장하지 못했습니다.");
    }

    const contestLink = vote.homepage || vote.url;

    if (!eligibleVoterIds.includes(interaction.user.id)) {
      await interaction.followUp({ content: "이 투표의 참여 대상이 아닙니다.", ephemeral: true });
      return;
    }

    if (vote.finalized) {
      await interaction.message.edit({
        embeds: [contestVoteEmbed(vote, vote.voterIds.length, majority, true)],
        components: contestVoteComponents(vote.id, contestLink, true),
      });
      await interaction.followUp({ content: "이미 참여가 확정된 공모전입니다.", ephemeral: true });
      return;
    }

    if (vote.voterIds.includes(interaction.user.id)) {
      await interaction.followUp({
        content: `이미 투표했습니다. 현재 **${vote.voterIds.length}/${majority}명**이 투표했습니다.`,
        ephemeral: true,
      });
      return;
    }

    const voterIds = [...vote.voterIds, interaction.user.id];
    const reachedMajority = voterIds.length >= majority;
    let prepRoom: Awaited<ReturnType<typeof createPrepRoom>> | null = null;

    if (reachedMajority) {
      prepRoom = await createPrepRoom(channel, { ...vote, eligibleVoterIds, majority, voterIds });
    }

    const updated = await updateContestVote(vote.id, {
      eligibleVoterIds,
      majority,
      voterIds,
      finalized: reachedMajority,
      prepCategoryId: prepRoom?.categoryId,
    });
    if (!updated) throw new Error("투표 상태를 저장하지 못했습니다.");

    await interaction.message.edit({
      embeds: [contestVoteEmbed(updated, voterIds.length, majority, reachedMajority)],
      components: contestVoteComponents(updated.id, updated.homepage || updated.url, reachedMajority),
    });

    const voteMessageUrl = `https://discord.com/channels/${updated.guildId}/${updated.channelId}/${updated.messageId}`;
    await channel.send({
      content: `@everyone\n<@${interaction.user.id}> 님이 **[${escapeMarkdownLinkText(updated.title)}](${voteMessageUrl})** 공모전에 투표했습니다.`,
      allowedMentions: { parse: ["everyone"], users: [interaction.user.id] },
    });

    if (!reachedMajority || !prepRoom) return;

    await channel.send({
      embeds: [new EmbedBuilder()
        .setTitle("✅ 공모전 참여 확정")
        .setDescription(`**${updated.title}** 공모전이 과반수 투표로 확정되었습니다.\n\n투표한 사람: ${voterMentions(voterIds)}\n투표 결과: **${voterIds.length}/${eligibleVoterIds.length}명**`)
        .addFields(
          { name: "공모전 정보", value: `<#${prepRoom.infoChannelId}>`, inline: true },
          { name: "아이디어", value: `<#${prepRoom.ideaChannelId}>`, inline: true },
          { name: "토론", value: `<#${prepRoom.discussionChannelId}>`, inline: true },
          { name: "개인정보", value: `<#${prepRoom.personalChannelId}>`, inline: true },
        )
        .setURL(updated.homepage || updated.url)],
    });
    });
  } catch (error) {
    console.error(`공모전 투표 처리 실패 (${voteId})`, error);
    const message = formatUserFacingError(error);
    await interaction.followUp({ content: `❌ 투표 처리에 실패했습니다.\n\`${message}\``, ephemeral: true }).catch(() => undefined);
  } finally {
    processingVotes.delete(voteId);
  }
}
