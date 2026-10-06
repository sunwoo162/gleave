import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  EmbedBuilder,
  ModalBuilder,
  ModalSubmitInteraction,
  TextInputBuilder,
  TextInputStyle,
} from "discord.js";
import { resolve } from "node:path";
import { config } from "../../config.js";
import { recordStoredProjectAction, type StoredProjectActionFact } from "../../discord-project/history-recorder.js";
import { findProject, withProjectDeleteLock, type StoredProject } from "../projects.js";
import { GitHubWebhookService } from "../github.js";
import { GitHubScheduleSyncService } from "../github-schedule-sync.js";
import { CalendarStateStore } from "./calendar-state.js";
import { GoogleCalendarService } from "./google-calendar.js";

export type CalendarAction = "add" | "view" | "update" | "delete" | "issue";

export async function withProjectCalendarLifecycleLock<T>(
  project: StoredProject,
  task: (current: StoredProject) => Promise<T>,
): Promise<T | undefined> {
  return withProjectDeleteLock(project.guildId, project.id, async () => {
    const current = await findProject(project.id);
    if (!current) return undefined;
    return task(current);
  });
}

export function parseCalendarCustomId(customId: string): { action: CalendarAction; projectId: string } | null {
  const match = /^calendar:(add|view|update|delete|issue):([A-Za-z0-9_-]+)$/.exec(customId);
  return match ? { action: match[1] as CalendarAction, projectId: match[2]! } : null;
}

export function parseRepositorySide(value: string): "frontend" | "backend" {
  const normalized = value.trim().toLowerCase();
  if (normalized === "frontend" || normalized === "backend") return normalized;
  throw new Error("repository는 frontend 또는 backend로 입력해주세요.");
}
export function parseKstDateTime(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})$/.exec(value.trim());
  if (!match) throw new Error("날짜는 YYYY-MM-DD HH:mm 형식으로 입력해주세요.");
  const [, y, m, d, hh, mm] = match;
  const date = new Date(`${y}-${m}-${d}T${hh}:${mm}:00+09:00`);
  if (Number.isNaN(date.getTime())) throw new Error("올바른 날짜/시간을 입력해주세요.");
  return `${y}-${m}-${d}T${hh}:${mm}:00+09:00`;
}

export function calendarPanelDescription(calendarUrl?: string): string {
  return [
    "프로젝트 일정을 이설에서 바로 관리합니다.",
    "`일정 추가` · `일정 보기` · `일정 수정` · `일정 삭제` · `GitHub Issue 생성`",
    calendarUrl ? `[Google Calendar 열기](${calendarUrl})` : "Google Calendar OAuth 설정이 필요합니다.",
  ].join("\n");
}

export function calendarPanel(projectId: string, calendarUrl?: string) {
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`calendar:add:${projectId}`).setLabel("일정 추가").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`calendar:view:${projectId}`).setLabel("일정 보기").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`calendar:update:${projectId}`).setLabel("일정 수정").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`calendar:delete:${projectId}`).setLabel("일정 삭제").setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId(`calendar:issue:${projectId}`).setLabel("GitHub Issue 생성").setStyle(ButtonStyle.Success),
  );
  return {
    embeds: [new EmbedBuilder().setTitle("📅 프로젝트 일정").setDescription(calendarPanelDescription(calendarUrl))],
    components: [row],
  };
}

function calendarService(): GoogleCalendarService {
  return new GoogleCalendarService(config.googleClientId, config.googleClientSecret, config.googleRefreshToken, config.googleRedirectUri);
}

function textInput(id: string, label: string, placeholder: string, style = TextInputStyle.Short) {
  return new ActionRowBuilder<TextInputBuilder>().addComponents(
    new TextInputBuilder().setCustomId(id).setLabel(label).setPlaceholder(placeholder).setRequired(true).setStyle(style),
  );
}

