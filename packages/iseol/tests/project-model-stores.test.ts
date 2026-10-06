import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import type { ProjectHistoryEvent, ProjectWorkspace, PrototypeCandidate } from "../src/project-model/contracts.js";
import {
  listPrototypeCandidates,
  loadPrototypeCandidate,
  savePrototypeCandidate,
  updatePrototypeCandidate,
} from "../src/project-model/prototype-store.js";
import { listProjectWorkspaces, loadProjectWorkspace, saveProjectWorkspace } from "../src/project-model/workspace-store.js";
import { appendProjectHistoryEvent, appendProjectHistoryEventOnce, loadProjectHistory } from "../src/project-model/history-store.js";
import { withDurableProjectHistoryLock } from "../src/project-model/history-lock.js";
import { ensurePortfolioDocument, loadPortfolioDocument, savePortfolioDocument, updatePortfolioDocument } from "../src/project-model/portfolio-store.js";
import { createPortfolioDocument } from "../src/project-model/portfolio-store.js";
import { withDurablePortfolioLock } from "../src/project-model/portfolio-lock.js";
import { withDurableProjectWorkspaceLock } from "../src/project-model/workspace-lock.js";
import { withDurablePrototypeLock } from "../src/project-model/prototype-lock.js";

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

function workspace(): ProjectWorkspace {
  return {
    version: 1,
    id: "project-prototype-001",
    name: "Study Race",
    status: "active",
    genesis: {
      prototypeId: "prototype-001",
      repository: candidate().repository,
      deployment: candidate().deployment,
      runs: [],
      promotedAt: "2026-09-07T01:00:00.000Z",
    },
    tree: [{
      id: "root",
      kind: "root",
      title: "Study Race",
      status: "in-progress",
      runIds: [],
      createdAt: "2026-09-07T01:00:00.000Z",
      updatedAt: "2026-09-07T01:00:00.000Z",
    }],
    createdAt: "2026-09-07T01:00:00.000Z",
    updatedAt: "2026-09-07T01:00:00.000Z",
  };
}

test("prototype store round trips and updates atomically", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-project-model-"));
  await savePrototypeCandidate(root, candidate());
  assert.deepEqual(await loadPrototypeCandidate(root, "prototype-001"), candidate());

  const updated = await updatePrototypeCandidate(root, "prototype-001", {
    status: "archived",
    updatedAt: "2026-09-07T00:10:00.000Z",
  });
  assert.equal(updated?.status, "archived");
  assert.equal((await loadPrototypeCandidate(root, "prototype-001"))?.updatedAt, "2026-09-07T00:10:00.000Z");
});

test("concurrent prototype candidate patches preserve disjoint fields", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-prototype-lock-"));
  await savePrototypeCandidate(root, candidate());
  await Promise.all([
    updatePrototypeCandidate(root, "prototype-001", { status: "verified", updatedAt: "2026-09-07T00:11:00.000Z" }),
    updatePrototypeCandidate(root, "prototype-001", { promotedProjectId: "project-prototype-001" }),
  ]);
  const updated = await loadPrototypeCandidate(root, "prototype-001");
  assert.equal(updated?.status, "verified");
  assert.equal(updated?.promotedProjectId, "project-prototype-001");
});

test("prototype listing waits for each durable prototype lock", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-prototype-list-lock-"));
  await savePrototypeCandidate(root, candidate());
  let releaseHolder!: () => void;
  const holderStarted = new Promise<void>((resolve) => {
    void withDurablePrototypeLock(root, candidate().id, async () => {
      resolve();
      await new Promise<void>((release) => { releaseHolder = release; });
    });
  });
  await holderStarted;

  let settled = false;
  const listing = listPrototypeCandidates(root).then((value) => {
    settled = true;
    return value;
  });
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(settled, false);

  releaseHolder();
  assert.deepEqual((await listing).map((item) => item.id), [candidate().id]);
});

test("prototype reads wait for the durable prototype lock", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-prototype-read-lock-"));
  await savePrototypeCandidate(root, candidate());
  let releaseHolder!: () => void;
  const holderStarted = new Promise<void>((resolve) => {
    void withDurablePrototypeLock(root, candidate().id, async () => {
      resolve();
      await new Promise<void>((release) => { releaseHolder = release; });
    });
  });
  await holderStarted;

  let settled = false;
  const reading = loadPrototypeCandidate(root, candidate().id).then((value) => {
    settled = true;
    return value;
  });
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(settled, false);

  releaseHolder();
  assert.equal((await reading)?.id, candidate().id);
});

