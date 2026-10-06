import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { Client, EmbedBuilder, TextChannel } from "discord.js";
import { config } from "../config.js";
import type { RepositoryRef } from "./github.js";
import { startGitHubAutomationPolling } from "./github-automation-polling.js";
import { GitHubUserService, listGitHubAccounts, type GitHubRepositoryEvent } from "./github-user.js";
import { findProject, listProjects, withProjectDeleteLock, type StoredProject } from "./projects.js";
import { withDurableFileStateLock } from "./file-state-lock.js";

const DATA_FILE = resolve(process.cwd(), "data", "github-commit-feed.json");
const POLL_INTERVAL_MS = 60_000;
const MAX_SEEN_EVENTS = 200;
const MAX_SEEN_COMMITS = 500;

type RepositorySide = "frontend" | "backend";

export type CommitFeedState = {
  key: string;
  guildId: string;
  projectId: string;
  side: RepositorySide;
  seenEventIds: string[];
  seenCommitShas: string[];
  initializedAt: string;
};

export function retainActiveCommitFeedStates(
  states: CommitFeedState[],
  activeKeys: ReadonlySet<string>,
): CommitFeedState[] {
  return states.filter((state) => activeKeys.has(state.key));
}

export class GitHubCommitFeedStore {
  constructor(private readonly file = DATA_FILE) {}

  async withSyncLock<T>(task: () => Promise<T>): Promise<T> {
    const digest = createHash("sha256")
      .update(`${this.file}:github-commit-feed-sync`)
      .digest("hex");
    return withDurableFileStateLock(
      `${this.file}.sync.${digest}`,
      task,
      { waitForMs: POLL_INTERVAL_MS },
    );
  }

  private async readStates(): Promise<CommitFeedState[]> {
    try {
      return JSON.parse(await readFile(this.file, "utf8")) as CommitFeedState[];
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw error;
    }
  }

  private async writeStates(states: CommitFeedState[]): Promise<void> {
    await mkdir(dirname(this.file), { recursive: true });
    await writeFile(this.file, JSON.stringify(states, null, 2), "utf8");
  }

  async list(): Promise<CommitFeedState[]> {
    return withDurableFileStateLock(this.file, () => this.readStates(), { waitForMs: 2_000 });
  }

  async save(state: CommitFeedState): Promise<void> {
    await withDurableFileStateLock(this.file, async () => {
      const states = await this.readStates();
      const index = states.findIndex((item) => item.key === state.key);
      if (index >= 0) states[index] = state;
      else states.push(state);
      await this.writeStates(states);
    }, { waitForMs: 2_000 });
  }

  async update(
    key: string,
    updater: (state: CommitFeedState) => CommitFeedState | Promise<CommitFeedState>,
  ): Promise<CommitFeedState> {
    return withDurableFileStateLock(this.file, async () => {
      const states = await this.readStates();
      const index = states.findIndex((state) => state.key === key);
      const current = index >= 0 ? states[index] : undefined;
      if (!current) throw new Error("GitHub commit feed state not found.");

      const updated = await updater(current);
      states[index] = updated;
      await this.writeStates(states);
      return updated;
    }, { waitForMs: 2_000 });
  }

  async replace(states: CommitFeedState[]): Promise<void> {
    await withDurableFileStateLock(this.file, () => this.writeStates(states), { waitForMs: 2_000 });
  }

  async removeProject(projectId: string): Promise<number> {
    return withDurableFileStateLock(this.file, async () => {
      const states = await this.readStates();
      const next = states.filter((state) => state.projectId !== projectId);
      if (next.length === states.length) return 0;
      await this.writeStates(next);
      return states.length - next.length;
    }, { waitForMs: 2_000 });
  }
}

const defaultGitHubCommitFeedStore = new GitHubCommitFeedStore();

export function clearGitHubCommitFeedProject(projectId: string): Promise<number> {
  return defaultGitHubCommitFeedStore.withSyncLock(() => defaultGitHubCommitFeedStore.removeProject(projectId));
}

export async function withProjectCommitFeedLifecycleLock<T>(
  project: StoredProject,
  task: (current: StoredProject) => Promise<T>,
): Promise<T | undefined> {
  return withProjectDeleteLock(project.guildId, project.id, async () => {
    const current = await findProject(project.id);
    if (!current) return undefined;
    return task(current);
  });
}

function stateKey(project: StoredProject, side: RepositorySide): string {
  return `${project.id}:${side}`;
}

function projectRepository(project: StoredProject, side: RepositorySide): RepositoryRef {
  return side === "frontend" ? project.frontend : project.backend;
}

function projectLogChannelName(side: RepositorySide): string {
  return side === "frontend" ? "💻・frontend-log" : "🛠・backend-log";
}

async function getProjectLogChannel(
  client: Client,
  project: StoredProject,
  side: RepositorySide,
): Promise<TextChannel | null> {
  const guild = client.guilds.cache.get(project.guildId)
    ?? await client.guilds.fetch(project.guildId).catch(() => null);
  if (!guild) return null;

  const channels = await guild.channels.fetch();
  const expectedName = projectLogChannelName(side);
  const channel = channels.find((item) =>
    item instanceof TextChannel
    && item.parentId === project.categoryId
    && item.name === expectedName,
  );

  return channel instanceof TextChannel ? channel : null;
}

