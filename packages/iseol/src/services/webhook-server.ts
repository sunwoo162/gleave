import { createServer } from "node:http";
import { resolve } from "node:path";
import { Client, EmbedBuilder, TextChannel } from "discord.js";
import { config } from "../config.js";
import { recordStoredProjectAction, type StoredProjectActionFact } from "../discord-project/history-recorder.js";
import { FigmaWebhookService, NO_FIGMA_VERSION, type FigmaComment, type FigmaVersion } from "./figma.js";
import { NotionService, type NotionPageSnapshot } from "./notion.js";
import { findProject, listProjects, updateProject, withProjectDeleteLock, withProjectPollingLock, type StoredProject } from "./projects.js";
import { CalendarStateStore } from "./calendar/calendar-state.js";
import { GoogleCalendarService } from "./calendar/google-calendar.js";
import { GitHubScheduleSyncService } from "./github-schedule-sync.js";
import { shouldReviewPullRequestAction, verifyGitHubSignature } from "./github-webhook.js";
import { GeminiReviewProvider } from "./review/gemini-review-provider.js";
import { GitHubReviewService } from "./review/github-review.js";

const POLL_INTERVAL_MS = 5 * 60 * 1000;

export async function withProjectGitHubWebhookLifecycleLock<T>(
  project: StoredProject,
  task: (current: StoredProject) => Promise<T>,
): Promise<T | undefined> {
  return withProjectDeleteLock(project.guildId, project.id, async () => {
    const current = await findProject(project.id);
    if (!current) return undefined;
    return task(current);
  });
}

export async function withProjectIntegrationPollingLifecycleLock<T>(
  project: StoredProject,
  task: (current: StoredProject) => Promise<T>,
): Promise<T | undefined> {
  return withProjectDeleteLock(project.guildId, project.id, async () => {
    const current = await findProject(project.id);
    if (!current) return undefined;
    return task(current);
  });
}

async function getFigmaChannel(client: Client, project: StoredProject): Promise<TextChannel | null> {
  if (!project.figmaChannelId) return null;

  const channel = await client.channels.fetch(project.figmaChannelId).catch(() => null);
  if (!(channel instanceof TextChannel)) {
    console.warn(`Figma 알림 채널을 찾지 못했습니다: ${project.figmaChannelId}`);
    return null;
  }

  return channel;
}

async function getNotionChannel(client: Client, project: StoredProject): Promise<TextChannel | null> {
  if (!project.notionChannelId) return null;

  const channel = await client.channels.fetch(project.notionChannelId).catch(() => null);
  if (!(channel instanceof TextChannel)) {
    console.warn(`Notion 알림 채널을 찾지 못했습니다: ${project.notionChannelId}`);
    return null;
  }

  return channel;
}

async function notifyVersion(client: Client, project: StoredProject, version: FigmaVersion): Promise<void> {
  const channel = await getFigmaChannel(client, project);
  if (!channel) return;

  const fields = [
    { name: "버전", value: version.label || "이름 없음", inline: true },
    { name: "작성자", value: version.user?.handle || "알 수 없음", inline: true },
  ];

  if (version.description?.trim()) {
    fields.push({ name: "설명", value: version.description.trim().slice(0, 1024), inline: false });
  }

  const embed = new EmbedBuilder()
    .setTitle("🎨 Figma 디자인 버전 업데이트")
    .setDescription(`**${project.name}** 프로젝트에 새 이름 있는 버전이 생성되었습니다.`)
    .addFields(fields);

  if (project.figmaUrl) {
    embed.setURL(project.figmaUrl);
  }

  const createdAt = new Date(version.created_at);
  if (!Number.isNaN(createdAt.getTime())) {
    embed.setTimestamp(createdAt);
  }

  await channel.send({ embeds: [embed] });
}

async function notifyComment(client: Client, project: StoredProject, comment: FigmaComment): Promise<void> {
  const channel = await getFigmaChannel(client, project);
  if (!channel) return;

  const message = comment.message?.trim() || "댓글 내용을 불러올 수 없습니다.";
  const embed = new EmbedBuilder()
    .setTitle(comment.parent_id ? "↩️ Figma 새 답글" : "💬 Figma 새 댓글")
    .setDescription(message.slice(0, 4096))
    .addFields(
      { name: "작성자", value: comment.user?.handle || "알 수 없음", inline: true },
      { name: "프로젝트", value: project.name, inline: true },
    );

  if (project.figmaUrl) {
    embed.setURL(project.figmaUrl);
  }

  const createdAt = new Date(comment.created_at);
  if (!Number.isNaN(createdAt.getTime())) {
    embed.setTimestamp(createdAt);
  }

  await channel.send({ embeds: [embed] });
}

