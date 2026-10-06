import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  Client,
  EmbedBuilder,
  Guild,
  type GuildMember,
  PermissionFlagsBits,
  TextChannel,
} from "discord.js";
import {
  createContestVoteId,
  listContestVotesForChannel,
  saveContestVote,
  updateContestVote,
  type ContestVote,
} from "./contest-votes.js";
import { listActiveItContests, type Contest, type ContestAttachment } from "./contests.js";
import { withDiscordChannelEnsureLock } from "./discord-channel-ensure-lock.js";
import { withDurableFileStateLock } from "./file-state-lock.js";

const DATA_FILE = resolve(process.cwd(), "data", "contest-feed.json");
export const CONTEST_POLL_INTERVAL_MS = 60 * 60 * 1000;
const DEADLINE_REMINDER_DAYS = 10;
const DAY_MS = 86_400_000;
const GUILD_MEMBER_CACHE_TTL_MS = 60_000;
const SEOUL_OFFSET_MS = 9 * 60 * 60 * 1000;

const guildHumanIdsCache = new Map<string, { expiresAt: number; userIds: string[] }>();
const guildHumanIdsFetches = new Map<string, Promise<string[]>>();

export type ContestAudienceFilter = "all" | "high-school" | "university";

export type ContestFeedState = {
  guildId: string;
  categoryId: string;
  channelId: string;
  postedKeys: string[];
  remindedKeys?: string[];
  audienceFilter?: ContestAudienceFilter;
  createdAt: string;
  lastSyncedAt?: string;
};

export type ContestCardData = {
  title: string;
  url: string;
  sources?: string[];
  field?: string;
  target?: string;
  host?: string;
  sponsor?: string;
  period?: string;
  initialDeadlineDays?: number;
  deadlineDate?: string;
  deadlineLastRenderedDate?: string;
  totalPrize?: string;
  firstPrize?: string;
  homepage?: string;
  attachments?: ContestAttachment[];
  status?: string;
};

type DeadlineSnapshot = {
  initialDeadlineDays?: number;
  deadlineDate?: string;
};

type PeriodDateMatch = {
  raw: string;
  index: number;
  dateKey: string;
};

export class ContestFeedStore {
  constructor(private readonly file = DATA_FILE) {}

  async withDeliveryLock<T>(guildId: string, task: () => Promise<T>): Promise<T> {
    const digest = createHash("sha256")
      .update(`${guildId}:contest-feed-delivery`)
      .digest("hex");
    return withDurableFileStateLock(
      `${this.file}.delivery.${digest}`,
      task,
      { waitForMs: CONTEST_POLL_INTERVAL_MS },
    );
  }

  private async readStates(): Promise<ContestFeedState[]> {
    try {
      return JSON.parse(await readFile(this.file, "utf8")) as ContestFeedState[];
    } catch {
      return [];
    }
  }

  private async writeStates(states: ContestFeedState[]): Promise<void> {
    await mkdir(dirname(this.file), { recursive: true });
    await writeFile(this.file, JSON.stringify(states, null, 2), "utf8");
  }

  async list(): Promise<ContestFeedState[]> {
    return withDurableFileStateLock(this.file, () => this.readStates(), { waitForMs: 2_000 });
  }

  async find(guildId: string): Promise<ContestFeedState | null> {
    return withDurableFileStateLock(this.file, async () => {
      const states = await this.readStates();
      return states.find((state) => state.guildId === guildId) ?? null;
    }, { waitForMs: 2_000 });
  }

  async save(state: ContestFeedState): Promise<void> {
    await withDurableFileStateLock(this.file, async () => {
      const states = await this.readStates();
      const index = states.findIndex((item) => item.guildId === state.guildId);
      if (index >= 0) states[index] = state;
      else states.push(state);
      await this.writeStates(states);
    }, { waitForMs: 2_000 });
  }

