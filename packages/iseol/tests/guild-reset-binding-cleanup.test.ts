import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  createDiscordProjectBinding,
  deleteDiscordProjectBindingsForGuild,
  loadDiscordProjectBinding,
} from "../src/discord-project/binding-store.js";

test("guild reset binding cleanup removes only the target guild bindings", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-guild-reset-bindings-"));
  try {
    await createDiscordProjectBinding(root, {
      guildId: "guild-a",
      storedProjectId: "stored-a",
      projectId: "workspace-a",
      defaultNodeId: "root-a",
      at: "2026-09-30T00:00:00.000Z",
    });
    await createDiscordProjectBinding(root, {
      guildId: "guild-b",
      storedProjectId: "stored-b",
      projectId: "workspace-b",
      defaultNodeId: "root-b",
      at: "2026-09-30T00:00:00.000Z",
    });

    assert.equal(await deleteDiscordProjectBindingsForGuild(root, "guild-a"), 1);
    assert.equal(await loadDiscordProjectBinding(root, "guild-a", "stored-a"), null);
    assert.ok(await loadDiscordProjectBinding(root, "guild-b", "stored-b"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
