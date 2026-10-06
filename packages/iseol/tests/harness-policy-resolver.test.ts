import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveHarnessPolicy } from "../src/harness/policy-resolver.js";

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "iseol-policy-"));
  const iseolRoot = join(root, "iseol");
  const targetRoot = join(root, "target");
  await mkdir(join(iseolRoot, "docs"), { recursive: true });
  await mkdir(join(targetRoot, "docs"), { recursive: true });
  return { iseolRoot, targetRoot };
}

test("policy resolver loads global harness then project harness and agents", async () => {
  const { iseolRoot, targetRoot } = await fixture();
  await writeFile(join(iseolRoot, "docs", "HARNESS_ENGINEERING.md"), "global policy\n");
  await writeFile(join(targetRoot, "docs", "HARNESS_ENGINEERING.md"), "project policy\n");
  await writeFile(join(targetRoot, "AGENTS.md"), "agent policy\n");

  const snapshot = await resolveHarnessPolicy({
    iseolRoot,
    targetRoot,
    loadedAt: "2026-09-07T00:00:00.000Z",
  });

  assert.equal(snapshot.loadedAt, "2026-09-07T00:00:00.000Z");
  assert.deepEqual(snapshot.sources.map((source) => source.kind), [
    "iseol-global",
    "project-harness",
    "project-agents",
  ]);
  assert.equal(snapshot.sources.every((source) => /^[a-f0-9]{64}$/.test(source.sha256)), true);
  assert.equal(/^[a-f0-9]{64}$/.test(snapshot.effectiveSha256), true);
});

test("project harness and agents guidance are optional", async () => {
  const { iseolRoot, targetRoot } = await fixture();
  await writeFile(join(iseolRoot, "docs", "HARNESS_ENGINEERING.md"), "global only\n");

  const snapshot = await resolveHarnessPolicy({ iseolRoot, targetRoot });

  assert.deepEqual(snapshot.sources.map((source) => source.kind), ["iseol-global"]);
});

test("global harness guidance is mandatory", async () => {
  const { iseolRoot, targetRoot } = await fixture();

  await assert.rejects(
    resolveHarnessPolicy({ iseolRoot, targetRoot }),
    /global HARNESS_ENGINEERING\.md/i,
  );
});
