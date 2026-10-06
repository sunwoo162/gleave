import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { HarnessRuntimeRunEnvelope, HarnessRunEvent } from "../src/harness/contracts.js";
import { appendHarnessRunEvent } from "../src/harness/event-store.js";
import { saveHarnessRun } from "../src/harness/run-store.js";
import { PROTOTYPE_BROWSER_ACCEPTANCE_CHECKS, type PrototypeCandidate } from "../src/project-model/contracts.js";
import { loadProjectHistory } from "../src/project-model/history-store.js";
import { promotePrototype } from "../src/project-model/promotion.js";
import { loadPrototypeCandidate, recordPrototypeBrowserAcceptance, savePrototypeCandidate } from "../src/project-model/prototype-store.js";
import { loadProjectWorkspace } from "../src/project-model/workspace-store.js";
import { withDurableProjectPromotionLock } from "../src/project-model/promotion-lock.js";
import { withDurablePrototypeLock } from "../src/project-model/prototype-lock.js";
import { archivePrototypeCandidate } from "../src/idea-lab/prototype-actions.js";

function candidate(): PrototypeCandidate {
  return {
    version: 1,
    id: "prototype-001",
    title: "Study Race",
    concept: "Compete on study time",
    repository: { url: "https://github.com/example/repo", branch: "main", commitSha: "abc123" },
    deployment: { url: "https://study.example.com", provider: "vercel", deploymentId: "dpl_1" },
    runIds: ["run-001"],
    status: "candidate",
    createdAt: "2026-09-07T00:00:00.000Z",
    updatedAt: "2026-09-07T00:00:00.000Z",
  };
}

function runEnvelope(): HarnessRuntimeRunEnvelope {
  return {
    version: 1,
    request: {
      version: 1,
      runId: "run-001",
      mode: "idea-lab",
      objective: "Build Study Race prototype",
      targetRoot: "C:/repo",
    },
    preflight: {
      version: 1,
      runId: "run-001",
      status: "ready",
      policy: {
        version: 1,
        loadedAt: "2026-09-07T00:00:00.000Z",
        sources: [],
        effectiveSha256: "a".repeat(64),
      },
    },
    state: {
      version: 1,
      stage: "DONE",
      status: "DONE",
      completedStages: ["PREFLIGHT", "CONTEXT", "ANALYZE", "PLAN", "IMPLEMENT", "TEST"],
      skippedStages: [],
      updatedAt: "2026-09-07T00:30:00.000Z",
    },
    evidence: [{
      version: 1,
      id: "evidence-deploy",
      kind: "deployment",
      stage: "DEPLOY",
      recordedAt: "2026-09-07T00:20:00.000Z",
      summary: "Prototype deployed",
      reference: "dpl_1",
    }],
    updatedAt: "2026-09-07T00:30:00.000Z",
  };
}

function runEvent(): HarnessRunEvent {
  return {
    version: 1,
    id: "event-run-001",
    runId: "run-001",
    type: "stage-completed",
    at: "2026-09-07T00:20:00.000Z",
    stage: "DEPLOY",
    status: "RUNNING",
    summary: "Deployment completed",
    evidenceIds: ["evidence-deploy"],
  };
}

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "iseol-promotion-"));
  const modelRoot = join(root, "model");
  const harnessRoot = join(root, "runs");
  await savePrototypeCandidate(modelRoot, candidate());
  await saveHarnessRun(harnessRoot, runEnvelope());
  await appendHarnessRunEvent(harnessRoot, runEvent());
  return { modelRoot, harnessRoot };
}

test("promotion freezes prototype identity and imports Harness Genesis", async () => {
  const { modelRoot, harnessRoot } = await fixture();
  const promoted = await promotePrototype({
    modelRoot,
    harnessRoot,
    prototypeId: "prototype-001",
    promotedAt: "2026-09-07T01:00:00.000Z",
  });

  assert.equal(promoted.id, "project-prototype-001");
  assert.deepEqual(promoted.genesis.repository, candidate().repository);
  assert.deepEqual(promoted.genesis.deployment, candidate().deployment);
  assert.equal(promoted.genesis.runs.length, 1);
  assert.equal(promoted.genesis.runs[0]?.objective, "Build Study Race prototype");
  assert.equal(promoted.genesis.runs[0]?.policySha256, "a".repeat(64));
  assert.deepEqual(promoted.genesis.runs[0]?.events, [runEvent()]);
});

test("promotion marks candidate promoted and is idempotent on retry", async () => {
  const { modelRoot, harnessRoot } = await fixture();
  const input = {
    modelRoot,
    harnessRoot,
    prototypeId: "prototype-001",
    promotedAt: "2026-09-07T01:00:00.000Z",
  };

  const first = await promotePrototype(input);
  const second = await promotePrototype({ ...input, promotedAt: "2026-09-07T01:10:00.000Z" });
  assert.deepEqual(second, first);

  const savedCandidate = await loadPrototypeCandidate(modelRoot, "prototype-001");
  assert.equal(savedCandidate?.status, "promoted");
  assert.equal(savedCandidate?.promotedProjectId, first.id);

  const history = await loadProjectHistory(modelRoot, first.id);
  assert.equal(history.filter((event) => event.type === "project-promoted").length, 1);
  assert.equal(history.filter((event) => event.type === "genesis-run-imported").length, 1);
  assert.deepEqual(await loadProjectWorkspace(modelRoot, first.id), first);
});

