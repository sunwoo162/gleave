import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { saveIdeaLabCampaign } from "../../src/idea-lab/campaign-store.js";
import { savePrototypeProduction } from "../../src/idea-lab/production-store.js";
import { savePrototypeCandidate } from "../../src/project-model/prototype-store.js";
import { saveProjectWorkspace } from "../../src/project-model/workspace-store.js";
import { saveHarnessRun } from "../../src/harness/run-store.js";
import type { HarnessRuntimeRunEnvelope } from "../../src/harness/contracts.js";

export const at = "2026-09-21T00:00:00.000Z";
export function fixtureRun(runId: string, status: "DONE" | "WAITING_EXTERNAL" | "WAITING_AGENT", mode: "idea-lab" | "project-workspace" = "idea-lab"): HarnessRuntimeRunEnvelope {
  return { version: 1, request: { version: 1, runId, mode, objective: "Synthetic objective", targetRoot: "synthetic-only", projectId: "workspace-existing" },
    preflight: { version: 1, runId, status: "ready" },
    state: { version: 1, stage: status === "DONE" ? "DONE" : status === "WAITING_AGENT" ? "CONTEXT" : "IMPLEMENT", status, completedStages: [], skippedStages: [], updatedAt: at },
    evidence: [{ version: 1, id: "fixture-evidence", kind: "deployment", stage: "DEPLOY", recordedAt: at, summary: "Synthetic evidence" }], updatedAt: at };
}

export async function readModelFixture() {
  const root = await mkdtemp(join(tmpdir(), "iseol-read-model-"));
  const dataRoot = join(root, "idea-data");
  const harnessRoot = join(root, "idea-runs");
  const projectModelRoot = join(root, "project-model");
  const projectHarnessRoot = join(root, "project-runs");
  const hostFile = join(root, "runtime.json");
  await writeFile(hostFile, JSON.stringify({ dataRoot, modelRoot: join(dataRoot, "idea-lab"), runRoot: harnessRoot,
    webWorkerRoot: join(root, "workers"), browserProfileRoot: join(root, "profile"), projectModelRoot,
    projectRunRoot: projectHarnessRoot, projectWebWorkerRoot: join(root, "project-workers"), projectDesktopStateRoot: join(root, "desktop") }));
  await saveIdeaLabCampaign(dataRoot, { version: 1, id: "campaign-fixture", seed: "Synthetic campaign", constraints: [], targetReadyCount: 2,
    productionConcurrency: 1, proposalIds: ["proposal-wait"], productionIds: ["production-wait"], status: "producing", createdAt: at, updatedAt: at });
  await savePrototypeProduction(dataRoot, { version: 1, id: "production-wait", campaignId: "campaign-fixture", proposalId: "proposal-wait", runId: "run-wait",
    repositoryUrl: "https://example.invalid/repo", sandboxRoot: join(root, "sandbox"), worktreeRoot: join(root, "sandbox", "worktree"), branch: "fixture", baseRef: "main", status: "running", createdAt: at, updatedAt: at });
  await saveHarnessRun(harnessRoot, fixtureRun("run-wait", "WAITING_EXTERNAL"));
  await saveHarnessRun(harnessRoot, fixtureRun("run-ready", "DONE"));
  await savePrototypeCandidate(dataRoot, { version: 1, id: "prototype-ready", title: "Ready fixture", concept: "Synthetic preview",
    repository: { url: "https://example.invalid/repo", branch: "fixture", commitSha: "abc123" }, deployment: { url: "https://example.invalid/preview" },
    runIds: ["run-ready"], status: "candidate", ideaLabOrigin: { campaignId: "campaign-fixture", proposalId: "proposal-ready", productionId: "production-ready" }, createdAt: at, updatedAt: at });
  await saveProjectWorkspace(projectModelRoot, { version: 1, id: "workspace-existing", name: "Existing workspace", status: "active",
    genesis: { prototypeId: "legacy-reference", repository: { url: "https://example.invalid/repo", branch: "main", commitSha: "abc123" }, deployment: { url: "https://example.invalid/old" }, runs: [], promotedAt: at },
    tree: [{ id: "root", kind: "root", title: "Existing work", status: "in-progress", runIds: [], createdAt: at, updatedAt: at }], createdAt: at, updatedAt: at });
  await saveHarnessRun(projectHarnessRoot, fixtureRun("run-agent-wait", "WAITING_AGENT", "project-workspace"));
  return { root, dataRoot, modelRoot: dataRoot, harnessRoot, projectModelRoot, projectHarnessRoot, hostFile };
}
