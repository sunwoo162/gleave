import assert from "node:assert/strict";
import test from "node:test";
import { readFile, rm, writeFile } from "node:fs/promises";
import { ChannelType, Collection, TextChannel } from "discord.js";
import { handleScrumCommand } from "../src/commands/scrum.js";
import { DAILY_SCRUM_CHANNEL_NAME } from "../src/services/daily-scrum.js";
import { deleteProject, withProjectDeleteLock, type StoredProject } from "../src/services/projects.js";

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

test("scrum write waits for the project lifecycle lock before posting to a channel", async () => {
  const projectFile = "data/projects.json";
  const scrumFile = "data/daily-scrum.json";
  let previousProjects: Buffer | null = null;
  let previousScrum: Buffer | null = null;
  try { previousProjects = await readFile(projectFile); } catch { /* test creates the file */ }
  try { previousScrum = await readFile(scrumFile); } catch { /* test creates the file */ }

  const project: StoredProject = {
    id: "scrum-write-lifecycle-lock",
    name: "Scrum write lifecycle lock",
    guildId: "scrum-write-lifecycle-lock-guild",
    categoryId: "scrum-write-lifecycle-lock-category",
    organization: "iseol",
    frontend: { owner: "iseol", repo: "frontend" },
    backend: { owner: "iseol", repo: "backend" },
  };
  let sentMessages = 0;
  const sourceChannel = Object.create(TextChannel.prototype) as TextChannel;
  sourceChannel.parentId = project.categoryId;
  const scrumChannel = Object.create(TextChannel.prototype) as TextChannel & {
    send: () => Promise<{ id: string }>;
  };
  scrumChannel.id = "scrum-write-lifecycle-lock-channel";
  scrumChannel.name = DAILY_SCRUM_CHANNEL_NAME;
  scrumChannel.parentId = project.categoryId;
  scrumChannel.type = ChannelType.GuildText;
  scrumChannel.send = async () => {
    sentMessages += 1;
    return { id: `scrum-message-${sentMessages}` };
  };
  const guild = {
    id: project.guildId,
    channels: {
      fetch: async () => new Collection([[scrumChannel.id, scrumChannel]]),
    },
  };
  const replies: string[] = [];
  const interaction = {
    guild,
    guildId: project.guildId,
    channel: sourceChannel,
    user: {
      id: "scrum-write-user",
      globalName: "Scrum writer",
      username: "scrum-writer",
      displayAvatarURL: () => "https://example.com/avatar.png",
    },
    inGuild: () => true,
    options: {
      getSubcommand: () => "write",
      getString: (name: string) => name === "todo" ? "stale todo" : null,
    },
    deferReply: async () => undefined,
    editReply: async (content: string) => { replies.push(content); },
  };

  let release!: () => void;
  const held = new Promise<void>((resolve) => { release = resolve; });

  try {
    await writeFile(projectFile, JSON.stringify([project], null, 2), "utf8");
    const deletion = withProjectDeleteLock(project.guildId, project.id, async () => {
      await held;
      assert.equal(await deleteProject(project.id), true);
    });

    await delay(30);
    const scrumWrite = handleScrumCommand(interaction as any);
    await delay(80);
    release();

    await Promise.all([deletion, scrumWrite]);
    assert.equal(sentMessages, 0);
    assert.match(replies.at(-1) ?? "", /프로젝트를 찾을 수 없습니다/);
  } finally {
    if (previousProjects) await writeFile(projectFile, previousProjects);
    else await rm(projectFile, { force: true });
    if (previousScrum) await writeFile(scrumFile, previousScrum);
    else await rm(scrumFile, { force: true });
  }
});
