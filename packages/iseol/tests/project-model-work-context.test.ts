import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ProjectWorkspace } from "../src/project-model/contracts.js";
import { addProjectTreeNode, attachRunToProjectTreeNode } from "../src/project-model/project-tree.js";
import { resolveProjectWorkContext } from "../src/project-model/work-context.js";
import { saveProjectWorkspace } from "../src/project-model/workspace-store.js";

function workspace(): ProjectWorkspace {
  return {
    version: 1,
    id: "project-prototype-001",
    name: "Study Race",
    status: "active",
    genesis: {
      prototypeId: "prototype-001",
      repository: { url: "https://github.com/example/repo", branch: "main", commitSha: "abc123" },
      deployment: { url: "https://study.example.com" },
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

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "iseol-work-context-"));
  let current = addProjectTreeNode(workspace(), {
    id: "profile",
    parentId: "root",
    kind: "feature",
    title: "Profile",
    at: "2026-09-07T01:10:00.000Z",
  });
  current = attachRunToProjectTreeNode(
    current,
    "profile",
    "run-123",
    "2026-09-07T01:11:00.000Z",
  );
  await saveProjectWorkspace(root, current);
  return { root, current };
}

test("resolves project-only and node-scoped work context", async () => {
  const { root } = await fixture();
  assert.deepEqual(
    await resolveProjectWorkContext({ modelRoot: root, projectId: "project-prototype-001" }),
    { projectId: "project-prototype-001" },
  );
  assert.deepEqual(
    await resolveProjectWorkContext({
      modelRoot: root,
      projectId: "project-prototype-001",
      nodeId: "profile",
    }),
    { projectId: "project-prototype-001", nodeId: "profile" },
  );
});

test("resolves node and attached Run together", async () => {
  const { root } = await fixture();
  assert.deepEqual(
    await resolveProjectWorkContext({
      modelRoot: root,
      projectId: "project-prototype-001",
      nodeId: "profile",
      runId: "run-123",
    }),
    { projectId: "project-prototype-001", nodeId: "profile", runId: "run-123" },
  );
});

test("rejects missing nodes and run-node mismatches", async () => {
  const { root } = await fixture();
  assert.equal(
    await resolveProjectWorkContext({
      modelRoot: root,
      projectId: "project-prototype-001",
      nodeId: "missing",
    }),
    null,
  );
  assert.equal(
    await resolveProjectWorkContext({
      modelRoot: root,
      projectId: "project-prototype-001",
      nodeId: "profile",
      runId: "run-other",
    }),
    null,
  );
  assert.equal(
    await resolveProjectWorkContext({
      modelRoot: root,
      projectId: "project-prototype-001",
      runId: "run-123",
    }),
    null,
  );
  assert.equal(
    await resolveProjectWorkContext({ modelRoot: root, projectId: "project-missing" }),
    null,
  );
});
