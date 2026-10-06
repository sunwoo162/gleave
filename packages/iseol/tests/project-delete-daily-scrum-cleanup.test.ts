import assert from "node:assert/strict";
import test from "node:test";
import { readFile, rm, writeFile } from "node:fs/promises";
import { ChannelType, Collection } from "discord.js";
import { handleProjectCommand } from "../src/commands/project.js";
import { getDailyScrumRecord, type DailyScrumRecord } from "../src/services/daily-scrum.js";
import type { StoredProject } from "../src/services/projects.js";

test("project deletion clears daily scrum records, reminder cursor, and calendar state", async () => {
  const projectsFile = "data/projects.json";
  const scrumFile = "data/daily-scrum.json";
  const calendarFile = "data/calendar-state.json";
  let previousProjects: Buffer | null = null;
  let previousScrum: Buffer | null = null;
  let previousCalendar: Buffer | null = null;
  try { previousProjects = await readFile(projectsFile); } catch { /* test creates the file */ }
  try { previousScrum = await readFile(scrumFile); } catch { /* test creates the file */ }
  try { previousCalendar = await readFile(calendarFile); } catch { /* test creates the file */ }

  const project: StoredProject = {
    id: "project-delete-daily-scrum-cleanup",
    name: "Project delete daily scrum cleanup",
    guildId: "project-delete-daily-scrum-cleanup-guild",
    categoryId: "project-delete-daily-scrum-cleanup-category",
    organization: "iseol",
    frontend: { owner: "iseol", repo: "frontend" },
    backend: { owner: "iseol", repo: "backend" },
  };
  const record: DailyScrumRecord = {
    guildId: project.guildId,
    projectId: project.id,
    userId: "project-delete-daily-scrum-cleanup-user",
    date: "2026-09-30",
    todo: "todo",
    did: "did",
    channelId: "project-delete-daily-scrum-cleanup-channel",
    messageId: "project-delete-daily-scrum-cleanup-message",
    updatedAt: "2026-09-30T06:00:00.000Z",
  };
  const category = {
    id: project.categoryId,
    type: ChannelType.GuildCategory,
    parentId: null,
    delete: async () => undefined,
  };
  const channels = new Collection<string, any>([[category.id, category]]);
  const guild = {
    id: project.guildId,
    channels: { fetch: async () => channels },
  };
  const replies: string[] = [];
  const interaction = {
    guild,
    inGuild: () => true,
    options: {
      getSubcommand: () => "delete",
      getString: () => project.categoryId,
    },
    deferReply: async () => undefined,
    editReply: async (content: string) => { replies.push(content); },
  };

  try {
    await writeFile(projectsFile, JSON.stringify([project], null, 2), "utf8");
    await writeFile(scrumFile, JSON.stringify({ records: [record], reminderDates: { [project.id]: record.date } }, null, 2), "utf8");
    await writeFile(calendarFile, JSON.stringify([
      { externalKey: `${project.id}:iseol/frontend:issue:1`, projectId: project.id, calendarId: "calendar-deleted", eventId: "event-deleted", source: "issue", repository: "iseol/frontend", number: 1 },
      { externalKey: "other-project:iseol/backend:milestone:2", projectId: "other-project", calendarId: "calendar-other", eventId: "event-other", source: "milestone", repository: "iseol/backend", number: 2 },
    ], null, 2), "utf8");

    await handleProjectCommand(interaction as any);

    assert.equal(await getDailyScrumRecord(project.id, record.userId, record.date), null);
    const dailyScrum = JSON.parse(await readFile(scrumFile, "utf8")) as { records: DailyScrumRecord[]; reminderDates: Record<string, string> };
    assert.deepEqual(dailyScrum.records, []);
    assert.equal(dailyScrum.reminderDates[project.id], undefined);
    const calendarState = JSON.parse(await readFile(calendarFile, "utf8")) as Array<{ projectId: string }>;
    assert.deepEqual(calendarState.map((item) => item.projectId), ["other-project"]);
    assert.match(replies.at(-1) ?? "", /프로젝트 방과 저장 정보를 삭제했습니다/);
  } finally {
    if (previousProjects) await writeFile(projectsFile, previousProjects);
    else await rm(projectsFile, { force: true });
    if (previousScrum) await writeFile(scrumFile, previousScrum);
    else await rm(scrumFile, { force: true });
    if (previousCalendar) await writeFile(calendarFile, previousCalendar);
    else await rm(calendarFile, { force: true });
  }
});
