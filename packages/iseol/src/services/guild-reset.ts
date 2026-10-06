import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { ChannelType, type Guild } from "discord.js";
import { config } from "../config.js";
import { deleteDiscordProjectBindingsForGuild } from "../discord-project/binding-store.js";
import { GitHubWebhookService, type RepositoryRef } from "./github.js";
import { removeGitHubAccountsForGuild } from "./github-user.js";
import { clearMusicRuntime } from "./music.js";
import { leaveGuildVoiceChannel } from "./voice-connection.js";
import { stopStudySessionsForGuild } from "./voice-time.js";
import { withDurableFileStateLock } from "./file-state-lock.js";
import { clearCalendarProjectState } from "./calendar/calendar-state.js";
import { clearGitHubAutomationPollingProject } from "./github-automation-poll-state.js";
import { clearGitHubCommitFeedProject } from "./github-commit-feed.js";
import { withProjectGuildLifecycleLock } from "./projects.js";
import { formatUserFacingError } from "../security/user-error.js";

const DATA_DIR = resolve(process.cwd(), "data");
const PROJECTS_FILE = resolve(DATA_DIR, "projects.json");
const CONTEST_FEED_FILE = resolve(DATA_DIR, "contest-feed.json");
const CONTEST_AUDIENCE_FILE = resolve(DATA_DIR, "contest-audience-feeds.json");
const CONTEST_VOTES_FILE = resolve(DATA_DIR, "contest-votes.json");
const JOB_FEED_FILE = resolve(DATA_DIR, "job-feed.json");
const MUSIC_FILE = resolve(DATA_DIR, "music-playlists.json");
const VOICE_TIME_FILE = resolve(DATA_DIR, "voice-study-time.json");
const DAILY_SCRUM_FILE = resolve(DATA_DIR, "daily-scrum.json");

type GuildScopedRecord = {
  guildId: string;
};

type ProjectRecord = GuildScopedRecord & {
  id?: string;
  categoryId: string;
  frontend?: RepositoryRef;
  backend?: RepositoryRef;
  frontendHookId?: number;
  backendHookId?: number;
  notionChannelId?: string;
  figmaChannelId?: string;
};

type FeedRecord = GuildScopedRecord & {
  categoryId: string;
  channelId: string;
};

type ContestVoteRecord = GuildScopedRecord & {
  channelId: string;
  prepCategoryId?: string;
};

type MusicData = {
  guilds?: Record<string, unknown>;
};

type VoiceStudyData = {
  dailySeconds?: Record<string, Record<string, number>>;
  activeSessions?: Array<{ guildId: string }>;
};

type DailyScrumData = {
  records?: Array<GuildScopedRecord & { projectId: string }>;
  reminderDates?: Record<string, string>;
};

export type GuildResetSummary = {
  deletedChannels: number;
  clearedRecords: number;
  removedExternalHooks: number;
  removedProjectBindings: number;
  warnings: string[];
};

async function readJson<T>(path: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return fallback;
    throw error;
  }
}

async function readJsonWithDurableLock<T>(path: string, fallback: T): Promise<T> {
  return withDurableFileStateLock(path, () => readJson(path, fallback), { waitForMs: 2_000 });
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(value, null, 2), "utf8");
}

async function updateJsonWithDurableLock<T, R>(
  path: string,
  fallback: T,
  update: (current: T) => { next: T; result: R },
): Promise<R> {
  return withDurableFileStateLock(path, async () => {
    const current = await readJson(path, fallback);
    const { next, result } = update(current);
    await writeJson(path, next);
    return result;
  }, { waitForMs: 2_000 });
}

export function removeGuildRecordsFromFile<T extends GuildScopedRecord>(path: string, guildId: string): Promise<T[]> {
  return updateJsonWithDurableLock<T[], T[]>(path, [], (current) => ({
    next: withoutGuild(current, guildId),
    result: recordsForGuild(current, guildId),
  }));
}

function recordsForGuild<T extends GuildScopedRecord>(records: T[], guildId: string): T[] {
  return records.filter((record) => record.guildId === guildId);
}

function withoutGuild<T extends GuildScopedRecord>(records: T[], guildId: string): T[] {
  return records.filter((record) => record.guildId !== guildId);
}