async function notifyNotionUpdate(client: Client, project: StoredProject, page: NotionPageSnapshot): Promise<void> {
  const channel = await getNotionChannel(client, project);
  if (!channel) return;

  const embed = new EmbedBuilder()
    .setTitle("📝 Notion 기능명세서 업데이트")
    .setDescription(`**${project.name}** 프로젝트의 기능명세서가 수정되었습니다.`);

  if (project.notionUrl) {
    embed.setURL(project.notionUrl);
  }

  const editedAt = new Date(page.last_edited_time);
  if (!Number.isNaN(editedAt.getTime())) {
    embed.setTimestamp(editedAt);
  }

  await channel.send({ embeds: [embed] });
}

export type ProjectPollingDependencies = {
  notifyVersion?: typeof notifyVersion;
  notifyComment?: typeof notifyComment;
  notifyNotionUpdate?: typeof notifyNotionUpdate;
  updateProject?: typeof updateProject;
  recordHistory?: typeof recordPollingProjectHistory;
};

export async function pollProjectVersions(
  client: Client,
  figma: FigmaWebhookService,
  project: StoredProject,
  deps: ProjectPollingDependencies = {},
): Promise<void> {
  if (!project.figmaFileKey || !project.figmaChannelId) return;
  const notify = deps.notifyVersion ?? notifyVersion;
  const update = deps.updateProject ?? updateProject;
  const record = deps.recordHistory ?? recordPollingProjectHistory;

  const versions = await figma.listNamedVersions(project.figmaFileKey);
  const latest = versions.at(-1);
  if (!latest) return;
  const cursor = project.figmaLastVersionId ?? project.figmaWebhookId;
  if (!cursor) {
    await update(project.id, { figmaLastVersionId: latest.id, figmaWebhookId: latest.id });
    return;
  }

  let newVersions: FigmaVersion[] = [];
  if (cursor === NO_FIGMA_VERSION) {
    newVersions = versions;
  } else {
    const cursorIndex = versions.findIndex((version) => version.id === cursor);
    if (cursorIndex < 0) {
      await update(project.id, { figmaLastVersionId: latest.id, figmaWebhookId: latest.id });
      return;
    }
    newVersions = versions.slice(cursorIndex + 1);
  }

  for (const version of newVersions) {
    await notify(client, project, version);
    await update(project.id, { figmaLastVersionId: version.id, figmaWebhookId: version.id });
    await record(project, figmaVersionHistoryFact(project.figmaFileKey, version.id));
  }
}

export async function pollProjectComments(
  client: Client,
  figma: FigmaWebhookService,
  project: StoredProject,
  deps: ProjectPollingDependencies = {},
): Promise<void> {
  if (!project.figmaFileKey || !project.figmaChannelId) return;
  const notify = deps.notifyComment ?? notifyComment;
  const update = deps.updateProject ?? updateProject;
  const record = deps.recordHistory ?? recordPollingProjectHistory;

  const comments = await figma.listComments(project.figmaFileKey);
  const currentIds = comments.map((comment) => comment.id);
  if (!project.figmaKnownCommentIds) {
    await update(project.id, { figmaKnownCommentIds: currentIds });
    return;
  }

  const knownIds = new Set(project.figmaKnownCommentIds);
  const newComments = comments.filter((comment) => !knownIds.has(comment.id));
  for (const comment of newComments) {
    await notify(client, project, comment);
    knownIds.add(comment.id);
    await update(project.id, { figmaKnownCommentIds: [...knownIds] });
    await record(project, figmaCommentHistoryFact(project.figmaFileKey, comment.id));
  }
  await update(project.id, { figmaKnownCommentIds: currentIds });
}

export async function pollProjectNotion(
  client: Client,
  notion: NotionService,
  project: StoredProject,
  deps: ProjectPollingDependencies = {},
): Promise<void> {
  if (!project.notionPageId || !project.notionChannelId) return;
  const notify = deps.notifyNotionUpdate ?? notifyNotionUpdate;
  const update = deps.updateProject ?? updateProject;
  const record = deps.recordHistory ?? recordPollingProjectHistory;

  const page = await notion.getPage(project.notionPageId);
  const previous = project.notionLastEditedTime;
  if (!previous) {
    await update(project.id, { notionLastEditedTime: page.last_edited_time });
    return;
  }
  if (page.last_edited_time === previous) return;

  const previousTime = new Date(previous).getTime();
  const currentTime = new Date(page.last_edited_time).getTime();
  if (!Number.isNaN(previousTime) && !Number.isNaN(currentTime) && currentTime <= previousTime) {
    await update(project.id, { notionLastEditedTime: page.last_edited_time });
    return;
  }

  await notify(client, project, page);
  await update(project.id, { notionLastEditedTime: page.last_edited_time });
  await record(project, notionUpdateHistoryFact(project.notionPageId, page.last_edited_time));
}

