import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ProjectStore } from "../src/services/projects.js";

function project(guildId: string, name: string) {
  return {
    name,
    guildId,
    categoryId: `${guildId}-${name}`,
    organization: "iseol",
    frontend: { owner: "iseol", repo: "frontend", url: "https://github.com/iseol/frontend" },
    backend: { owner: "iseol", repo: "backend", url: "https://github.com/iseol/backend" },
  };
}

test("project store rejects a duplicate normalized name within one guild", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-project-name-unique-"));
  const store = new ProjectStore(join(root, "projects.json"));

  await store.save(project("guild-1", "NPC"));
  await assert.rejects(
    () => store.save(project("guild-1", " npc ")),
    /already exists/i,
  );
  assert.equal((await store.list()).length, 1);
});

test("project store allows the same normalized name in different guilds", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-project-name-scope-"));
  const store = new ProjectStore(join(root, "projects.json"));

  await store.save(project("guild-1", "NPC"));
  await store.save(project("guild-2", "npc"));

  assert.equal((await store.list()).length, 2);
});