async function removeProjectHooks(projects: ProjectRecord[], warnings: string[]): Promise<number> {
  if (projects.length === 0) return 0;

  const github = new GitHubWebhookService(config.githubToken);
  let removed = 0;

  for (const project of projects) {
    if (project.frontend && project.frontendHookId) {
      try {
        await github.deleteWebhook(project.frontend, project.frontendHookId);
        removed += 1;
      } catch (error) {
        warnings.push(`Frontend GitHub webhook 삭제 실패: ${formatUserFacingError(error)}`);
      }
    }

    if (project.backend && project.backendHookId) {
      try {
        await github.deleteWebhook(project.backend, project.backendHookId);
        removed += 1;
      } catch (error) {
        warnings.push(`Backend GitHub webhook 삭제 실패: ${formatUserFacingError(error)}`);
      }
    }
  }

  return removed;
}

type GuildResetExecution = {
  summary: GuildResetSummary;
  projectIds: string[];
};

export async function resetGuildState(guild: Guild): Promise<GuildResetSummary> {
  const execution = await withProjectGuildLifecycleLock(guild.id, () => resetGuildStateUnlocked(guild));
  const warnings = [...execution.summary.warnings];

  for (const projectId of execution.projectIds) {
    try {
      await clearGitHubCommitFeedProject(projectId);
    } catch (error) {
      warnings.push(`GitHub commit feed state 삭제 실패 (${projectId}): ${formatUserFacingError(error)}`);
    }

    try {
      await clearGitHubAutomationPollingProject(projectId);
    } catch (error) {
      warnings.push(`GitHub automation polling state 삭제 실패 (${projectId}): ${formatUserFacingError(error)}`);
    }

    try {
      await clearCalendarProjectState(projectId);
    } catch (error) {
      warnings.push(`Calendar state 삭제 실패 (${projectId}): ${formatUserFacingError(error)}`);
    }
  }

  return { ...execution.summary, warnings };
}