async function pollAllProjectsUnlocked(client: Client): Promise<void> {
  const figma = new FigmaWebhookService(config.figmaToken);
  const notion = new NotionService(config.notionToken);
  const projects = await listProjects();

  for (const project of projects) {
    try {
      await withProjectIntegrationPollingLifecycleLock(project, async (current) => {
        try {
          await pollProjectVersions(client, figma, current);
        } catch (error) {
          console.error(`Figma 버전 확인 실패 (${current.name})`, error);
        }

        try {
          await pollProjectComments(client, figma, current);
        } catch (error) {
          console.error(`Figma 댓글 확인 실패 (${current.name})`, error);
        }

        try {
          await pollProjectNotion(client, notion, current);
        } catch (error) {
          console.error(`Notion 수정 확인 실패 (${current.name})`, error);
        }
      });
    } catch (error) {
      console.error(`프로젝트 integration polling lifecycle 실패 (${project.name})`, error);
    }
  }
}

async function pollAllProjects(client: Client): Promise<void> {
  await withProjectPollingLock(() => pollAllProjectsUnlocked(client));
}

function repositoryName(project: StoredProject, side: "frontend" | "backend"): string {
  const repo = project[side];
  return (repo.owner + "/" + repo.repo).toLowerCase();
}

async function projectForRepository(fullName: string): Promise<{ project: StoredProject; side: "frontend" | "backend" } | null> {
  const target = fullName.toLowerCase();
  for (const project of await listProjects()) {
    if (repositoryName(project, "frontend") === target) return { project, side: "frontend" };
    if (repositoryName(project, "backend") === target) return { project, side: "backend" };
  }
  return null;
}

async function notifyGitHubAutomation(client: Client, project: StoredProject, side: "frontend" | "backend", text: string): Promise<void> {
  const channelId = side === "frontend" ? project.frontendLogChannelId : project.backendLogChannelId;
  if (!channelId) return;
  const channel = await client.channels.fetch(channelId).catch(() => null);
  if (channel instanceof TextChannel) await channel.send(text).catch(() => undefined);
}

async function dispatchGitHubAutomation(client: Client, event: string, payload: any): Promise<void> {
  const fullName = payload?.repository?.full_name;
  if (typeof fullName !== "string") return;
  const resolved = await projectForRepository(fullName);
  if (!resolved) return;
  const { project, side } = resolved;

  await withProjectGitHubWebhookLifecycleLock(project, async (current) => {
    if (event === "pull_request" && shouldReviewPullRequestAction(String(payload.action ?? ""))) {
      const pullNumber = Number(payload?.pull_request?.number ?? payload?.number);
      const headSha = String(payload?.pull_request?.head?.sha ?? "");
      if (!Number.isInteger(pullNumber) || !headSha) return;
      if (!config.geminiApiKey) {
        await notifyGitHubAutomation(client, current, side, "⚠️ PR 자동 리뷰를 건너뜀: GEMINI_API_KEY가 설정되지 않았습니다.");
        return;
      }
      try {
        const reviewer = new GitHubReviewService(config.githubToken, new GeminiReviewProvider(config.geminiApiKey));
        const result = await reviewer.reviewPullRequest(fullName, pullNumber, headSha);
        if (!result.skipped) await notifyGitHubAutomation(client, current, side, "🤖 PR #" + pullNumber + " 이설 코드리뷰 완료 · inline " + result.findings + "개");
      } catch (error) {
        console.error("PR 자동 리뷰 실패 (" + fullName + "#" + pullNumber + ")", error);
        await notifyGitHubAutomation(client, current, side, "❌ PR #" + pullNumber + " 이설 코드리뷰 실패 · 서버 로그를 확인해주세요.");
      }
      return;
    }

    if (event === "milestone" && current.calendarId) {
      if (!config.googleClientId || !config.googleClientSecret || !config.googleRefreshToken) return;
      const milestone = payload?.milestone;
      if (!milestone || typeof milestone.number !== "number") return;
      const service = new GitHubScheduleSyncService(
        new GoogleCalendarService(config.googleClientId, config.googleClientSecret, config.googleRefreshToken, config.googleRedirectUri),
        new CalendarStateStore(),
      );
      await service.syncMilestone(current.id, current.calendarId, fullName, {
        number: milestone.number,
        title: String(milestone.title ?? ("Milestone #" + milestone.number)),
        dueOn: typeof milestone.due_on === "string" ? milestone.due_on : null,
        state: milestone.state === "closed" || payload.action === "deleted" ? "closed" : "open",
        htmlUrl: String(milestone.html_url ?? ""),
      });
    }
  });
}