  async update(
    guildId: string,
    updater: (state: ContestFeedState) => ContestFeedState | Promise<ContestFeedState>,
  ): Promise<ContestFeedState> {
    return withDurableFileStateLock(this.file, async () => {
      const states = await this.readStates();
      const index = states.findIndex((state) => state.guildId === guildId);
      const current = index >= 0 ? states[index] : undefined;
      if (!current) throw new Error("공모전 피드 설정을 찾을 수 없습니다.");

      const updated = await updater(current);
      states[index] = updated;
      await this.writeStates(states);
      return updated;
    }, { waitForMs: 2_000 });
  }
}

const defaultContestFeedStore = new ContestFeedStore();

export function withContestGuildDeliveryLock<T>(guildId: string, task: () => Promise<T>): Promise<T> {
  const digest = createHash("sha256")
    .update(`${DATA_FILE}:${guildId}:contest-guild-delivery`)
    .digest("hex");
  return withDurableFileStateLock(
    `${DATA_FILE}.guild-delivery.${digest}`,
    task,
    { waitForMs: CONTEST_POLL_INTERVAL_MS },
  );
}

export function findContestFeed(guildId: string): Promise<ContestFeedState | null> {
  return defaultContestFeedStore.find(guildId);
}

async function saveContestFeed(state: ContestFeedState): Promise<void> {
  await defaultContestFeedStore.save(state);
}

export function contestAudienceFilterLabel(filter: ContestAudienceFilter): string {
  if (filter === "high-school") return "고등학생";
  if (filter === "university") return "대학생";
  return "전체";
}

export async function setContestAudienceFilter(
  guildId: string,
  audienceFilter: ContestAudienceFilter,
): Promise<ContestFeedState> {
  try {
    return await defaultContestFeedStore.update(guildId, (state) => ({
      ...state,
      audienceFilter,
    }));
  } catch (error) {
    if (error instanceof Error && error.message === "공모전 피드 설정을 찾을 수 없습니다.") {
      throw new Error("먼저 /contest setup으로 공모전 공간을 만들어주세요.");
    }
    throw error;
  }
}

function normalizeAudienceText(value?: string): string {
  return value?.normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim() ?? "";
}