async function showEventModal(interaction: ButtonInteraction, action: "add" | "update") {
  const parsed = parseCalendarCustomId(interaction.customId)!;
  const modal = new ModalBuilder().setCustomId(`calendar_${action}_modal:${parsed.projectId}`).setTitle(action === "add" ? "일정 추가" : "일정 수정");
  if (action === "update") modal.addComponents(textInput("event_id", "Event ID", "일정 보기에서 확인한 ID"));
  modal.addComponents(
    textInput("title", "일정 제목", "예: 로그인 API 완료"),
    textInput("start", "시작", "2026-09-01 14:00"),
    textInput("end", "종료", "2026-09-01 15:00"),
  );
  await interaction.showModal(modal);
}

async function showIssueModal(interaction: ButtonInteraction) {
  const parsed = parseCalendarCustomId(interaction.customId)!;
  const modal = new ModalBuilder().setCustomId(`calendar_issue_modal:${parsed.projectId}`).setTitle("GitHub Issue + 일정 생성");
  modal.addComponents(
    textInput("repository", "저장소", "frontend 또는 backend"),
    textInput("title", "Issue 제목", "예: 로그인 API 구현"),
    textInput("body", "Issue 내용", "완료 조건/작업 내용", TextInputStyle.Paragraph),
    textInput("start", "시작", "2026-09-01 14:00"),
    textInput("end", "종료", "2026-09-01 15:00"),
  );
  await interaction.showModal(modal);
}
async function showDeleteModal(interaction: ButtonInteraction) {
  const parsed = parseCalendarCustomId(interaction.customId)!;
  const modal = new ModalBuilder().setCustomId(`calendar_delete_modal:${parsed.projectId}`).setTitle("일정 삭제");
  modal.addComponents(textInput("event_id", "Event ID", "삭제할 일정 ID"));
  await interaction.showModal(modal);
}

export async function handleCalendarButton(interaction: ButtonInteraction): Promise<boolean> {
  const parsed = parseCalendarCustomId(interaction.customId);
  if (!parsed) return false;
  const project = await findProject(parsed.projectId);
  if (!project || project.guildId !== interaction.guildId) {
    await interaction.reply({ content: "프로젝트 정보를 찾을 수 없습니다.", ephemeral: true });
    return true;
  }
  if (parsed.action === "add" || parsed.action === "update") {
    await showEventModal(interaction, parsed.action);
    return true;
  }
  if (parsed.action === "delete") {
    await showDeleteModal(interaction);
    return true;
  }
  if (parsed.action === "issue") {
    await showIssueModal(interaction);
    return true;
  }
  if (!project.calendarId) {
    await interaction.reply({ content: "Google Calendar OAuth 설정이 필요합니다.", ephemeral: true });
    return true;
  }
  await interaction.deferReply({ ephemeral: true });
  const events = await withProjectCalendarLifecycleLock(project, async (current) => {
    if (!current.calendarId) return null;
    return calendarService().listEvents(current.calendarId);
  });
  if (events === undefined) {
    await interaction.editReply("프로젝트 정보를 찾을 수 없습니다.");
    return true;
  }
  if (events === null) {
    await interaction.editReply("Google Calendar OAuth 설정이 필요합니다.");
    return true;
  }
  const lines = events.slice(0, 10).map((event) => `• **${event.summary ?? "제목 없음"}** · \`${event.id}\`\n  ${event.start?.dateTime ?? event.start?.date ?? "시간 없음"}`);
  await interaction.editReply(lines.length ? lines.join("\n") : "예정된 일정이 없습니다.");
  return true;
}