function startGitHubHttpServer(client: Client): void {
  if (!config.githubWebhookSecret) {
    console.log("GitHub automation webhook 비활성: GITHUB_WEBHOOK_SECRET 미설정");
    return;
  }
  const port = Number(process.env.WEBHOOK_PORT || process.env.PORT || "8787");
  const server = createServer((req, res) => {
    if (req.method !== "POST" || req.url?.split("?")[0] !== "/github/events") {
      res.writeHead(404).end("not found");
      return;
    }
    const chunks: Buffer[] = [];
    let size = 0;
    let tooLarge = false;
    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > 2 * 1024 * 1024) { tooLarge = true; return; }
      chunks.push(chunk);
    });
    req.on("end", () => {
      if (tooLarge) { res.writeHead(413).end("payload too large"); return; }
      const body = Buffer.concat(chunks);
      const signature = req.headers["x-hub-signature-256"];
      if (!verifyGitHubSignature(config.githubWebhookSecret, body, Array.isArray(signature) ? signature[0] : signature)) {
        res.writeHead(401).end("invalid signature");
        return;
      }
      let payload: unknown;
      try { payload = JSON.parse(body.toString("utf8")); }
      catch { res.writeHead(400).end("invalid json"); return; }
      const eventHeader = req.headers["x-github-event"];
      const event = Array.isArray(eventHeader) ? eventHeader[0] : eventHeader;
      res.writeHead(202).end("accepted");
      if (event) void dispatchGitHubAutomation(client, event, payload).catch((error) => console.error("GitHub webhook 처리 실패 (" + event + ")", error));
    });
  });
  server.listen(port, () => console.log("GitHub automation webhook listening: :" + port + "/github/events"));
}

export function startWebhookServer(client: Client): NodeJS.Timeout {
  startGitHubHttpServer(client);
  let running = false;

  const run = async () => {
    if (running) return;
    running = true;

    try {
      await pollAllProjects(client);
    } finally {
      running = false;
    }
  };

  void run();
  const timer = setInterval(() => void run(), POLL_INTERVAL_MS);
  console.log("Figma 버전/댓글 + Notion 수정 감시 시작: 5분 간격");
  return timer;
}

export function figmaVersionHistoryFact(
  fileKey: string,
  versionId: string,
): StoredProjectActionFact {
  return {
    eventType: "integration-action-recorded",
    source: "figma",
    action: "named-version-notified",
    reference: `figma:${fileKey}:version:${versionId}`,
    summary: "Figma named version notification recorded",
  };
}

export function figmaCommentHistoryFact(
  fileKey: string,
  commentId: string,
): StoredProjectActionFact {
  return {
    eventType: "integration-action-recorded",
    source: "figma",
    action: "comment-notified",
    reference: `figma:${fileKey}:comment:${commentId}`,
    summary: "Figma comment notification recorded",
  };
}

export function notionUpdateHistoryFact(
  pageId: string,
  editedAt: string,
): StoredProjectActionFact {
  return {
    eventType: "integration-action-recorded",
    source: "notion",
    action: "page-update-notified",
    reference: `notion:${pageId}:${editedAt}`,
    summary: "Notion page update notification recorded",
  };
}

async function recordPollingProjectHistory(
  project: StoredProject,
  fact: StoredProjectActionFact,
): Promise<void> {
  const modelRoot = config.iseolModelRoot || resolve(process.cwd(), "data", "iseol");
  try {
    await recordStoredProjectAction({
      modelRoot,
      bindingRoot: modelRoot,
      workspaceRoot: modelRoot,
      guildId: project.guildId,
      storedProjectId: project.id,
      fact,
      at: new Date().toISOString(),
    });
  } catch (error) {
    console.warn(`Discord project polling history failed (${project.name}/${fact.action})`, error);
  }
}
