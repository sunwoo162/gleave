import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { removeGuildRecordsFromFile } from "../src/services/guild-reset.js";
import { withDurableFileStateLock } from "../src/services/file-state-lock.js";

type RecordState = { guildId: string; value: string };

test("guild reset state removal waits for the durable file lock and preserves other guilds", async () => {
  const dir = await mkdtemp(join(tmpdir(), "iseol-guild-reset-lock-"));
  const file = join(dir, "state.json");
  await writeFile(file, JSON.stringify([
    { guildId: "guild-a", value: "remove" },
    { guildId: "guild-b", value: "preserve" },
  ] satisfies RecordState[]), "utf8");

  let release!: () => void;
  const holderStarted = new Promise<void>((resolveStarted) => {
    void withDurableFileStateLock(file, async () => {
      resolveStarted();
      await writeFile(file, JSON.stringify([
        { guildId: "guild-a", value: "remove" },
        { guildId: "guild-b", value: "preserve" },
        { guildId: "guild-c", value: "added-while-waiting" },
      ] satisfies RecordState[]), "utf8");
      await new Promise<void>((resolveRelease) => { release = resolveRelease; });
    }, { waitForMs: 2_000 });
  });
  await holderStarted;

  let settled = false;
  const removal = removeGuildRecordsFromFile<RecordState>(file, "guild-a").then((removed) => {
    settled = true;
    return removed;
  });
  await new Promise((resolveWait) => setTimeout(resolveWait, 50));
  assert.equal(settled, false);

  release();
  assert.deepEqual(await removal, [{ guildId: "guild-a", value: "remove" }]);
  assert.deepEqual(JSON.parse(await readFile(file, "utf8")), [
    { guildId: "guild-b", value: "preserve" },
    { guildId: "guild-c", value: "added-while-waiting" },
  ]);
  await rm(dir, { recursive: true, force: true });
});