export async function handleCalendarModal(interaction: ModalSubmitInteraction): Promise<boolean> {
  const match = /^calendar_(add|update|delete|issue)_modal:([A-Za-z0-9_-]+)$/.exec(interaction.customId);
  if (!match) return false;
  const action = match[1]!;
  const project = await findProject(match[2]!);
  if (!project || project.guildId !== interaction.guildId || !project.calendarId) {
    await interaction.reply({ content: "프로젝트 Calendar 연결 정보를 찾을 수 없습니다.", ephemeral: true });
    return true;
  }
  await interaction.deferReply({ ephemeral: true });
  const handled = await withProjectCalendarLifecycleLock(project, async (current) => {
    if (!current.calendarId) return false;
    if (action === "issue") {
      const side = parseRepositorySide(interaction.fields.getTextInputValue("repository"));
      const repository = current[side];
      const title = interaction.fields.getTextInputValue("title").trim();
      const body = interaction.fields.getTextInputValue("body").trim();
      const start = parseKstDateTime(interaction.fields.getTextInputValue("start"));
      const end = parseKstDateTime(interaction.fields.getTextInputValue("end"));
      if (new Date(end).getTime() <= new Date(start).getTime()) throw new Error("종료 시간은 시작 시간보다 뒤여야 합니다.");
      const github = new GitHubWebhookService(config.githubToken);
      const linked = await new GitHubScheduleSyncService(calendarService(), new CalendarStateStore()).createLinkedIssue(
        current.id,
        current.calendarId,
        `${repository.owner}/${repository.repo}`,
        { title, body, start, end },
        { createIssue: (_repository, issueTitle, issueBody) => github.createIssue(repository, issueTitle, issueBody) },
      );
      await recordCalendarProjectHistory(
        current,
        githubIssueCalendarHistoryFact(linked.issueUrl, linked.issueNumber),
      );
      await interaction.editReply(`✅ GitHub Issue #${linked.issueNumber} + Google Calendar 일정 생성 완료\n${linked.issueUrl}`);
      return true;
    }
    const service = calendarService();
    if (action === "delete") {
      const eventId = interaction.fields.getTextInputValue("event_id").trim();
      await service.deleteEvent(current.calendarId, eventId);
      await new CalendarStateStore().removeEvent(current.id, current.calendarId, eventId);
      await recordCalendarProjectHistory(current, calendarHistoryFact("deleted", eventId));
      await interaction.editReply(`✅ 일정 \`${eventId}\` 삭제 완료`);
      return true;
    }
    const title = interaction.fields.getTextInputValue("title").trim();
    const start = parseKstDateTime(interaction.fields.getTextInputValue("start"));
    const end = parseKstDateTime(interaction.fields.getTextInputValue("end"));
    if (new Date(end).getTime() <= new Date(start).getTime()) throw new Error("종료 시간은 시작 시간보다 뒤여야 합니다.");
    if (action === "add") {
      const event = await service.createEvent(current.calendarId, { summary: title, start, end, metadata: { iseolProjectId: current.id, source: "discord" } });
      await recordCalendarProjectHistory(current, calendarHistoryFact("created", event.id));
      await interaction.editReply(`✅ **${title}** 일정 추가 완료\nEvent ID: \`${event.id}\``);
      return true;
    }
    const eventId = interaction.fields.getTextInputValue("event_id").trim();
    await service.updateEvent(current.calendarId, eventId, { summary: title, start, end, metadata: { iseolProjectId: current.id, source: "discord" } });
    await recordCalendarProjectHistory(current, calendarHistoryFact("updated", eventId));
    await interaction.editReply(`✅ **${title}** 일정 수정 완료`);
    return true;
  });
  if (handled !== true) {
    await interaction.editReply("프로젝트 Calendar 연결 정보를 찾을 수 없습니다.");
  }
  return true;
}

export function calendarHistoryFact(
  action: "created" | "updated" | "deleted",
  eventId: string,
): StoredProjectActionFact {
  const actionName = `calendar-event-${action}`;
  return {
    eventType: "integration-action-recorded",
    source: "calendar",
    action: actionName,
    reference: `calendar:event:${eventId}`,
    summary: `Calendar event ${action}`,
  };
}

async function recordCalendarProjectHistory(
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
    console.warn(`Discord project history record failed (${project.name}/${fact.action})`, error);
  }
}

export function githubIssueCalendarHistoryFact(
  issueUrl: string,
  issueNumber: number,
): StoredProjectActionFact {
  return {
    eventType: "integration-action-recorded",
    source: "github",
    action: "github-issue-calendar-created",
    reference: `github:issue:${issueUrl}`,
    summary: `GitHub issue #${issueNumber} linked to Calendar`,
  };
}
