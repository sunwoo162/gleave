import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { HarnessRuntimeRunEnvelope } from "../src/harness/contracts.js";
import { saveHarnessRun } from "../src/harness/run-store.js";
import type { PrototypeCandidate } from "../src/project-model/contracts.js";
import { promotePrototype } from "../src/project-model/promotion.js";
import { loadPrototypeCandidate, savePrototypeCandidate } from "../src/project-model/prototype-store.js";
import { archivePrototypeCandidate } from "../src/idea-lab/prototype-actions.js";

const NOW = "2026-09-08T06:00:00.000Z";

function candidate(origin = true): PrototypeCandidate {
  return {
    version: 1, id: "prod-1", title: "Focus Garden", concept: "Grow focus sessions",
    repository: { url: "https://example.invalid/sandbox.git", branch: "idea/camp-1/prod-1", commitSha: "abc123" },
    deployment: { url: "https://preview.invalid/prod-1", provider: "fake-preview", deploymentId: "dep-1" },
    runIds: ["run-prod-1"], status: "candidate",
    ...(origin ? { ideaLabOrigin: { campaignId: "camp-1", proposalId: "proposal-1", productionId: "prod-1" } } : {}),
    createdAt: NOW, updatedAt: NOW,
  };
}

function completedRun(): HarnessRuntimeRunEnvelope {
  return {
    version: 1,
    request: { version: 1, runId: "run-prod-1", mode: "idea-lab", objective: "build", targetRoot: "C:/repo" },
    preflight: { version: 1, runId: "run-prod-1", status: "ready", policy: { version: 1, loadedAt: NOW, sources: [], effectiveSha256: "a".repeat(64) } },
    state: { version: 1, stage: "DONE", status: "DONE", completedStages: ["PREFLIGHT", "CONTEXT", "ANALYZE", "PLAN", "IMPLEMENT", "TEST", "SELF_REVIEW", "COMMIT", "DEPLOY", "PRODUCTION_VERIFY"], skippedStages: [], updatedAt: NOW },
    evidence: [], updatedAt: NOW,
  };
}

async function fixture(origin = true) {
  const root = await mkdtemp(join(tmpdir(), "iseol-idea-promotion-"));
  const modelRoot = join(root, "model");
  const harnessRoot = join(root, "runs");
  await savePrototypeCandidate(modelRoot, candidate(origin));
  await saveHarnessRun(harnessRoot, completedRun());
  return { modelRoot, harnessRoot };
}

test("promotion freezes only the selected Idea Lab origin into Genesis", async () => {
  const { modelRoot, harnessRoot } = await fixture(true);
  const workspace = await promotePrototype({ modelRoot, harnessRoot, prototypeId: "prod-1", promotedAt: NOW });
  assert.deepEqual(workspace.genesis.ideaLabOrigin, candidate().ideaLabOrigin);
  assert.deepEqual(workspace.genesis.repository, candidate().repository);
  assert.deepEqual(workspace.genesis.deployment, candidate().deployment);
});

test("legacy prototype without Idea Lab origin still promotes unchanged", async () => {
  const { modelRoot, harnessRoot } = await fixture(false);
  const workspace = await promotePrototype({ modelRoot, harnessRoot, prototypeId: "prod-1", promotedAt: NOW });
  assert.equal(workspace.genesis.ideaLabOrigin, undefined);
});

test("archive preserves candidate history identity and blocks promotion until restored by policy", async () => {
  const { modelRoot, harnessRoot } = await fixture(true);
  const archived = await archivePrototypeCandidate(modelRoot, "prod-1", NOW);
  assert.equal(archived.status, "archived");
  assert.deepEqual(archived.ideaLabOrigin, candidate().ideaLabOrigin);
  assert.deepEqual(await loadPrototypeCandidate(modelRoot, "prod-1"), archived);
  await assert.rejects(
    () => promotePrototype({ modelRoot, harnessRoot, prototypeId: "prod-1", promotedAt: NOW }),
    /archived/i,
  );
});

test("promoted prototype cannot be archived and archive is idempotent for archived candidates", async () => {
  const { modelRoot, harnessRoot } = await fixture(true);
  await promotePrototype({ modelRoot, harnessRoot, prototypeId: "prod-1", promotedAt: NOW });
  await assert.rejects(() => archivePrototypeCandidate(modelRoot, "prod-1", NOW), /promoted/i);

  const other = { ...candidate(), id: "prod-2", ideaLabOrigin: { campaignId: "camp-1", proposalId: "proposal-2", productionId: "prod-2" } };
  await savePrototypeCandidate(modelRoot, other);
  const first = await archivePrototypeCandidate(modelRoot, "prod-2", NOW);
  const second = await archivePrototypeCandidate(modelRoot, "prod-2", "2026-09-08T06:10:00.000Z");
  assert.deepEqual(second, first);
});
