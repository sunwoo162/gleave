import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import {
  ChannelType,
  Client,
  EmbedBuilder,
  Guild,
  PermissionFlagsBits,
  TextChannel,
} from "discord.js";
import {
  contestAudienceFilterLabel,
  contestVoteComponents,
  contestVoteEmbed,
  findContestFeed,
  getEligibleHumans,
  majorityOf,
  withContestGuildDeliveryLock,
  type ContestAudienceFilter,
} from "./contest-feed.js";
import { matchesStrictContestAudience } from "./contest-audience-match.js";
import {
  createContestVoteId,
  listContestVotesForChannel,
  saveContestVote,
  updateContestVote,
} from "./contest-votes.js";
import { resolveContestDeadline, seoulDateKey } from "./contest-time.js";
import { listActiveItContests, type Contest } from "./contests.js";
import { withDiscordChannelEnsureLock } from "./discord-channel-ensure-lock.js";
import { withDurableFileStateLock } from "./file-state-lock.js";

const DATA_FILE = resolve(process.cwd(), "data", "contest-audience-feeds.json");
const POLL_INTERVAL_MS = 60 * 60 * 1000;

export type ContestAudienceFeedState = {
  guildId: string;
  categoryId: string;
  channelId: string;
  audienceFilter: ContestAudienceFilter;
  postedKeys: string[];
  createdAt: string;
  lastSyncedAt?: string;
};

export class ContestAudienceFeedStore {
  constructor(private readonly file = DATA_FILE) {}

  async withDeliveryLock<T>(
    guildId: string,
    audienceFilter: ContestAudienceFilter,
    task: () => Promise<T>,
  ): Promise<T> {
    const digest = createHash("sha256")
      .update(`${guildId}:${audienceFilter}:contest-audience-feed-delivery`)
      .digest("hex");
    return withDurableFileStateLock(
      `${this.file}.delivery.${digest}`,
      task,
      { waitForMs: POLL_INTERVAL_MS },
    );
  }

  private async readStates(): Promise<ContestAudienceFeedState[]> {
    try {
      return JSON.parse(await readFile(this.file, "utf8")) as ContestAudienceFeedState[];
    } catch {
      return [];
    }
  }

  private async writeStates(states: ContestAudienceFeedState[]): Promise<void> {
    await mkdir(dirname(this.file), { recursive: true });
    await writeFile(this.file, JSON.stringify(states, null, 2), "utf8");
  }

  async list(): Promise<ContestAudienceFeedState[]> {
    return withDurableFileStateLock(this.file, () => this.readStates(), { waitForMs: 2_000 });
  }

  async find(
    guildId: string,
    audienceFilter: ContestAudienceFilter,
  ): Promise<ContestAudienceFeedState | null> {
    return withDurableFileStateLock(this.file, async () => {
      const states = await this.readStates();
      return states.find((state) =>
        state.guildId === guildId && state.audienceFilter === audienceFilter,
      ) ?? null;
    }, { waitForMs: 2_000 });
  }

  async save(state: ContestAudienceFeedState): Promise<void> {
    await withDurableFileStateLock(this.file, async () => {
      const states = await this.readStates();
      const index = states.findIndex((item) =>
        item.guildId === state.guildId && item.audienceFilter === state.audienceFilter,
      );
      if (index >= 0) states[index] = state;
      else states.push(state);
      await this.writeStates(states);
    }, { waitForMs: 2_000 });
  }

  async update(
    guildId: string,
    audienceFilter: ContestAudienceFilter,
    updater: (state: ContestAudienceFeedState) => ContestAudienceFeedState | Promise<ContestAudienceFeedState>,
  ): Promise<ContestAudienceFeedState> {
    return withDurableFileStateLock(this.file, async () => {
      const states = await this.readStates();
      const index = states.findIndex((state) =>
        state.guildId === guildId && state.audienceFilter === audienceFilter,
      );
      const current = index >= 0 ? states[index] : undefined;
      if (!current) throw new Error("참가대상별 공모전 피드 설정을 찾을 수 없습니다.");

      const updated = await updater(current);
      states[index] = updated;
      await this.writeStates(states);
      return updated;
    }, { waitForMs: 2_000 });
  }
}

const defaultContestAudienceFeedStore = new ContestAudienceFeedStore();

