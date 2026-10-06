import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { PrototypeCandidate } from "../src/project-model/contracts.js";
import { loadPrototypeCandidate, savePrototypeCandidate } from "../src/project-model/prototype-store.js";
import { withDurablePrototypeLock } from "../src/project-model/prototype-lock.js";

function candidate(): PrototypeCandidate {
  return {
    version: 1,
    id: "prototype-save-lock",
    title: "Prototype save lock",
    concept: "A lock-aware prototype candidate",
    repository: { url: "https://github.com/example/repo", branch: "main", commitSha: "abc123" },
    deployment: { url: "https://prototype.example.com", provider: "vercel", deploymentId: "dpl-lock" },
    runIds: ["run-lock"],
    status: "candidate",
    createdAt: "2026-09-30T07:00:00.000Z",
    updatedAt: "2026-09-30T07:00:00.000Z",
  };
}

test("prototype candidate saves wait for the durable prototype lock", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-project-prototype-save-lock-"));
  const initial = candidate();
  await savePrototypeCandidate(root, initial);

  let release!: () => void;
  const holderStarted = new Promise<void>((resolveStarted) => {
    void withDurablePrototypeLock(root, initial.id, async () => {
      resolveStarted();
      await new Promise<void>((resolveRelease) => { release = resolveRelease; });
    }, { waitForMs: 2_000 });
  });
  await holderStarted;

  let settled = false;
  const saving = savePrototypeCandidate(root, { ...initial, status: "verified", updatedAt: "2026-09-30T07:00:01.000Z" }).then(() => {
    settled = true;
  });
  await new Promise((resolveWait) => setTimeout(resolveWait, 50));
  assert.equal(settled, false);

  release();
  await saving;
  assert.equal((await loadPrototypeCandidate(root, initial.id))?.status, "verified");
});
