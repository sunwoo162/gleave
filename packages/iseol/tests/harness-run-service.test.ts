import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DevelopmentRunRequest } from "../src/harness/contracts.js";
import { assertPreflightReady } from "../src/harness/preflight.js";
import { loadHarnessRun } from "../src/harness/run-store.js";
import { withDurableHarnessRunLock } from "../src/harness/run-lock.js";
import { createDevelopmentRun, pauseHarnessRun, refreshDevelopmentRunPreflight, resumeHarnessRun } from "../src/harness/run-service.js";

async function fixture(withGlobal = true) {
  const root = await mkdtemp(join(tmpdir(), "iseol-run-service-"));
  const iseolRoot = join(root, "iseol");
  const targetRoot = join(root, "target");
  const storeRoot = join(root, "runs");
  await mkdir(join(iseolRoot, "docs"), { recursive: true });
  await mkdir(targetRoot, { recursive: true });
  if (withGlobal) {
    await writeFile(join(iseolRoot, "docs", "HARNESS_ENGINEERING.md"), "global policy\n");
  }
  return { iseolRoot, targetRoot, storeRoot };
}

function request(targetRoot: string): DevelopmentRunRequest {
  return {
    version: 1,
    runId: "run-001",
    mode: "project-workspace",
    objective: "Implement profile editing",
    targetRoot,
  };
}

test("createDevelopmentRun preflights and persists a ready run", async () => {
  const { iseolRoot, targetRoot, storeRoot } = await fixture();
  const run = await createDevelopmentRun(request(targetRoot), {
    iseolRoot,
    storeRoot,
    loadedAt: "2026-09-07T00:00:00.000Z",
  });

  assert.equal(run.preflight.status, "ready");
  assert.doesNotThrow(() => assertPreflightReady(run.preflight));
  assert.equal(run.state?.stage, "CONTEXT");
  assert.equal(run.state?.status, "READY");
  assert.deepEqual(run.evidence, []);
  assert.deepEqual(await loadHarnessRun(storeRoot, "run-001"), run);
});

test("createDevelopmentRun persists blocked preflight for diagnosis", async () => {
  const { iseolRoot, targetRoot, storeRoot } = await fixture(false);
  const run = await createDevelopmentRun(request(targetRoot), { iseolRoot, storeRoot });

  assert.equal(run.preflight.status, "blocked");
  assert.throws(() => assertPreflightReady(run.preflight), /Development Run preflight is not ready/);
  assert.deepEqual(await loadHarnessRun(storeRoot, "run-001"), run);
});

test("preflight refresh waits for the durable Run mutation lock", async () => {
  const { iseolRoot, targetRoot, storeRoot } = await fixture();
  await createDevelopmentRun(request(targetRoot), {
    iseolRoot,
    storeRoot,
    loadedAt: "2026-09-07T00:00:00.000Z",
  });

  let release!: () => void;
  let acquired!: () => void;
  const holderAcquired = new Promise<void>((resolve) => { acquired = resolve; });
  const holder = withDurableHarnessRunLock(storeRoot, "run-001", async () => {
    acquired();
    await new Promise<void>((resolve) => { release = resolve; });
  }, { waitForMs: 0 });
  await holderAcquired;

  const refresh = refreshDevelopmentRunPreflight({
    iseolRoot,
    storeRoot,
    runId: "run-001",
    loadedAt: "2026-09-07T00:00:02.000Z",
  });
  const completedBeforeRelease = await Promise.race([
    refresh.then(() => true),
    new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 40)),
  ]);
  assert.equal(completedBeforeRelease, false);

  release();
  await Promise.all([holder, refresh]);
  assert.equal((await loadHarnessRun(storeRoot, "run-001"))?.updatedAt, "2026-09-07T00:00:02.000Z");
});

test("Run creation waits for the durable Run mutation lock before persisting", async () => {
  const { iseolRoot, targetRoot, storeRoot } = await fixture();
  let release!: () => void;
  let acquired!: () => void;
  const holderAcquired = new Promise<void>((resolve) => { acquired = resolve; });
  const holder = withDurableHarnessRunLock(storeRoot, "run-001", async () => {
    acquired();
    await new Promise<void>((resolve) => { release = resolve; });
  }, { waitForMs: 0 });
  await holderAcquired;

  const create = createDevelopmentRun(request(targetRoot), {
    iseolRoot,
    storeRoot,
    loadedAt: "2026-09-07T00:00:03.000Z",
  });
  const completedBeforeRelease = await Promise.race([
    create.then(() => true),
    new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 40)),
  ]);
  assert.equal(completedBeforeRelease, false);

  release();
  await Promise.all([holder, create]);
  assert.equal((await loadHarnessRun(storeRoot, "run-001"))?.updatedAt, "2026-09-07T00:00:03.000Z");
});

test("pause and resume wait for the durable Run mutation lock", async () => {
  const { iseolRoot, targetRoot, storeRoot } = await fixture();
  await createDevelopmentRun(request(targetRoot), {
    iseolRoot,
    storeRoot,
    loadedAt: "2026-09-07T00:00:00.000Z",
  });

  let release!: () => void;
  let acquired!: () => void;
  const holderAcquired = new Promise<void>((resolve) => { acquired = resolve; });
  const holder = withDurableHarnessRunLock(storeRoot, "run-001", async () => {
    acquired();
    await new Promise<void>((resolve) => { release = resolve; });
  }, { waitForMs: 0 });
  await holderAcquired;

  const pause = pauseHarnessRun(storeRoot, "run-001", "2026-09-07T00:00:04.000Z");
  assert.equal(await Promise.race([
    pause.then(() => true),
    new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 40)),
  ]), false);
  release();
  await Promise.all([holder, pause]);
  assert.equal((await loadHarnessRun(storeRoot, "run-001"))?.state.status, "PAUSED");

  let releaseResume!: () => void;
  let acquiredResume!: () => void;
  const resumeHolderAcquired = new Promise<void>((resolve) => { acquiredResume = resolve; });
  const resumeHolder = withDurableHarnessRunLock(storeRoot, "run-001", async () => {
    acquiredResume();
    await new Promise<void>((resolve) => { releaseResume = resolve; });
  }, { waitForMs: 0 });
  await resumeHolderAcquired;
  const resume = resumeHarnessRun(storeRoot, "run-001", "2026-09-07T00:00:05.000Z");
  assert.equal(await Promise.race([
    resume.then(() => true),
    new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 40)),
  ]), false);
  releaseResume();
  await Promise.all([resumeHolder, resume]);
  assert.equal((await loadHarnessRun(storeRoot, "run-001"))?.state.status, "READY");
});
