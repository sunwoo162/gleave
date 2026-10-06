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

test("scrum delete waits for the project lifecycle lock before deleting a channel", async () => {
  const file = "data/projects.json";
  let previous: Buffer | null = null;
  try { previous = await readFile(file); } catch { /* test creates the file */ }

  const project: StoredProject = {
    id: "scrum-delete-lifecycle-lock",
    name: "Scrum delete lifecycle lock",
    guildId: "scrum-delete-lifecycle-lock-guild",
    categoryId: "scrum-delete-lifecycle-lock-category",
    organization: "iseol",
    frontend: { owner: "iseol", repo: "frontend" },
    backend: { owner: "iseol", repo: "backend" },
  };
  let deletedChannels = 0;
  const scrumChannel = Object.create(TextChannel.prototype) as TextChannel & { delete: () => Promise<void> };
  scrumChannel.id = "scrum-delete-lifecycle-lock-channel";
  scrumChannel.name = DAILY_SCRUM_CHANNEL_NAME;
  scrumChannel.parentId = project.categoryId;
  scrumChannel.type = ChannelType.GuildText;
  scrumChannel.delete = async () => { deletedChannels += 1; };
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
    memberPermissions: { has: () => true },
    inGuild: () => true,
    options: {
      getSubcommand: () => "delete",
      getString: () => project.id,
    },
    deferReply: async () => undefined,
    editReply: async (content: string) => { replies.push(content); },
  };

  let release!: () => void;
  const held = new Promise<void>((resolve) => { release = resolve; });

  try {
    await writeFile(file, JSON.stringify([project], null, 2), "utf8");
    const deletion = withProjectDeleteLock(project.guildId, project.id, async () => {
      await held;
      assert.equal(await deleteProject(project.id), true);
    });

    await delay(30);
    const scrumDeletion = handleScrumCommand(interaction as any);
    await delay(80);
    release();

    await Promise.all([deletion, scrumDeletion]);
    assert.equal(deletedChannels, 0);
    assert.match(replies.at(-1) ?? "", /프로젝트를 찾을 수 없습니다/);
  } finally {
    if (previous) await writeFile(file, previous);
    else await rm(file, { force: true });
  }
});
