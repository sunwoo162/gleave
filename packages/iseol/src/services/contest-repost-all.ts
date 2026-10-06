import { Client, PermissionFlagsBits, TextChannel } from "discord.js";
import {
  ContestFeedStore,
  contestVoteComponents,
  contestVoteEmbed,
  getEligibleHumans,
  majorityOf,
  withContestGuildDeliveryLock,
  type ContestAudienceFilter,
} from "./contest-feed.js";
import { matchesStrictContestAudience } from "./contest-audience-match.js";
import { ContestAudienceFeedStore } from "./contest-audience-feed.js";
import { createContestVoteId, saveContestVote } from "./contest-votes.js";
import { resolveContestDeadline, seoulDateKey } from "./contest-time.js";
import { listActiveItContests, type Contest } from "./contests.js";

type RepostTarget = {
  channelId: string;
  audienceFilter: ContestAudienceFilter;
};

export type RepostAllResult = {
  channelCount: number;
  contestCount: number;
  postedCount: number;
};

export async function listRepostTargets(
  guildId: string,
  contestFeedStore = new ContestFeedStore(),
  contestAudienceFeedStore = new ContestAudienceFeedStore(),
): Promise<RepostTarget[]> {
  const [feeds, audienceFeeds] = await Promise.all([
    contestFeedStore.list(),
    contestAudienceFeedStore.list(),
  ]);

  const targets = new Map<string, RepostTarget>();

  for (const state of feeds) {
    if (state.guildId !== guildId) continue;
    targets.set(state.channelId, {
      channelId: state.channelId,
      audienceFilter: state.audienceFilter ?? "all",
    });
  }

  for (const state of audienceFeeds) {
    if (state.guildId !== guildId) continue;
    targets.set(state.channelId, {
      channelId: state.channelId,
      audienceFilter: state.audienceFilter,
    });
  }

  return [...targets.values()];
}

function cachedEligibleVoterIds(channel: TextChannel): string[] {
  return [...channel.guild.members.cache.values()]
    .filter((member) => !member.user.bot)
    .filter((member) => channel.permissionsFor(member)?.has(PermissionFlagsBits.ViewChannel) === true)
    .map((member) => member.id);
}

async function resolveEligibleVoterIds(channel: TextChannel): Promise<string[]> {
  try {
    return [...(await getEligibleHumans(channel)).keys()];
  } catch (error) {
    const cached = cachedEligibleVoterIds(channel);
    console.warn(
      `공모전 재게시 투표 대상 멤버 조회 실패 (${channel.guild.id}/${channel.id}); 캐시 ${cached.length}명으로 계속 진행합니다.`,
      error,
    );
    return cached;
  }
}

async function publishContest(channel: TextChannel, contest: Contest, eligibleVoterIds: string[]): Promise<void> {
  const voteId = createContestVoteId();
  const majority = majorityOf(eligibleVoterIds.length);
  const contestLink = contest.homepage || contest.url;
  const createdAt = new Date().toISOString();
  const renderedDate = seoulDateKey();
  const contestWithDeadline = resolveContestDeadline({ ...contest, createdAt });

  const message = await channel.send({
    embeds: [contestVoteEmbed(contestWithDeadline, 0, majority, false)],
    components: contestVoteComponents(voteId, contestLink, false),
  });

  await saveContestVote({
    id: voteId,
    guildId: channel.guild.id,
    channelId: channel.id,
    messageId: message.id,
    title: contest.title,
    url: contest.url,
    sources: contest.sources,
    field: contest.field,
    target: contest.target,
    host: contest.host,
    sponsor: contest.sponsor,
    period: contest.period,
    deadlineDate: contestWithDeadline.deadlineDate,
    deadlineLastRenderedDate: renderedDate,
    totalPrize: contest.totalPrize,
    firstPrize: contest.firstPrize,
    homepage: contest.homepage,
    attachments: contest.attachments,
    status: contest.status,
    eligibleVoterIds,
    majority,
    voterIds: [],
    finalized: false,
  });
}

export async function repostAllContests(client: Client, guildId: string): Promise<RepostAllResult> {
  return withContestGuildDeliveryLock(guildId, async () => {
    const guild = client.guilds.cache.get(guildId)
      ?? await client.guilds.fetch(guildId).catch(() => null);
    if (!guild) throw new Error("Discord 서버를 찾을 수 없습니다.");

    const targets = await listRepostTargets(guildId);
    if (targets.length === 0) {
      throw new Error("먼저 /contest setup 또는 /contest filter로 공모전 채널을 만들어주세요.");
    }

    const contests = await listActiveItContests();
    let channelCount = 0;
    let postedCount = 0;

    for (const target of targets) {
      const fetched = await guild.channels.fetch(target.channelId).catch(() => null);
      if (!(fetched instanceof TextChannel)) continue;

      const eligibleVoterIds = await resolveEligibleVoterIds(fetched);
      const matching = contests.filter((contest) =>
        matchesStrictContestAudience(contest, target.audienceFilter),
      );

      for (const contest of matching) {
        try {
          await publishContest(fetched, contest, eligibleVoterIds);
          postedCount += 1;
        } catch (error) {
          console.error(
            `공모전 재게시 실패; 다음 공모전으로 계속 진행 (${guildId}/${target.audienceFilter}/${contest.title})`,
            error,
          );
        }
      }

      channelCount += 1;
    }

    if (channelCount === 0) {
      throw new Error("저장된 공모전 채널을 Discord에서 찾을 수 없습니다. /contest filter로 다시 만들어주세요.");
    }

    return {
      channelCount,
      contestCount: contests.length,
      postedCount,
    };
  });
}
