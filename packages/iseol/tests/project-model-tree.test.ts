import assert from "node:assert/strict";
import test from "node:test";
import type { ProjectWorkspace } from "../src/project-model/contracts.js";
import {
  addProjectTreeNode,
  attachRunToProjectTreeNode,
  findProjectTreeNode,
  updateProjectTreeNodeStatus,
} from "../src/project-model/project-tree.js";

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

test("tree adds area feature and task nodes without mutating input", () => {
  const original = workspace();
  const withArea = addProjectTreeNode(original, {
    id: "auth",
    parentId: "root",
    kind: "area",
    title: "Authentication",
    at: "2026-09-07T01:10:00.000Z",
  });
  const withFeature = addProjectTreeNode(withArea, {
    id: "login",
    parentId: "auth",
    kind: "feature",
    title: "Login",
    at: "2026-09-07T01:11:00.000Z",
  });
  const withTask = addProjectTreeNode(withFeature, {
    id: "login-form",
    parentId: "login",
    kind: "task",
    title: "Build login form",
    at: "2026-09-07T01:12:00.000Z",
  });

  assert.equal(original.tree.length, 1);
  assert.equal(withTask.tree.length, 4);
  assert.equal(findProjectTreeNode(withTask, "login-form")?.parentId, "login");
});

test("tree rejects duplicate ids, missing parents, and extra root nodes", () => {
  const original = workspace();
  assert.throws(
    () => addProjectTreeNode(original, { id: "root", parentId: "root", kind: "area", title: "Duplicate", at: "x" }),
    /already exists/,
  );
  assert.throws(
    () => addProjectTreeNode(original, { id: "orphan", parentId: "missing", kind: "feature", title: "Orphan", at: "x" }),
    /parent.*not found/i,
  );
  assert.throws(
    () => addProjectTreeNode(original, { id: "root-2", kind: "root", title: "Second root", at: "x" }),
    /root node already exists/i,
  );
});

test("tree status updates and run attachment are immutable and deduplicated", () => {
  const original = addProjectTreeNode(workspace(), {
    id: "profile",
    parentId: "root",
    kind: "feature",
    title: "Profile",
    at: "2026-09-07T01:10:00.000Z",
  });
  const updated = updateProjectTreeNodeStatus(
    original,
    "profile",
    "in-progress",
    "2026-09-07T01:20:00.000Z",
  );
  const attached = attachRunToProjectTreeNode(
    updated,
    "profile",
    "run-123",
    "2026-09-07T01:21:00.000Z",
  );
  const attachedAgain = attachRunToProjectTreeNode(
    attached,
    "profile",
    "run-123",
    "2026-09-07T01:22:00.000Z",
  );

  assert.equal(findProjectTreeNode(original, "profile")?.status, "planned");
  assert.equal(findProjectTreeNode(updated, "profile")?.status, "in-progress");
  assert.deepEqual(findProjectTreeNode(attachedAgain, "profile")?.runIds, ["run-123"]);
  assert.notEqual(attachedAgain, original);
});

test("tree operations reject missing nodes", () => {
  const original = workspace();
  assert.throws(
    () => updateProjectTreeNodeStatus(original, "missing", "done", "2026-09-07T01:00:00.000Z"),
    /node not found/i,
  );
  assert.throws(
    () => attachRunToProjectTreeNode(original, "missing", "run-1", "2026-09-07T01:00:00.000Z"),
    /node not found/i,
  );
});