export function findContestAudienceFeed(
  guildId: string,
  audienceFilter: ContestAudienceFilter,
): Promise<ContestAudienceFeedState | null> {
  return defaultContestAudienceFeedStore.find(guildId, audienceFilter);
}

async function saveState(state: ContestAudienceFeedState): Promise<void> {
  await defaultContestAudienceFeedStore.save(state);
}

function channelName(filter: ContestAudienceFilter): string {
  if (filter === "high-school") return "🎓・고등학생-공모전";
  if (filter === "university") return "🎓・대학생-공모전";
  return "📢・전체-공모전";
}

async function ensureContestCategory(guild: Guild): Promise<string> {
  return withDiscordChannelEnsureLock(`contest-category:${guild.id}`, async () => {
    const baseFeed = await findContestFeed(guild.id);
    if (baseFeed) {
      const category = await guild.channels.fetch(baseFeed.categoryId).catch(() => null);
      if (category?.type === ChannelType.GuildCategory) return category.id;
    }

    const cached = guild.channels.cache.find((channel) =>
      channel.type === ChannelType.GuildCategory && channel.name === "🏆 공모전",
    );
    if (cached) return cached.id;

    const fetched = await guild.channels.fetch().catch(() => null);
    const existing = fetched?.find((channel) =>
      channel?.type === ChannelType.GuildCategory && channel.name === "🏆 공모전",
    );
    if (existing) return existing.id;

    const category = await guild.channels.create({
      name: "🏆 공모전",
      type: ChannelType.GuildCategory,
      reason: "참가대상별 IT 공모전 채널 생성",
    });
    return category.id;
  });
}

export async function createContestAudienceFeed(
  guild: Guild,
  audienceFilter: ContestAudienceFilter,
  store = defaultContestAudienceFeedStore,
): Promise<{ state: ContestAudienceFeedState; created: boolean }> {
  return store.withDeliveryLock(guild.id, audienceFilter, async () => {
    const existing = await store.find(guild.id, audienceFilter);
    if (existing) {
      const channel = await guild.channels.fetch(existing.channelId).catch(() => null);
      if (channel instanceof TextChannel) return { state: existing, created: false };
    }

    const categoryId = await ensureContestCategory(guild);
    const label = contestAudienceFilterLabel(audienceFilter);
    const channel = await guild.channels.create({
      name: channelName(audienceFilter),
      type: ChannelType.GuildText,
      parent: categoryId,
      reason: `${label} 대상 IT 공모전 자동 게시 채널 생성`,
    });

    const state: ContestAudienceFeedState = {
      guildId: guild.id,
      categoryId,
      channelId: channel.id,
      audienceFilter,
      postedKeys: [],
      createdAt: new Date().toISOString(),
    };
    await store.save(state);

    await channel.send({
      embeds: [new EmbedBuilder()
        .setTitle(`🏆 ${label} 대상 IT 공모전`)
        .setDescription(`이설이가 진행 중인 **웹/모바일/IT 공모전** 중 참가대상이 **${label}** 조건에 맞는 공모전만 이 채널에 올립니다.\n현재 공모전을 바로 가져오고 이후 **1시간마다** 새 공모전을 확인합니다. 과반수 투표가 모이면 기존 공모전 기능과 동일하게 준비 공간을 생성할 수 있습니다.`)],
    });

    return { state, created: true };
  });
}

function normalizeTitle(value: string): string {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/제\s*\d+\s*회/g, "")
    .replace(/[\[\](){}<>「」『』【】'"“”‘’·•,:.!?~_\-–—/\\|]/g, "")
    .replace(/\s+/g, "")
    .trim();
}

function contestKey(contest: Contest): string {
  return normalizeTitle(contest.title) || contest.url;
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
      `공모전 투표 대상 멤버 전체 조회 실패 (${channel.guild.id}/${channel.id}); 캐시 ${cached.length}명으로 계속 진행합니다.`,
      error,
    );
    return cached;
  }
}

