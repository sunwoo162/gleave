import assert from "node:assert/strict";
import test from "node:test";
import { readFile, rm, writeFile } from "node:fs/promises";
import { ChannelType, Collection } from "discord.js";
import { ensureProjectDiscussionChannels } from "../src/services/project-discussion.js";
import { deleteProject, withProjectDeleteLock, type StoredProject } from "../src/services/projects.js";

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

test("project discussion repair skips a project deleted while waiting for its lifecycle lock", async () => {
  const file = "data/projects.json";
  let previous: Buffer | null = null;
  try { previous = await readFile(file); } catch { /* test creates the file */ }

  const project: StoredProject = {
    id: "project-discussion-lifecycle-lock",
    name: "Lifecycle lock",
    guildId: "discussion-lifecycle-lock-guild",
    categoryId: "discussion-lifecycle-lock-category",
    organization: "iseol",
    frontend: { owner: "iseol", repo: "frontend" },
    backend: { owner: "iseol", repo: "backend" },
  };
  let createdChannels = 0;
  const category = { id: project.categoryId, type: ChannelType.GuildCategory, name: "📁 Lifecycle lock" };
  const guild = {
    channels: {
      fetch: async () => new Collection([[category.id, category]]),
      create: async () => {
        createdChannels += 1;
        return { id: `created-${createdChannels}`, type: ChannelType.GuildText, parentId: category.id, name: "created" };
      },
    },
  };
  const client = {
    guilds: {
      cache: { get: (guildId: string) => guildId === project.guildId ? guild : null },
      fetch: async () => guild,
    },
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
    const repair = ensureProjectDiscussionChannels(client as any);
    await delay(80);
    release();

    await Promise.all([deletion, repair]);
    assert.equal(createdChannels, 0);
  } finally {
    if (previous) await writeFile(file, previous);
    else await rm(file, { force: true });
  }
});