test("promotion waits for the durable cross-service promotion lock", async () => {
  const { modelRoot, harnessRoot } = await fixture();
  let releaseHolder!: () => void;
  const holderStarted = new Promise<void>((resolve) => {
    void withDurableProjectPromotionLock(modelRoot, "prototype-001", async () => {
      resolve();
      await new Promise<void>((release) => { releaseHolder = release; });
    });
  });
  await holderStarted;
  let settled = false;
  const promotion = promotePrototype({ modelRoot, harnessRoot, prototypeId: "prototype-001", promotedAt: "2026-09-07T01:00:00.000Z" }).then((result) => {
    settled = true;
    return result;
  });
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(settled, false);
  releaseHolder();
  assert.equal((await promotion).id, "project-prototype-001");
});

test("missing Genesis Run aborts before promotion state is committed", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-promotion-missing-"));
  const modelRoot = join(root, "model");
  const harnessRoot = join(root, "runs");
  const broken = candidate();
  broken.runIds = ["run-missing"];
  await savePrototypeCandidate(modelRoot, broken);

  await assert.rejects(
    promotePrototype({
      modelRoot,
      harnessRoot,
      prototypeId: broken.id,
      promotedAt: "2026-09-07T01:00:00.000Z",
    }),
    /Genesis Run not found: run-missing/,
  );
  assert.equal((await loadPrototypeCandidate(modelRoot, broken.id))?.status, "candidate");
  assert.equal(await loadProjectWorkspace(modelRoot, "project-prototype-001"), null);
});

test("local-preview promotion requires verified browser acceptance", async () => {
  const { modelRoot, harnessRoot } = await fixture();
  const local = candidate();
  local.deployment = { ...local.deployment, provider: "local-preview", deploymentId: "local-preview:1" };
  local.browserAcceptance = {
    status: "unverified",
    checkedAt: "2026-09-07T00:45:00.000Z",
    checks: Object.fromEntries(PROTOTYPE_BROWSER_ACCEPTANCE_CHECKS.map((check) => [check, "unverified"])) as any,
  };
  await savePrototypeCandidate(modelRoot, local);
  await assert.rejects(() => promotePrototype({ modelRoot, harnessRoot, prototypeId: local.id, promotedAt: "2026-09-07T01:00:00.000Z" }), /browser acceptance/i);
  const checks = Object.fromEntries(PROTOTYPE_BROWSER_ACCEPTANCE_CHECKS.map((check) => [check, "pass"])) as any;
  const accepted = await recordPrototypeBrowserAcceptance(modelRoot, local.id, checks, "2026-09-07T00:50:00.000Z");
  assert.equal(accepted.browserAcceptance?.status, "verified");
  const promoted = await promotePrototype({ modelRoot, harnessRoot, prototypeId: local.id, promotedAt: "2026-09-07T01:00:00.000Z" });
  assert.equal(promoted.id, "project-prototype-001");
});

test("prototype browser acceptance waits for the durable candidate lock", async () => {
  const { modelRoot } = await fixture(true);
  const checks = Object.fromEntries(PROTOTYPE_BROWSER_ACCEPTANCE_CHECKS.map((check) => [check, "pass"])) as any;
  let releaseHolder!: () => void;
  const holderStarted = new Promise<void>((resolve) => {
    void withDurablePrototypeLock(modelRoot, "prototype-001", async () => {
      resolve();
      await new Promise<void>((release) => { releaseHolder = release; });
    });
  });
  await holderStarted;
  let settled = false;
  const acceptance = recordPrototypeBrowserAcceptance(modelRoot, "prototype-001", checks, "2026-09-08T06:00:00.000Z");
  void acceptance.then(() => { settled = true; }, () => { settled = true; });
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(settled, false);
  releaseHolder();
  assert.equal((await acceptance).browserAcceptance?.status, "verified");
});

test("prototype archive waits for the durable candidate lock", async () => {
  const { modelRoot } = await fixture(true);
  let releaseHolder!: () => void;
  const holderStarted = new Promise<void>((resolve) => {
    void withDurablePrototypeLock(modelRoot, "prototype-001", async () => {
      resolve();
      await new Promise<void>((release) => { releaseHolder = release; });
    });
  });
  await holderStarted;
  let settled = false;
  const archive = archivePrototypeCandidate(modelRoot, "prototype-001", "2026-09-08T06:00:00.000Z");
  void archive.then(() => { settled = true; }, () => { settled = true; });
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(settled, false);
  releaseHolder();
  assert.equal((await archive).status, "archived");
});