test("concurrent portfolio document patches preserve disjoint sections", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-portfolio-lock-"));
  const document = createPortfolioDocument({
    version: 1,
    projectId: "project-prototype-001",
    generatedAt: "2026-09-07T01:00:00.000Z",
    overview: "Overview",
    features: ["Feature"],
    technology: ["TypeScript"],
    troubleshooting: [],
    claims: [{ id: "project-overview", text: "Overview", evidenceIds: ["e1"] }],
    readme: "# Project",
  });
  await savePortfolioDocument(root, document);
  await Promise.all([
    updatePortfolioDocument(root, document.projectId, { sections: [{ id: "features", content: "Edited feature", included: true }] }, "2026-09-07T01:01:00.000Z"),
    updatePortfolioDocument(root, document.projectId, { sections: [{ id: "technology", content: "Edited technology", included: true }] }, "2026-09-07T01:02:00.000Z"),
  ]);
  const updated = await loadPortfolioDocument(root, document.projectId);
  assert.equal(updated?.sections.find((section) => section.id === "features")?.content, "Edited feature");
  assert.equal(updated?.sections.find((section) => section.id === "technology")?.content, "Edited technology");
});

test("portfolio document creation waits for the durable portfolio lock", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-portfolio-create-lock-"));
  const draft = {
    version: 1 as const,
    projectId: "project-prototype-001",
    generatedAt: "2026-09-07T01:00:00.000Z",
    overview: "Overview",
    features: [],
    technology: [],
    troubleshooting: [],
    claims: [],
    readme: "# Project",
  };
  let releaseHolder!: () => void;
  const holderStarted = new Promise<void>((resolve) => {
    void withDurablePortfolioLock(root, draft.projectId, async () => {
      resolve();
      await new Promise<void>((release) => { releaseHolder = release; });
    });
  });
  await holderStarted;
  let settled = false;
  const creation = ensurePortfolioDocument(root, draft, draft.generatedAt);
  void creation.then(() => { settled = true; }, () => { settled = true; });
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(settled, false);
  releaseHolder();
  assert.equal((await creation).projectId, draft.projectId);
});

test("portfolio document reads wait for the durable portfolio lock", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-portfolio-read-lock-"));
  const document = createPortfolioDocument({
    version: 1,
    projectId: "project-prototype-001",
    generatedAt: "2026-09-07T01:00:00.000Z",
    overview: "Overview",
    features: [],
    technology: [],
    troubleshooting: [],
    claims: [],
    readme: "# Project",
  });
  await savePortfolioDocument(root, document);
  let releaseHolder!: () => void;
  const holderStarted = new Promise<void>((resolve) => {
    void withDurablePortfolioLock(root, document.projectId, async () => {
      resolve();
      await new Promise<void>((release) => { releaseHolder = release; });
    });
  });
  await holderStarted;

  let settled = false;
  const reading = loadPortfolioDocument(root, document.projectId).then((value) => {
    settled = true;
    return value;
  });
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(settled, false);

  releaseHolder();
  assert.equal((await reading)?.projectId, document.projectId);
});

test("workspace store round trips and missing ids return null", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-project-model-"));
  await saveProjectWorkspace(root, workspace());
  assert.deepEqual(await loadProjectWorkspace(root, "project-prototype-001"), workspace());
  assert.equal(await loadProjectWorkspace(root, "project-missing"), null);
  assert.equal(await loadPrototypeCandidate(root, "prototype-missing"), null);
});

test("workspace listing waits for each durable Project Workspace lock", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-project-workspace-list-lock-"));
  await saveProjectWorkspace(root, workspace());
  let releaseHolder!: () => void;
  const holderStarted = new Promise<void>((resolve) => {
    void withDurableProjectWorkspaceLock(root, workspace().id, async () => {
      resolve();
      await new Promise<void>((release) => { releaseHolder = release; });
    });
  });
  await holderStarted;

  let settled = false;
  const listing = listProjectWorkspaces(root).then((value) => {
    settled = true;
    return value;
  });
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(settled, false);

  releaseHolder();
  assert.deepEqual((await listing).map((item) => item.id), [workspace().id]);
});