export function matchesContestAudience(
  contest: Pick<ContestCardData, "target">,
  filter: ContestAudienceFilter,
): boolean {
  if (filter === "all") return true;

  const target = normalizeAudienceText(contest.target);
  if (!target || target === "정보없음") return true;

  const universal = /일반인|누구나|누구든|제한\s*없|전\s*국민|모든\s*사람|모든\s*국민|전\s*연령|전체\s*대상/.test(target);
  if (universal) return true;

  const highSchool = /고등학생|고교생|중\s*[·,/및]*\s*고등학생|중고등학생|청소년|초중고/.test(target);
  const university = /대학생|대학원생|대학\s*\(?원\)?생|대학\s*재학생/.test(target);
  const elementaryOnly = /초등학생|초등생/.test(target) && !highSchool;
  const middleOnly = /중학생|중등학생/.test(target) && !highSchool;
  const adultOnly = /성인|직장인|만\s*(?:19|20)\s*세\s*이상/.test(target);
  const genericStudent = /학생/.test(target);

  if (filter === "high-school") {
    if (highSchool) return true;
    if (university || elementaryOnly || middleOnly || adultOnly) return false;
    if (genericStudent) return true;
    return true;
  }

  if (university) return true;
  if (highSchool || elementaryOnly || middleOnly) return false;
  if (genericStudent) return true;
  return true;
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

function contestKey(contest: ContestCardData): string {
  return normalizeTitle(contest.title) || contest.url;
}

function seoulDateKey(date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function dateKeyToUtc(dateKey: string): number | null {
  const match = dateKey.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!year || !month || !day) return null;
  return Date.UTC(year, month - 1, day);
}

function parsePeriodDateMatches(period?: string): PeriodDateMatch[] {
  if (!period) return [];

  const result: PeriodDateMatch[] = [];
  for (const match of period.matchAll(/(?:(20)?(\d{2})[.\-/](\d{1,2})[.\-/](\d{1,2}))/g)) {
    if (match.index === undefined || !match[0]) continue;

    const year = Number(match[1] ? `${match[1]}${match[2]}` : `20${match[2]}`);
    const month = Number(match[3]);
    const day = Number(match[4]);
    if (!year || !month || !day) continue;

    const check = new Date(Date.UTC(year, month - 1, day));
    if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) continue;

    result.push({
      raw: match[0],
      index: match.index,
      dateKey: `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
    });
  }

  return result;
}

function dateKeyToDiscordUnix(dateKey: string, endOfDay: boolean): number | null {
  const match = dateKey.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!year || !month || !day) return null;

  const localHour = endOfDay ? 23 : 0;
  const localMinute = endOfDay ? 59 : 0;
  const utcMs = Date.UTC(year, month - 1, day, localHour, localMinute) - SEOUL_OFFSET_MS;
  return Math.floor(utcMs / 1000);
}

function discordDateTimestamp(dateKey: string, endOfDay: boolean): string | null {
  const unix = dateKeyToDiscordUnix(dateKey, endOfDay);
  if (unix === null) return null;
  return `<t:${unix}:F> (<t:${unix}:R>)`;
}

function addDaysToDateKey(dateKey: string, days: number): string | undefined {
  const base = dateKeyToUtc(dateKey);
  if (base === null) return undefined;
  return new Date(base + days * DAY_MS).toISOString().slice(0, 10);
}

function parseDeadlineDateFromPeriod(period?: string): string | undefined {
  return parsePeriodDateMatches(period).at(-1)?.dateKey;
}

function daysBetweenDateKeys(fromDateKey: string, toDateKey: string): number | null {
  const from = dateKeyToUtc(fromDateKey);
  const to = dateKeyToUtc(toDateKey);
  if (from === null || to === null) return null;
  return Math.ceil((to - from) / DAY_MS);
}

function createDeadlineSnapshot(period?: string, baseDate = new Date()): DeadlineSnapshot {
  if (!period) return {};

  const baseDateKey = seoulDateKey(baseDate);
  const explicitDeadline = parseDeadlineDateFromPeriod(period);
  if (explicitDeadline) {
    const initialDeadlineDays = daysBetweenDateKeys(baseDateKey, explicitDeadline);
    return {
      deadlineDate: explicitDeadline,
      initialDeadlineDays: initialDeadlineDays ?? undefined,
    };
  }

  if (/D-DAY/i.test(period)) {
    return { deadlineDate: baseDateKey, initialDeadlineDays: 0 };
  }

  const dDayText = period.match(/\bD-(\d+)\b/i)?.[1];
  if (dDayText) {
    const initialDeadlineDays = Number(dDayText);
    return {
      initialDeadlineDays,
      deadlineDate: addDaysToDateKey(baseDateKey, initialDeadlineDays),
    };
  }

  return {};
}

function getDeadlineDaysLeft(contest: ContestCardData, now = new Date()): number | null {
  if (contest.deadlineDate) {
    return daysBetweenDateKeys(seoulDateKey(now), contest.deadlineDate);
  }

  const snapshot = createDeadlineSnapshot(contest.period, now);
  if (snapshot.deadlineDate) {
    return daysBetweenDateKeys(seoulDateKey(now), snapshot.deadlineDate);
  }

  if (contest.period && /마감/i.test(contest.period) && !/마감임박/i.test(contest.period)) return -1;
  return null;
}

function stripDeadlineLabel(period?: string): string {
  if (!period) return "";

  return period
    .replace(/\s*\*{0,2}D-(?:\d+)\*{0,2}/gi, "")
    .replace(/\s*\*{0,2}D-DAY\*{0,2}/gi, "")
    .replace(/\s*\*{0,2}마감\*{0,2}\s*$/gi, "")
    .replace(/\s*홈페이지\s*[-–—]?\s*$/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function formatContestPeriodDates(period?: string, fallbackDeadlineDate?: string): string | undefined {
  const base = stripDeadlineLabel(period);
  const matches = parsePeriodDateMatches(base);

  if (matches.length === 0) {
    if (!base && fallbackDeadlineDate) {
      const deadline = discordDateTimestamp(fallbackDeadlineDate, true);
      return deadline ? `마감일 ${deadline}` : fallbackDeadlineDate;
    }
    return base || undefined;
  }

  let formatted = base;
  for (let index = matches.length - 1; index >= 0; index -= 1) {
    const current = matches[index];
    if (!current) continue;

    const isDeadline = matches.length === 1 || index === matches.length - 1;
    const timestamp = discordDateTimestamp(current.dateKey, isDeadline);
    if (!timestamp) continue;

    formatted = `${formatted.slice(0, current.index)}${timestamp}${formatted.slice(current.index + current.raw.length)}`;
  }

  return formatted.replace(/\s+/g, " ").trim();
}

export function formatContestPeriod(contest: ContestCardData): string | undefined {
  const base = formatContestPeriodDates(contest.period, contest.deadlineDate) ?? "";
  const daysLeft = getDeadlineDaysLeft(contest);
  if (daysLeft === null) return base || undefined;

  const label = daysLeft < 0
    ? "**마감**"
    : daysLeft === 0
      ? "**D-DAY**"
      : `**D-${daysLeft}**`;

  return `${base}${base ? " " : ""}${label}`;
}

function shouldSendDeadlineReminder(contest: ContestCardData): boolean {
  const daysLeft = getDeadlineDaysLeft(contest);
  return daysLeft !== null && daysLeft >= 0 && daysLeft <= DEADLINE_REMINDER_DAYS;
}

export function majorityOf(total: number): number {
  return Math.floor(total / 2) + 1;
}

async function getGuildHumanIds(guild: Guild): Promise<string[]> {
  const now = Date.now();
  const cached = guildHumanIdsCache.get(guild.id);
  if (cached && cached.expiresAt > now) return cached.userIds;

  const inFlight = guildHumanIdsFetches.get(guild.id);
  if (inFlight) return inFlight;

  const request = guild.members.fetch()
    .then((members) => [...members.values()]
      .filter((member) => !member.user.bot)
      .map((member) => member.id))
    .then((userIds) => {
      guildHumanIdsCache.set(guild.id, {
        expiresAt: Date.now() + GUILD_MEMBER_CACHE_TTL_MS,
        userIds,
      });
      return userIds;
    })
    .finally(() => {
      guildHumanIdsFetches.delete(guild.id);
    });

  guildHumanIdsFetches.set(guild.id, request);
  return request;
}

export async function getEligibleHumans(channel: TextChannel): Promise<Map<string, GuildMember>> {
  const userIds = await getGuildHumanIds(channel.guild);
  const eligible = new Map<string, GuildMember>();

  for (const userId of userIds) {
    const member = channel.guild.members.cache.get(userId);
    if (!member) continue;
    if (channel.permissionsFor(member)?.has(PermissionFlagsBits.ViewChannel) !== true) continue;
    eligible.set(userId, member);
  }

  return eligible;
}

function safeValue(value?: string, fallback = "정보없음"): string {
  const text = value?.trim() || fallback;
  return text.slice(0, 1024);
}

function homepageValue(contest: ContestCardData): string {
  const url = contest.homepage || contest.url;
  return `[바로가기](${url})`;
}

function attachmentValue(attachments?: ContestAttachment[]): string {
  if (!attachments || attachments.length === 0) return "파일없음";

  return attachments
    .slice(0, 5)
    .map((attachment) => attachment.url
      ? `[${attachment.name.slice(0, 80)}](${attachment.url})`
      : attachment.name.slice(0, 100))
    .join("\n")
    .slice(0, 1024);
}

export function contestInfoEmbed(contest: ContestCardData): EmbedBuilder {
  const sources = contest.sources?.length ? contest.sources.join(" · ") : "출처 확인 필요";
  const embed = new EmbedBuilder()
    .setTitle(`🏆 ${contest.title}`)
    .setURL(contest.homepage || contest.url)
    .setDescription("확정된 공모전의 상세 정보입니다.")
    .addFields(
      { name: "분야", value: safeValue(contest.field, "웹/모바일/IT"), inline: true },
      { name: "응모대상", value: safeValue(contest.target), inline: true },
      { name: "주최/주관", value: safeValue(contest.host), inline: false },
      { name: "후원/협찬", value: safeValue(contest.sponsor, "없음"), inline: false },
      { name: "접수기간", value: safeValue(formatContestPeriod(contest)), inline: false },
      { name: "총 상금", value: safeValue(contest.totalPrize), inline: true },
      { name: "1등 상금", value: safeValue(contest.firstPrize), inline: true },
      { name: "홈페이지", value: homepageValue(contest), inline: false },
      { name: "첨부파일", value: attachmentValue(contest.attachments), inline: false },
      { name: "출처", value: sources.slice(0, 1024), inline: false },
    );

  if (contest.status?.trim()) {
    embed.addFields({ name: "상태", value: contest.status.trim().slice(0, 1024), inline: true });
  }

  return embed;
}

export function contestVoteEmbed(
  contest: ContestCardData,
  voteCount: number,
  majority: number,
  finalized: boolean,
): EmbedBuilder {
  const embed = contestInfoEmbed(contest)
    .setTitle(`${finalized ? "✅ " : "🏆 "}${contest.title}`)
    .setDescription(finalized ? "과반수 투표로 준비가 확정된 공모전입니다." : "참여하고 싶은 사람은 아래 **투표** 버튼을 눌러주세요.");

  embed.addFields({ name: "투표", value: `${voteCount} / ${majority}명 이상`, inline: true });
  return embed;
}

export function contestVoteComponents(voteId: string, contestUrl: string, finalized: boolean) {
  return [
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`contest_vote:${voteId}`)
        .setLabel(finalized ? "참여 확정" : "투표")
        .setEmoji(finalized ? "✅" : "🗳️")
        .setStyle(finalized ? ButtonStyle.Success : ButtonStyle.Primary)
        .setDisabled(finalized),
      new ButtonBuilder()
        .setLabel("공모전 보기")
        .setStyle(ButtonStyle.Link)
        .setURL(contestUrl),
    ),
  ];
}

function deadlineReminderEmbed(vote: ContestVote, majority: number): EmbedBuilder {
  const daysLeft = getDeadlineDaysLeft(vote);
  const label = daysLeft === null
    ? "마감 임박"
    : daysLeft < 0
      ? "마감"
      : daysLeft === 0
        ? "D-DAY"
        : `D-${daysLeft}`;

  return contestVoteEmbed(vote, vote.voterIds.length, majority, vote.finalized)
    .setTitle(`⏰ ${label} · ${vote.title}`)
    .setDescription(daysLeft !== null && daysLeft < 0
      ? "제출 기간이 마감된 공모전입니다."
      : vote.finalized
        ? `제출 마감이 **${label}**로 임박했습니다. 참여 확정된 공모전입니다.`
        : `제출 마감이 **${label}**로 임박했습니다. 참여할 사람은 아래 투표 버튼을 눌러주세요.`);
}

export async function createContestFeed(guild: Guild, store = defaultContestFeedStore): Promise<ContestFeedState> {
  return store.withDeliveryLock(guild.id, async () => {
    const existing = await store.find(guild.id);
    if (existing) return existing;

    return withDiscordChannelEnsureLock(`contest-category:${guild.id}`, async () => {
      const current = await store.find(guild.id);
      if (current) return current;

      const cached = guild.channels.cache.find((channel) =>
        channel.type === ChannelType.GuildCategory && channel.name === "🏆 공모전",
      );
      const fetched = cached ? null : await guild.channels.fetch().catch(() => null);
      const fetchedCategory = fetched?.find((channel) =>
        channel?.type === ChannelType.GuildCategory && channel.name === "🏆 공모전",
      );
      const category = cached
        ?? fetchedCategory
        ?? await guild.channels.create({
          name: "🏆 공모전",
          type: ChannelType.GuildCategory,
          reason: "IT 공모전 자동 수집 공간 생성",
        });
      const createdCategory = !cached && !fetchedCategory;

      try {
        const channel = await guild.channels.create({
          name: "📢・공모전",
          type: ChannelType.GuildText,
          parent: category.id,
          reason: "IT 공모전 자동 게시 채널 생성",
        });

        const state: ContestFeedState = {
          guildId: guild.id,
          categoryId: category.id,
          channelId: channel.id,
          postedKeys: [],
          remindedKeys: [],
          audienceFilter: "all",
          createdAt: new Date().toISOString(),
        };
        await store.save(state);

        await channel.send({
          embeds: [new EmbedBuilder()
            .setTitle("🏆 IT 공모전 자동 수집")
            .setDescription("이설이가 여러 공모전 사이트를 주기적으로 확인하고, 새 웹/모바일/IT 공모전만 이 채널에 올립니다.\n\n같은 공모전은 중복 제거하며 과반수 투표가 모이면 별도 준비 공간을 자동으로 생성합니다. 제출 마감이 D-10 이하가 되면 해당 공모전을 한 번 더 알려드립니다. `/contest filter`로 참가대상 필터를 설정할 수 있습니다.")],
        });

        return state;
      } catch (error) {
        if (createdCategory) await category.delete("공모전 피드 생성 실패 롤백").catch(() => undefined);
        throw error;
      }
    });
  });
}

async function publishContest(channel: TextChannel, contest: Contest, eligibleVoterIds: string[]): Promise<ContestVote> {
  const voteId = createContestVoteId();
  const majority = majorityOf(eligibleVoterIds.length);
  const contestLink = contest.homepage || contest.url;
  const deadlineSnapshot = createDeadlineSnapshot(contest.period);
  const renderedDate = seoulDateKey();
  const contestWithDeadline: ContestCardData = {
    ...contest,
    ...deadlineSnapshot,
    deadlineLastRenderedDate: renderedDate,
  };

  const message = await channel.send({
    embeds: [contestVoteEmbed(contestWithDeadline, 0, majority, false)],
    components: contestVoteComponents(voteId, contestLink, false),
  });

  return saveContestVote({
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
    initialDeadlineDays: deadlineSnapshot.initialDeadlineDays,
    deadlineDate: deadlineSnapshot.deadlineDate,
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

async function ensureDeadlineSnapshot(vote: ContestVote): Promise<ContestVote> {
  if (vote.deadlineDate || vote.initialDeadlineDays !== undefined) return vote;

  const snapshot = createDeadlineSnapshot(vote.period, new Date(vote.createdAt));
  if (!snapshot.deadlineDate && snapshot.initialDeadlineDays === undefined) return vote;

  const updated = await updateContestVote(vote.id, snapshot);
  return updated ?? vote;
}

async function findLegacyDeadlineReminderMessageId(channel: TextChannel, vote: ContestVote): Promise<string | undefined> {
  const messages = await channel.messages.fetch({ limit: 100 }).catch(() => null);
  if (!messages) return undefined;

  const expectedTitle = normalizeTitle(vote.title);
  const reminder = messages.find((message) => {
    if (message.author.id !== channel.client.user?.id) return false;

    return message.embeds.some((embed) => {
      const title = embed.title ?? "";
      if (!title.startsWith("⏰")) return false;

      const contestTitle = title.replace(/^⏰\s*(?:D-DAY|D-\d+|마감|마감 임박)\s*·\s*/i, "");
      return normalizeTitle(contestTitle) === expectedTitle;
    });
  });

  return reminder?.id;
}

async function refreshDeadlineCard(
  channel: TextChannel,
  vote: ContestVote,
  hasDeadlineReminder: boolean,
): Promise<ContestVote> {
  let current = await ensureDeadlineSnapshot(vote);

  if (hasDeadlineReminder && !current.deadlineReminderMessageId) {
    const legacyReminderMessageId = await findLegacyDeadlineReminderMessageId(channel, current);
    if (legacyReminderMessageId) {
      const migrated = await updateContestVote(current.id, {
        deadlineReminderMessageId: legacyReminderMessageId,
      });
      current = migrated ?? current;
    }
  }

  if (!current.deadlineDate) return current;

  const today = seoulDateKey();
  if (current.deadlineLastRenderedDate === today) return current;

  const majority = current.majority ?? majorityOf(current.eligibleVoterIds?.length ?? 0);
  const message = await channel.messages.fetch(current.messageId).catch(() => null);
  if (message) {
    await message.edit({
      embeds: [contestVoteEmbed(current, current.voterIds.length, majority, current.finalized)],
      components: contestVoteComponents(current.id, current.homepage || current.url, current.finalized),
    });
  }

  if (current.deadlineReminderMessageId) {
    const reminderMessage = await channel.messages.fetch(current.deadlineReminderMessageId).catch(() => null);
    if (reminderMessage) {
      await reminderMessage.edit({
        embeds: [deadlineReminderEmbed(current, majority)],
        components: contestVoteComponents(current.id, current.homepage || current.url, current.finalized),
      });
    }
  }

  const updated = await updateContestVote(current.id, { deadlineLastRenderedDate: today });
  current = updated ?? current;
  return current;
}

async function publishDeadlineReminder(
  channel: TextChannel,
  contest: Contest,
  eligibleVoterIds: string[],
  existingVote?: ContestVote,
): Promise<void> {
  const vote = existingVote ? await ensureDeadlineSnapshot(existingVote) : null;
  const fallbackMajority = majorityOf(eligibleVoterIds.length);

  if (!vote) {
    await publishContest(channel, contest, eligibleVoterIds);
    return;
  }

  const contestLink = vote.homepage || vote.url;
  const reminderMessage = await channel.send({
    embeds: [deadlineReminderEmbed(vote, vote.majority ?? fallbackMajority)],
    components: contestVoteComponents(vote.id, contestLink, vote.finalized),
  });

  await updateContestVote(vote.id, {
    deadlineReminderMessageId: reminderMessage.id,
    deadlineLastRenderedDate: seoulDateKey(),
  });
}

function groupVotesByContest(votes: ContestVote[]): Map<string, ContestVote[]> {
  const grouped = new Map<string, ContestVote[]>();

  for (const vote of votes) {
    const key = contestKey(vote);
    const current = grouped.get(key) ?? [];
    current.push(vote);
    current.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    grouped.set(key, current);
  }

  return grouped;
}

export async function repostContest(client: Client, guildId: string, query: string): Promise<Contest> {
  const state = await findContestFeed(guildId);
  if (!state) throw new Error("먼저 /contest setup으로 공모전 공간을 만들어주세요.");

  const guild = client.guilds.cache.get(guildId)
    ?? await client.guilds.fetch(guildId).catch(() => null);
  if (!guild) throw new Error("Discord 서버를 찾을 수 없습니다.");

  const fetched = await guild.channels.fetch(state.channelId).catch(() => null);
  if (!(fetched instanceof TextChannel)) throw new Error("공모전 채널을 찾을 수 없습니다.");

  const contests = await listActiveItContests();
  const normalizedQuery = normalizeTitle(query);
  const exact = contests.find((contest) => normalizeTitle(contest.title) === normalizedQuery);
  const partial = contests.find((contest) => normalizeTitle(contest.title).includes(normalizedQuery));
  const contest = exact ?? partial;
  if (!contest) throw new Error(`"${query}"에 해당하는 진행 중 공모전을 찾지 못했습니다.`);

  const eligibleHumans = await getEligibleHumans(fetched);
  await publishContest(fetched, contest, [...eligibleHumans.keys()]);
  return contest;
}

async function syncContestFeedUnlocked(client: Client, state: ContestFeedState): Promise<number> {
  const guild = client.guilds.cache.get(state.guildId)
    ?? await client.guilds.fetch(state.guildId).catch(() => null);
  if (!guild) return 0;

  const fetched = await guild.channels.fetch(state.channelId).catch(() => null);
  if (!(fetched instanceof TextChannel)) return 0;

  const [contests, eligibleHumans, storedVotes] = await Promise.all([
    listActiveItContests(),
    getEligibleHumans(fetched),
    listContestVotesForChannel(state.guildId, state.channelId),
  ]);
  const eligibleVoterIds = [...eligibleHumans.keys()];
  const posted = new Set(state.postedKeys);
  const reminded = new Set(state.remindedKeys ?? []);
  const votesByContest = groupVotesByContest(storedVotes);
  const audienceFilter = state.audienceFilter ?? "all";
  let count = 0;

  for (const contest of contests) {
    const key = contestKey(contest);

    if (!posted.has(key)) {
      if (!matchesContestAudience(contest, audienceFilter)) continue;

      const vote = await publishContest(fetched, contest, eligibleVoterIds);
      votesByContest.set(key, [vote]);
      posted.add(key);
      count += 1;

      state.postedKeys = [...posted];
      state.remindedKeys = [...reminded];
      state.lastSyncedAt = new Date().toISOString();
      await saveContestFeed(state);
      continue;
    }

    const contestVotes = votesByContest.get(key) ?? [];
    const refreshedVotes: ContestVote[] = [];
    for (const vote of contestVotes) {
      refreshedVotes.push(await refreshDeadlineCard(fetched, vote, reminded.has(key)));
    }
    if (refreshedVotes.length > 0) votesByContest.set(key, refreshedVotes);

    const latestVote = refreshedVotes[0] ?? contestVotes[0];
    const deadlineSource: ContestCardData = latestVote ?? contest;
    if (!reminded.has(key) && shouldSendDeadlineReminder(deadlineSource)) {
      await publishDeadlineReminder(fetched, contest, eligibleVoterIds, latestVote);
      reminded.add(key);
      state.remindedKeys = [...reminded];
      state.lastSyncedAt = new Date().toISOString();
      await saveContestFeed(state);
    }
  }

  state.postedKeys = [...posted];
  state.remindedKeys = [...reminded];
  state.audienceFilter = audienceFilter;
  state.lastSyncedAt = new Date().toISOString();
  await saveContestFeed(state);
  return count;
}

export async function syncContestFeed(client: Client, state: ContestFeedState): Promise<number> {
  return withContestGuildDeliveryLock(state.guildId, async () => {
    return defaultContestFeedStore.withDeliveryLock(state.guildId, async () => {
      const current = await defaultContestFeedStore.find(state.guildId);
      return syncContestFeedUnlocked(client, current ?? state);
    });
  });
}

export async function syncAllContestFeeds(client: Client): Promise<void> {
  const states = await defaultContestFeedStore.list();
  for (const state of states) {
    try {
      const added = await syncContestFeed(client, state);
      if (added > 0) console.log(`새 IT 공모전 게시 완료: ${added}개`);
    } catch (error) {
      console.error(`공모전 자동 수집 실패 (${state.guildId})`, error);
    }
  }
}

export function startContestFeedPolling(client: Client): void {
  void syncAllContestFeeds(client);
  setInterval(() => void syncAllContestFeeds(client), CONTEST_POLL_INTERVAL_MS);
  console.log("IT 공모전 자동 수집 시작: 1시간 간격");
}
