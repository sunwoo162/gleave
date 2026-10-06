import assert from "node:assert/strict";
import test from "node:test";
import { readFile, rm, writeFile } from "node:fs/promises";
import { ChannelType, Collection, TextChannel } from "discord.js";
import { handleScrumCommand } from "../src/commands/scrum.js";
import { deleteProject, withProjectDeleteLock, type StoredProject } from "../src/services/projects.js";

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

test("scrum create skips channel creation when the project is deleted while waiting", async () => {
  const file = "data/projects.json";
  let previous: Buffer | null = null;
  try { previous = await readFile(file); } catch { /* test creates the file */ }

  const project: StoredProject = {
    id: "scrum-create-lifecycle-lock",
    name: "Scrum lifecycle lock",
    guildId: "scrum-create-lifecycle-lock-guild",
    categoryId: "scrum-create-lifecycle-lock-category",
    organization: "iseol",
    frontend: { owner: "iseol", repo: "frontend" },
    backend: { owner: "iseol", repo: "backend" },
  };
  let createdChannels = 0;
  const category = { id: project.categoryId, type: ChannelType.GuildCategory, name: "📁 Scrum lifecycle lock" };
  const guild = {
    id: project.guildId,
    channels: {
      fetch: async (id?: string) => id ? category : new Collection([[category.id, category]]),
      create: async () => {
        createdChannels += 1;
        const channel = Object.create(TextChannel.prototype) as TextChannel & { send: () => Promise<void> };
        channel.id = `created-${createdChannels}`;
        channel.send = async () => undefined;
        return channel;
      },
    },
  };
  const replies: string[] = [];
  const interaction = {
    guild,
    guildId: project.guildId,
    memberPermissions: { has: () => true },
    inGuild: () => true,
    options: {
      getSubcommand: () => "create",
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
    const creation = handleScrumCommand(interaction as any);
    await delay(80);
    release();

    await Promise.all([deletion, creation]);
    assert.equal(createdChannels, 0);
    assert.match(replies.at(-1) ?? "", /프로젝트를 찾을 수 없습니다/);
  } finally {
    if (previous) await writeFile(file, previous);
    else await rm(file, { force: true });
  }
});