test("workspace reads wait for the durable Project Workspace lock", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-project-workspace-read-lock-"));
  await saveProjectWorkspace(root, workspace());
  let releaseHolder!: () => void;
  const holderStarted = new Promise<void>((resolve) => {
    void withDurableProjectWorkspaceLock(root, workspace().id, async () => {
      resolve();
      await new Promise<void>((release) => { releaseHolder = release; });
    });
  });
  await holderStarted;

  let settled = false;
  const reading = loadProjectWorkspace(root, workspace().id).then((value) => {
    settled = true;
    return value;
  });
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(settled, false);

  releaseHolder();
  assert.equal((await reading)?.id, workspace().id);
});

test("workspace writes wait for the durable Project Workspace lock", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-project-workspace-write-lock-"));
  await saveProjectWorkspace(root, workspace());
  let releaseHolder!: () => void;
  const holderStarted = new Promise<void>((resolve) => {
    void withDurableProjectWorkspaceLock(root, workspace().id, async () => {
      resolve();
      await new Promise<void>((release) => { releaseHolder = release; });
    });
  });
  await holderStarted;

  let settled = false;
  const writing = saveProjectWorkspace(root, { ...workspace(), name: "Updated workspace" }).then(() => {
    settled = true;
  });
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(settled, false);

  releaseHolder();
  await writing;
  assert.equal((await loadProjectWorkspace(root, workspace().id))?.name, "Updated workspace");
});

test("project history is append-only and reloads in order", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-project-model-"));
  const first: ProjectHistoryEvent = {
    version: 1,
    id: "event-001",
    projectId: "project-prototype-001",
    type: "project-promoted",
    at: "2026-09-07T01:00:00.000Z",
    summary: "Promoted",
    prototypeId: "prototype-001",
  };
  const second: ProjectHistoryEvent = {
    version: 1,
    id: "event-002",
    projectId: "project-prototype-001",
    type: "genesis-run-imported",
    at: "2026-09-07T01:00:01.000Z",
    summary: "Imported run",
    runId: "run-001",
  };
  await appendProjectHistoryEvent(root, first);
  await appendProjectHistoryEvent(root, second);
  assert.deepEqual(await loadProjectHistory(root, "project-prototype-001"), [first, second]);
});

test("project history reads wait for the durable history lock", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-project-history-read-lock-"));
  const event: ProjectHistoryEvent = {
    version: 1,
    id: "event-read-lock",
    projectId: "project-prototype-001",
    type: "project-promoted",
    at: "2026-09-07T01:00:00.000Z",
    summary: "Promoted",
  };
  await appendProjectHistoryEventOnce(root, event);
  let releaseHolder!: () => void;
  const holderStarted = new Promise<void>((resolve) => {
    void withDurableProjectHistoryLock(root, event.projectId, async () => {
      resolve();
      await new Promise<void>((release) => { releaseHolder = release; });
    });
  });
  await holderStarted;

  let settled = false;
  const reading = loadProjectHistory(root, event.projectId).then((value) => {
    settled = true;
    return value;
  });
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(settled, false);

  releaseHolder();
  assert.deepEqual(await reading, [event]);
});

test("concurrent identical project history append-once calls remain one event", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-project-history-lock-"));
  const event: ProjectHistoryEvent = {
    version: 1,
    id: "event-once",
    projectId: "project-prototype-001",
    type: "purpose-selected",
    at: "2026-09-07T01:00:00.000Z",
    summary: "Purpose selected",
    action: "purpose-selection",
  };
  const results = await Promise.all([
    appendProjectHistoryEventOnce(root, event),
    appendProjectHistoryEventOnce(root, event),
  ]);
  assert.deepEqual(results.sort(), [false, true]);
  assert.deepEqual(await loadProjectHistory(root, event.projectId), [event]);
});

test("project model stores reject unsafe ids", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-project-model-"));
  await assert.rejects(loadPrototypeCandidate(root, "../escape"), /Invalid Iseol Project Model id/);
  await assert.rejects(loadProjectWorkspace(root, "../escape"), /Invalid Iseol Project Model id/);
  await assert.rejects(loadProjectHistory(root, "../escape"), /Invalid Iseol Project Model id/);
});

test("project work request persistence uses the Windows transient rename retry boundary", async () => {
  const source = await readFile(resolve(process.cwd(), "src/project-model/work-request.ts"), "utf8");
  assert.match(source, /renameWithTransientRetry\(temp, path\)/);
});
