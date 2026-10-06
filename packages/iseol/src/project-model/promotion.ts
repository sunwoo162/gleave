import { loadHarnessRunEvents } from "../harness/event-store.js";
import { loadHarnessRun } from "../harness/run-store.js";
import type {
  GenesisRunSnapshot,
  ProjectHistoryEvent,
  ProjectWorkspace,
  PrototypeCandidate,
} from "./contracts.js";
import { assertPromotionReadyPrototype } from "./contracts.js";
import { appendProjectHistoryEvent, loadProjectHistory } from "./history-store.js";
import { loadPrototypeCandidate, updatePrototypeCandidate } from "./prototype-store.js";
import { loadProjectWorkspace, saveProjectWorkspace } from "./workspace-store.js";
import { withDurableProjectPromotionLock } from "./promotion-lock.js";

export type PromotePrototypeInput = {
  modelRoot: string;
  projectModelRoot?: string;
  harnessRoot: string;
  prototypeId: string;
  promotedAt: string;
};

const promotionInFlight = new Map<string, Promise<ProjectWorkspace>>();

function workspaceIdFor(prototypeId: string): string {
  return `project-${prototypeId}`;
}

async function importGenesisRun(
  harnessRoot: string,
  runId: string,
): Promise<GenesisRunSnapshot> {
  const run = await loadHarnessRun(harnessRoot, runId);
  if (!run) throw new Error(`Genesis Run not found: ${runId}`);
  const events = await loadHarnessRunEvents(harnessRoot, runId);
  return {
    runId,
    objective: run.request.objective,
    stage: run.state.stage,
    status: run.state.status,
    ...(run.preflight.policy?.effectiveSha256
      ? { policySha256: run.preflight.policy.effectiveSha256 }
      : {}),
    evidence: run.evidence.map((item) => ({ ...item })),
    events: events.map((event) => ({ ...event })),
  };
}

function createWorkspace(
  candidate: PrototypeCandidate,
  runs: GenesisRunSnapshot[],
  promotedAt: string,
): ProjectWorkspace {
  const id = workspaceIdFor(candidate.id);
  return {
    version: 1,
    id,
    name: candidate.title,
    status: "active",
    genesis: {
      prototypeId: candidate.id,
      repository: { ...candidate.repository },
      deployment: { ...candidate.deployment },
      ...(candidate.ideaLabOrigin ? { ideaLabOrigin: { ...candidate.ideaLabOrigin } } : {}),
      runs,
      promotedAt,
    },
    tree: [{
      id: "root",
      kind: "root",
      title: candidate.title,
      status: "in-progress",
      runIds: [],
      createdAt: promotedAt,
      updatedAt: promotedAt,
    }],
    createdAt: promotedAt,
    updatedAt: promotedAt,
  };
}

async function ensureHistory(
  modelRoot: string,
  workspace: ProjectWorkspace,
): Promise<void> {
  const existing = await loadProjectHistory(modelRoot, workspace.id);
  const existingIds = new Set(existing.map((event) => event.id));
  const events: ProjectHistoryEvent[] = [{
    version: 1,
    id: `promotion-${workspace.genesis.prototypeId}`,
    projectId: workspace.id,
    type: "project-promoted",
    at: workspace.genesis.promotedAt,
    summary: `Promoted prototype ${workspace.genesis.prototypeId}`,
    prototypeId: workspace.genesis.prototypeId,
  }];
  for (const run of workspace.genesis.runs) {
    events.push({
      version: 1,
      id: `genesis-${run.runId}`,
      projectId: workspace.id,
      type: "genesis-run-imported",
      at: workspace.genesis.promotedAt,
      summary: `Imported Genesis Run ${run.runId}`,
      runId: run.runId,
      prototypeId: workspace.genesis.prototypeId,
    });
  }

  for (const event of events) {
    if (!existingIds.has(event.id)) {
      await appendProjectHistoryEvent(modelRoot, event);
      existingIds.add(event.id);
    }
  }
}

async function markPromoted(
  modelRoot: string,
  candidate: PrototypeCandidate,
  projectId: string,
  at: string,
): Promise<void> {
  if (candidate.status === "promoted" && candidate.promotedProjectId === projectId) return;
  await updatePrototypeCandidate(modelRoot, candidate.id, {
    status: "promoted",
    promotedProjectId: projectId,
    updatedAt: at,
  });
}

async function promotePrototypeOnce(
  input: PromotePrototypeInput,
): Promise<ProjectWorkspace> {
  return withDurableProjectPromotionLock(input.projectModelRoot ?? input.modelRoot, input.prototypeId, async () => {
    const candidate = await loadPrototypeCandidate(input.modelRoot, input.prototypeId);
    if (!candidate) throw new Error(`Prototype not found: ${input.prototypeId}`);
    assertPromotionReadyPrototype(candidate);

    const projectId = workspaceIdFor(candidate.id);
    const projectModelRoot = input.projectModelRoot ?? input.modelRoot;
    const existing = await loadProjectWorkspace(projectModelRoot, projectId);
    if (existing) {
      if (existing.genesis.prototypeId !== candidate.id) {
        throw new Error(`Project workspace identity mismatch: ${projectId}`);
      }
      await ensureHistory(projectModelRoot, existing);
      await markPromoted(input.modelRoot, candidate, projectId, input.promotedAt);
      return existing;
    }
    if (candidate.status === "promoted" && candidate.promotedProjectId === projectId) {
      throw new Error(`Promoted prototype workspace is missing: ${projectId}`);
    }

    const runs: GenesisRunSnapshot[] = [];
    for (const runId of candidate.runIds) {
      runs.push(await importGenesisRun(input.harnessRoot, runId));
    }

    const workspace = createWorkspace(candidate, runs, input.promotedAt);
    await saveProjectWorkspace(projectModelRoot, workspace);
    await ensureHistory(projectModelRoot, workspace);
    await markPromoted(input.modelRoot, candidate, workspace.id, input.promotedAt);
    return workspace;
  }, { waitForMs: 2_000 });
}

export async function promotePrototype(
  input: PromotePrototypeInput,
): Promise<ProjectWorkspace> {
  const projectModelRoot = input.projectModelRoot ?? input.modelRoot;
  const key = `${projectModelRoot}\0${input.prototypeId}`;
  const active = promotionInFlight.get(key);
  if (active) return active;
  const operation = promotePrototypeOnce(input);
  promotionInFlight.set(key, operation);
  try {
    return await operation;
  } finally {
    if (promotionInFlight.get(key) === operation) promotionInFlight.delete(key);
  }
}
