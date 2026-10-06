import { ChatInputCommandInteraction, EmbedBuilder, SlashCommandBuilder } from "discord.js";
import { handleContestCommand as handleLegacyContestCommand } from "./contest.js";
import {
  createContestAudienceFeed,
  syncContestAudienceFeed,
} from "../services/contest-audience-feed.js";
import {
  contestAudienceFilterLabel,
  formatContestPeriod,
  type ContestAudienceFilter,
} from "../services/contest-feed.js";
import { repostAllContests } from "../services/contest-repost-all.js";
import { resolveContestDeadline } from "../services/contest-time.js";
import {
  listContestVotesByUser,
  type ContestVote,
} from "../services/contest-votes.js";
import { formatUserFacingError } from "../security/user-error.js";

export const contestCommandV2 = new SlashCommandBuilder()
  .setName("contest")
  .setDescription("IT 공모전 자동 수집 공간을 관리합니다.")
  .addSubcommand((subcommand) => subcommand
    .setName("setup")
    .setDescription("공모전 카테고리와 자동 수집 채널을 생성합니다."))
  .addSubcommand((subcommand) => subcommand
    .setName("filter")
    .setDescription("참가대상 전용 새 공모전 채널을 만들고 현재 공모전을 가져옵니다.")
    .addStringOption((option) => option
      .setName("target")
      .setDescription("새 채널에서 모아볼 공모전 참가대상")
      .setRequired(true)
      .addChoices(
        { name: "전체", value: "all" },
        { name: "고등학생", value: "high-school" },
        { name: "대학생", value: "university" },
      )))
  .addSubcommand((subcommand) => subcommand
    .setName("repost")
    .setDescription("현재 진행 중인 공모전을 모든 설정된 공모전 채널에 다시 올립니다.")
    .addBooleanOption((option) => option
      .setName("all")
      .setDescription("현재 진행 중인 공모전을 전부 다시 게시")
      .setRequired(true)))
  .addSubcommand((subcommand) => subcommand
    .setName("my-votes")
    .setDescription("내가 투표한 공모전 목록을 확인합니다."));

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
    const formattedPeriod = formatContestPeriod(resolveContestDeadline(vote));
    const period = formattedPeriod ? ` · ${formattedPeriod}` : "";
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

export async function handleContestCommandV2(interaction: ChatInputCommandInteraction): Promise<void> {
  const subcommand = interaction.options.getSubcommand();

  if (subcommand === "my-votes") {
    if (!interaction.inGuild() || !interaction.guild) {
      await interaction.reply({ content: "서버 안에서만 사용할 수 있습니다.", ephemeral: true });
      return;
    }

    await interaction.deferReply({ ephemeral: true });

    try {
      const votes = uniqueUserVotes(await listContestVotesByUser(interaction.guild.id, interaction.user.id));
      if (votes.length === 0) {
        await interaction.editReply("아직 투표한 공모전이 없습니다.");
        return;
      }

      await interaction.editReply({
        content: `내가 투표한 공모전은 **${votes.length}개**입니다.`,
        embeds: myVotesEmbeds(votes),
      });
    } catch (error) {
      const message = formatUserFacingError(error);
      await interaction.editReply(`❌ 투표한 공모전 조회 실패\n\`${message}\``);
    }
    return;
  }

  if (subcommand === "repost") {
    if (!interaction.inGuild() || !interaction.guild) {
      await interaction.reply({ content: "서버 안에서만 사용할 수 있습니다.", ephemeral: true });
      return;
    }

    await interaction.deferReply({ ephemeral: true });

    try {
      const all = interaction.options.getBoolean("all", true);
      if (!all) {
        await interaction.editReply("전체 재게시를 실행하려면 `all`을 `True`로 선택해주세요.");
        return;
      }

      const result = await repostAllContests(interaction.client, interaction.guild.id);
      await interaction.editReply(
        `✅ 현재 진행 중인 IT 공모전 **${result.contestCount}개**를 다시 확인했습니다.\n` +
        `설정된 공모전 채널 **${result.channelCount}개**에 총 **${result.postedCount}건**을 다시 게시했습니다.\n` +
        "참가대상별 채널에는 각 채널 조건에 맞는 공모전만 게시됩니다.",
      );
    } catch (error) {
      const message = formatUserFacingError(error);
      await interaction.editReply(`❌ 공모전 전체 재게시 실패\n\`${message}\``);
    }
    return;
  }

  if (subcommand !== "filter") {
    await handleLegacyContestCommand(interaction);
    return;
  }

  if (!interaction.inGuild() || !interaction.guild) {
    await interaction.reply({ content: "서버 안에서만 사용할 수 있습니다.", ephemeral: true });
    return;
  }

  await interaction.deferReply();

  try {
    const filter = parseAudienceFilter(interaction.options.getString("target", true));
    const { state, created } = await createContestAudienceFeed(interaction.guild, filter);
    const added = await syncContestAudienceFeed(interaction.client, state);
    const label = contestAudienceFilterLabel(filter);

    await interaction.editReply(
      `${created ? "✅" : "ℹ️"} **${label}** 대상 공모전 전용 채널을 ${created ? "만들었습니다" : "이미 사용 중입니다"}.\n` +
      `<#${state.channelId}>에 조건에 맞는 현재 진행 중 IT 공모전을 가져왔습니다. 새로 게시한 공모전: **${added}개**\n` +
      "이후 **1시간마다** 같은 참가대상 조건으로 새 공모전을 확인합니다. 기존 공모전 채널의 필터 설정은 변경하지 않습니다.",
    );
  } catch (error) {
    const message = formatUserFacingError(error);
    await interaction.editReply(`❌ 참가대상별 공모전 채널 생성 실패\n\`${message}\``);
  }
}