function branchName(event: GitHubRepositoryEvent): string {
  const ref = event.payload?.ref?.trim();
  if (!ref) return "알 수 없음";
  return ref.replace(/^refs\/heads\//, "");
}

async function publishLinkedPush(
  client: Client,
  project: StoredProject,
  side: RepositorySide,
  event: GitHubRepositoryEvent,
  seenCommitShas: Set<string>,
): Promise<void> {
  if (event.type !== "PushEvent") return;

  const actorLogin = event.actor?.login?.trim();
  if (!actorLogin) return;

  const links = await listGitHubAccounts(project.guildId);
  const link = links.find((item) => item.githubLogin.toLowerCase() === actorLogin.toLowerCase());
  if (!link) return;

  const commits = (event.payload?.commits ?? []).filter((commit) => !seenCommitShas.has(commit.sha));
  if (commits.length === 0) return;

  const channel = await getProjectLogChannel(client, project, side);
  if (!channel) {
    console.warn(`GitHub 연결 사용자 커밋 로그 채널을 찾지 못했습니다: ${project.name}/${side}`);
    return;
  }

  const repository = projectRepository(project, side);
  const branch = branchName(event);
  const timestamp = event.created_at ? new Date(event.created_at) : null;

  for (const commit of commits) {
    const title = commit.message.split("\n")[0]?.trim() || "커밋 메시지 없음";
    const commitUrl = `${repository.url}/commit/${commit.sha}`;
    const embed = new EmbedBuilder()
      .setTitle(`🟩 ${title.slice(0, 250)}`)
      .setURL(commitUrl)
      .setAuthor({
        name: `@${actorLogin}`,
        iconURL: `https://github.com/${encodeURIComponent(actorLogin)}.png?size=64`,
        url: `https://github.com/${encodeURIComponent(actorLogin)}`,
      })
      .addFields(
        { name: "프로젝트", value: project.name.slice(0, 1024), inline: true },
        { name: "저장소", value: `[${repository.owner}/${repository.repo}](${repository.url})`, inline: true },
        { name: "브랜치", value: `\`${branch.slice(0, 100)}\``, inline: true },
        { name: "커밋", value: `[\`${commit.sha.slice(0, 7)}\`](${commitUrl})`, inline: true },
        { name: "연결 사용자", value: `<@${link.discordUserId}>`, inline: true },
      );

    if (timestamp && !Number.isNaN(timestamp.getTime())) embed.setTimestamp(timestamp);

    await channel.send({
      content: `<@${link.discordUserId}> 새 커밋이 기록됐어요.`,
      allowedMentions: { users: [link.discordUserId] },
      embeds: [embed],
    });
    seenCommitShas.add(commit.sha);
  }
}

async function syncRepository(
  client: Client,
  github: GitHubUserService,
  project: StoredProject,
  side: RepositorySide,
  states: CommitFeedState[],
): Promise<void> {
  const repository = projectRepository(project, side);
  const events = await github.listRepositoryEvents(repository);
  const key = stateKey(project, side);
  let state = states.find((item) => item.key === key);

  if (!state) {
    state = {
      key,
      guildId: project.guildId,
      projectId: project.id,
      side,
      seenEventIds: events.map((event) => event.id).slice(0, MAX_SEEN_EVENTS),
      seenCommitShas: events
        .flatMap((event) => event.payload?.commits ?? [])
        .map((commit) => commit.sha)
        .slice(0, MAX_SEEN_COMMITS),
      initializedAt: new Date().toISOString(),
    };
    states.push(state);
    return;
  }

  const seenEventIds = new Set(state.seenEventIds);
  const seenCommitShas = new Set(state.seenCommitShas);
  const unseenEvents = events.filter((event) => !seenEventIds.has(event.id)).reverse();

  for (const event of unseenEvents) {
    await publishLinkedPush(client, project, side, event, seenCommitShas);
    seenEventIds.add(event.id);
  }

  state.seenEventIds = [...events.map((event) => event.id), ...seenEventIds].filter(
    (id, index, array) => array.indexOf(id) === index,
  ).slice(0, MAX_SEEN_EVENTS);
  state.seenCommitShas = [...seenCommitShas].slice(-MAX_SEEN_COMMITS);
}

async function syncGitHubCommitFeedsUnlocked(client: Client): Promise<void> {
  const github = new GitHubUserService(config.githubToken);
  const projects = await listProjects();
  const states = await defaultGitHubCommitFeedStore.list();
  const activeKeys = new Set(projects.flatMap((project) => [stateKey(project, "frontend"), stateKey(project, "backend")]));
  const nextStates = states.filter((state) => activeKeys.has(state.key));
  const completedLifecycleKeys = new Set<string>();

  for (const project of projects) {
    for (const side of ["frontend", "backend"] as const) {
      try {
        await withProjectCommitFeedLifecycleLock(project, async (current) => {
          completedLifecycleKeys.add(stateKey(current, side));
          await syncRepository(client, github, current, side, nextStates);
        });
      } catch (error) {
        console.error(`GitHub 연결 사용자 커밋 확인 실패 (${project.name}/${side})`, error);
      }
    }
  }

  await defaultGitHubCommitFeedStore.replace(retainActiveCommitFeedStates(nextStates, completedLifecycleKeys));
}

export async function syncGitHubCommitFeeds(client: Client): Promise<void> {
  await defaultGitHubCommitFeedStore.withSyncLock(() => syncGitHubCommitFeedsUnlocked(client));
}

export function startGitHubCommitFeedPolling(client: Client): NodeJS.Timeout {
  startGitHubAutomationPolling(client);
  let running = false;

  const run = async () => {
    if (running) return;
    running = true;
    try {
      await syncGitHubCommitFeeds(client);
    } finally {
      running = false;
    }
  };

  void run();
  const timer = setInterval(() => void run(), POLL_INTERVAL_MS);
  console.log("GitHub 연결 사용자 커밋 감시 시작: 1분 간격");
  return timer;
}
