import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createSelfHostedConfig } from "../scripts/init-self-hosted.mjs";

test("self-hosted setup creates a portable env and runtime config", async () => {
  const root = await mkdtemp(join(tmpdir(), "npc-self-hosted-"));
  await assert.rejects(
    () => createSelfHostedConfig({ projectRoot: root, dataRoot: join(root, "runtime-data"), envExamplePath: join(root, ".env.example") }),
    /\.env\.example/,
  );
});

test("self-hosted setup writes roots under the selected data directory", async () => {
  const root = await mkdtemp(join(tmpdir(), "npc-self-hosted-"));
  await writeFile(join(root, ".env.example"), "# empty\n", "utf8");
  await createSelfHostedConfig({ projectRoot: root, dataRoot: join(root, "runtime-data"), envExamplePath: join(root, ".env.example") });
  const config = JSON.parse(await readFile(join(root, "iseol-runtime.json"), "utf8"));
  assert.equal(config.dataRoot, join(root, "runtime-data"));
  assert.equal(config.modelRoot, join(root, "runtime-data", "iseol"));
  assert.equal(config.runRoot, join(root, "runtime-data", "runs"));
  assert.equal(config.browserProfileRoot, join(root, "runtime-data", "browser-profile"));
  assert.equal((await readFile(join(root, ".env"), "utf8")), "# empty\n");
});

test("self-hosted setup refuses to overwrite existing files without force", async () => {
  const root = await mkdtemp(join(tmpdir(), "npc-self-hosted-"));
  await writeFile(join(root, ".env.example"), "# empty\n", "utf8");
  await createSelfHostedConfig({ projectRoot: root, envExamplePath: join(root, ".env.example") });
  await assert.rejects(() => createSelfHostedConfig({ projectRoot: root, envExamplePath: join(root, ".env.example") }), /already exists/);
});
