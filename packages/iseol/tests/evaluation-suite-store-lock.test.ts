import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { EvaluationSuite } from "../src/evaluation/contracts.js";
import { withDurableEvaluationSuiteLock } from "../src/evaluation/suite-lock.js";
import { listEvaluationSuites, loadEvaluationSuite, saveEvaluationSuite } from "../src/evaluation/suite-store.js";

const suite: EvaluationSuite = {
  version: 1,
  suiteId: "evaluation-suite-store-lock-test",
  name: "잠금 테스트",
  mode: "quick",
  scenarioIds: ["scenario-1"],
  defaultSeed: "seed",
  createdAt: "2026-09-30T00:00:00.000Z",
};

test("evaluation suite public reads and writes wait for the durable suite lock", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-evaluation-suite-store-lock-"));
  try {
    await saveEvaluationSuite(root, suite);

    let releaseHolder!: () => void;
    const holderReleased = new Promise<void>((resolve) => { releaseHolder = resolve; });
    const lockHeld = withDurableEvaluationSuiteLock(root, suite.suiteId, async () => holderReleased, { waitForMs: 0 });
    await new Promise((resolve) => setTimeout(resolve, 25));

    let saveSettled = false;
    let loadSettled = false;
    let listSettled = false;
    const updated = { ...suite, name: "잠금 해제 후 테스트" };
    const save = saveEvaluationSuite(root, updated).then(() => { saveSettled = true; });
    const load = loadEvaluationSuite(root, suite.suiteId).then(() => { loadSettled = true; });
    const list = listEvaluationSuites(root).then(() => { listSettled = true; });

    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.equal(saveSettled, false);
    assert.equal(loadSettled, false);
    assert.equal(listSettled, false);

    releaseHolder();
    await lockHeld;
    await Promise.all([save, load, list]);
    assert.equal((await loadEvaluationSuite(root, suite.suiteId))?.name, updated.name);
    assert.equal((await listEvaluationSuites(root))[0]?.name, updated.name);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