async function resetGuildStateUnlocked(guild: Guild): Promise<GuildResetExecution> {
  await stopStudySessionsForGuild(guild.id);
  clearMusicRuntime(guild.id);
  leaveGuildVoiceChannel(guild.id);

  const [projects, contestFeeds, audienceFeeds, contestVotes, jobFeeds, musicData, voiceData, dailyScrumData] = await Promise.all([
    readJsonWithDurableLock<ProjectRecord[]>(PROJECTS_FILE, []),
    readJsonWithDurableLock<FeedRecord[]>(CONTEST_FEED_FILE, []),
    readJsonWithDurableLock<FeedRecord[]>(CONTEST_AUDIENCE_FILE, []),
    readJsonWithDurableLock<ContestVoteRecord[]>(CONTEST_VOTES_FILE, []),
    readJsonWithDurableLock<FeedRecord[]>(JOB_FEED_FILE, []),
    readJsonWithDurableLock<MusicData>(MUSIC_FILE, { guilds: {} }),
    readJsonWithDurableLock<VoiceStudyData>(VOICE_TIME_FILE, { dailySeconds: {}, activeSessions: [] }),
    readJsonWithDurableLock<DailyScrumData>(DAILY_SCRUM_FILE, { records: [], reminderDates: {} }),
  ]);

  const guildProjects = recordsForGuild(projects, guild.id);
  const guildContestFeeds = recordsForGuild(contestFeeds, guild.id);
  const guildAudienceFeeds = recordsForGuild(audienceFeeds, guild.id);
  const guildVotes = recordsForGuild(contestVotes, guild.id);
  const guildJobFeeds = recordsForGuild(jobFeeds, guild.id);

  const categoryIds = new Set<string>();
  const directChannelIds = new Set<string>();

  for (const project of guildProjects) {
    categoryIds.add(project.categoryId);
    if (project.notionChannelId) directChannelIds.add(project.notionChannelId);
    if (project.figmaChannelId) directChannelIds.add(project.figmaChannelId);
  }

  for (const feed of [...guildContestFeeds, ...guildAudienceFeeds, ...guildJobFeeds]) {
    categoryIds.add(feed.categoryId);
    directChannelIds.add(feed.channelId);
  }

  for (const vote of guildVotes) {
    directChannelIds.add(vote.channelId);
    if (vote.prepCategoryId) categoryIds.add(vote.prepCategoryId);
  }

  const warnings: string[] = [];
  const removedExternalHooks = await removeProjectHooks(guildProjects, warnings);
  const channels = await guild.channels.fetch();

  for (const channel of channels.values()) {
    if (channel?.parentId && categoryIds.has(channel.parentId)) {
      directChannelIds.add(channel.id);
    }
  }

  let deletedChannels = 0;
  for (const channelId of directChannelIds) {
    const channel = channels.get(channelId);
    if (!channel || channel.type === ChannelType.GuildCategory) continue;

    try {
      await channel.delete("이설 관리자 서버 초기화");
      deletedChannels += 1;
    } catch (error) {
      warnings.push(`채널 삭제 실패 (${channel.name}): ${formatUserFacingError(error)}`);
    }
  }

  for (const categoryId of categoryIds) {
    const category = channels.get(categoryId);
    if (!category || category.type !== ChannelType.GuildCategory) continue;

    try {
      await category.delete("이설 관리자 서버 초기화");
      deletedChannels += 1;
    } catch (error) {
      warnings.push(`카테고리 삭제 실패 (${category.name}): ${formatUserFacingError(error)}`);
    }
  }

  const hadMusicData = Object.prototype.hasOwnProperty.call(musicData.guilds ?? {}, guild.id);

  const removedVoiceUsers = Object.keys(voiceData.dailySeconds ?? {})
    .filter((key) => key.startsWith(`${guild.id}:`)).length;
  const activeSessions = voiceData.activeSessions ?? [];
  const removedActiveSessions = activeSessions.filter((session) => session.guildId === guild.id).length;

  const scrumRecords = dailyScrumData.records ?? [];
  const removedScrumRecords = scrumRecords.filter((record) => record.guildId === guild.id).length;

  const removedProjects = await removeGuildRecordsFromFile<ProjectRecord>(PROJECTS_FILE, guild.id);
  const projectIds = new Set([
    ...guildProjects.map((project) => project.id),
    ...removedProjects.map((project) => project.id),
  ].filter((id): id is string => Boolean(id)));

  let removedProjectBindings = 0;
  try {
    const modelRoot = config.iseolModelRoot || resolve(process.cwd(), "data", "iseol");
    removedProjectBindings = await deleteDiscordProjectBindingsForGuild(modelRoot, guild.id);
  } catch (error) {
    warnings.push(`Project Workspace binding 삭제 실패: ${formatUserFacingError(error)}`);
  }

  const [removedGitHubAccounts] = await Promise.all([
    removeGitHubAccountsForGuild(guild.id),
    removeGuildRecordsFromFile<FeedRecord>(CONTEST_FEED_FILE, guild.id),
    removeGuildRecordsFromFile<FeedRecord>(CONTEST_AUDIENCE_FILE, guild.id),
    removeGuildRecordsFromFile<ContestVoteRecord>(CONTEST_VOTES_FILE, guild.id),
    removeGuildRecordsFromFile<FeedRecord>(JOB_FEED_FILE, guild.id),
    updateJsonWithDurableLock<MusicData, void>(MUSIC_FILE, { guilds: {} }, (current) => {
      const guilds = { ...(current.guilds ?? {}) };
      delete guilds[guild.id];
      return { next: { ...current, guilds }, result: undefined };
    }),
    updateJsonWithDurableLock<VoiceStudyData, void>(VOICE_TIME_FILE, { dailySeconds: {}, activeSessions: [] }, (current) => {
      const dailySeconds = { ...(current.dailySeconds ?? {}) };
      for (const key of Object.keys(dailySeconds)) {
        if (key.startsWith(`${guild.id}:`)) delete dailySeconds[key];
      }
      return {
        next: {
          ...current,
          dailySeconds,
          activeSessions: (current.activeSessions ?? []).filter((session) => session.guildId !== guild.id),
        },
        result: undefined,
      };
    }),
    updateJsonWithDurableLock<DailyScrumData, void>(DAILY_SCRUM_FILE, { records: [], reminderDates: {} }, (current) => {
      const reminderDates = { ...(current.reminderDates ?? {}) };
      for (const projectId of projectIds) delete reminderDates[projectId];
      return {
        next: {
          ...current,
          records: (current.records ?? []).filter((record) => record.guildId !== guild.id),
          reminderDates,
        },
        result: undefined,
      };
    }),
  ]);

  const clearedRecords = guildProjects.length
    + guildContestFeeds.length
    + guildAudienceFeeds.length
    + guildVotes.length
    + guildJobFeeds.length
    + (hadMusicData ? 1 : 0)
    + removedVoiceUsers
    + removedActiveSessions
    + removedScrumRecords
    + removedGitHubAccounts
    + removedProjectBindings;

  return {
    summary: {
      deletedChannels,
      clearedRecords,
      removedExternalHooks,
      removedProjectBindings,
      warnings,
    },
    projectIds: [...projectIds],
  };
}