async function publishContest(
  channel: TextChannel,
  contest: Contest,
  eligibleVoterIds: string[],
): Promise<void> {
  const majority = majorityOf(eligibleVoterIds.length);
  const voteId = createContestVoteId();
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

async function refreshContestDeadlineCards(channel: TextChannel): Promise<void> {
  const today = seoulDateKey();
  const votes = await listContestVotesForChannel(channel.guild.id, channel.id);

  for (const vote of votes) {
    if (vote.deadlineLastRenderedDate === today) continue;

    const resolved = resolveContestDeadline(vote);
    if (!resolved.deadlineDate) continue;

    const message = await channel.messages.fetch(vote.messageId).catch(() => null);
    if (!message) continue;

    const majority = vote.majority ?? majorityOf(vote.eligibleVoterIds?.length ?? 0);
    await message.edit({
      embeds: [contestVoteEmbed(resolved, vote.voterIds.length, majority, vote.finalized)],
      components: contestVoteComponents(vote.id, vote.homepage || vote.url, vote.finalized),
    });

    await updateContestVote(vote.id, {
      deadlineDate: resolved.deadlineDate,
      deadlineLastRenderedDate: today,
    });
  }
}

async function syncContestAudienceFeedWithContestsUnlocked(
  client: Client,
  state: ContestAudienceFeedState,
  contests: Contest[],
): Promise<number> {
  const guild = client.guilds.cache.get(state.guildId)
    ?? await client.guilds.fetch(state.guildId).catch(() => null);
  if (!guild) return 0;

  const fetched = await guild.channels.fetch(state.channelId).catch(() => null);
  if (!(fetched instanceof TextChannel)) return 0;

  await refreshContestDeadlineCards(fetched);

  const eligibleVoterIds = await resolveEligibleVoterIds(fetched);
  const posted = new Set(state.postedKeys);
  let count = 0;

  for (const contest of contests) {
    if (!matchesStrictContestAudience(contest, state.audienceFilter)) continue;
    const key = contestKey(contest);
    if (posted.has(key)) continue;

    try {
      await publishContest(fetched, contest, eligibleVoterIds);
    } catch (error) {
      console.error(
        `공모전 게시 실패; 다음 공모전으로 계속 진행 (${state.guildId}/${state.audienceFilter}/${contest.title})`,
        error,
      );
      continue;
    }

    posted.add(key);
    count += 1;

    state.postedKeys = [...posted];
    state.lastSyncedAt = new Date().toISOString();
    await saveState(state);
  }

  state.postedKeys = [...posted];
  state.lastSyncedAt = new Date().toISOString();
  await saveState(state);
  return count;
}

async function syncContestAudienceFeedWithContests(
  client: Client,
  state: ContestAudienceFeedState,
  contests: Contest[],
): Promise<number> {
  return withContestGuildDeliveryLock(state.guildId, async () => {
    return defaultContestAudienceFeedStore.withDeliveryLock(
      state.guildId,
      state.audienceFilter,
      async () => {
        const current = await defaultContestAudienceFeedStore.find(state.guildId, state.audienceFilter);
        return syncContestAudienceFeedWithContestsUnlocked(client, current ?? state, contests);
      },
    );
  });
}

export async function syncContestAudienceFeed(
  client: Client,
  state: ContestAudienceFeedState,
): Promise<number> {
  const contests = await listActiveItContests();
  if (contests.length === 0) {
    console.warn("진행 중 IT 공모전 수집 결과가 0개입니다. 출처 파서/네트워크 상태를 확인해주세요.");
  }
  return syncContestAudienceFeedWithContests(client, state, contests);
}

export async function syncAllContestAudienceFeeds(client: Client): Promise<void> {
  const states = await defaultContestAudienceFeedStore.list();
  if (states.length === 0) return;

  let contests: Contest[];
  try {
    contests = await listActiveItContests();
  } catch (error) {
    console.error("참가대상별 공모전 원본 수집 실패", error);
    return;
  }

  if (contests.length === 0) {
    console.warn("진행 중 IT 공모전 수집 결과가 0개입니다. 출처 파서/네트워크 상태를 확인해주세요.");
  }

  for (const state of states) {
    try {
      const added = await syncContestAudienceFeedWithContests(client, state, contests);
      if (added > 0) {
        console.log(`새 ${contestAudienceFilterLabel(state.audienceFilter)} 대상 IT 공모전 게시 완료: ${added}개`);
      }
    } catch (error) {
      console.error(`참가대상별 공모전 자동 수집 실패 (${state.guildId}/${state.audienceFilter})`, error);
    }
  }
}

export function startContestAudienceFeedPolling(client: Client): void {
  void syncAllContestAudienceFeeds(client);
  setInterval(() => void syncAllContestAudienceFeeds(client), POLL_INTERVAL_MS);
  console.log("참가대상별 IT 공모전 자동 수집 시작: 1시간 간격");
}
