import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ProjectWorkspace, PrototypeCandidate } from "../src/project-model/contracts.js";
import {
  listPrototypeCandidates,
  savePrototypeCandidate,
} from "../src/project-model/prototype-store.js";
import {
  listProjectWorkspaces,
  saveProjectWorkspace,
} from "../src/project-model/workspace-store.js";

function prototype(id: string, createdAt: string): PrototypeCandidate {
  return {
    version: 1,
    id,
    title: id,
    concept: `Concept ${id}`,
    repository: { url: `https://github.com/example/${id}`, branch: "main", commitSha: `${id}-sha` },
    deployment: { url: `https://${id}.example.com` },
    runIds: [],
    status: "candidate",
    createdAt,
    updatedAt: createdAt,
  };
}

function workspace(id: string, createdAt: string): ProjectWorkspace {
  return {
    version: 1,
    id,
    name: id,
    status: "active",
    genesis: {
      prototypeId: id.replace(/^project-/, ""),
      repository: { url: `https://github.com/example/${id}`, branch: "main", commitSha: `${id}-sha` },
      deployment: { url: `https://${id}.example.com` },
      runs: [],
      promotedAt: createdAt,
    },
    tree: [{
      id: "root",
      kind: "root",
      title: id,
      status: "in-progress",
      runIds: [],
      createdAt,
      updatedAt: createdAt,
    }],
    createdAt,
    updatedAt: createdAt,
  };
}

test("prototype listing is deterministic and ignores non-json files", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-web-list-"));
  await savePrototypeCandidate(root, prototype("prototype-b", "2026-09-07T02:00:00.000Z"));
  await savePrototypeCandidate(root, prototype("prototype-a", "2026-09-07T01:00:00.000Z"));
  await mkdir(join(root, "prototypes"), { recursive: true });
  await writeFile(join(root, "prototypes", "README.txt"), "ignore me", "utf8");

  const listed = await listPrototypeCandidates(root);
  assert.deepEqual(listed.map((item) => item.id), ["prototype-a", "prototype-b"]);
});

test("workspace listing is deterministic and missing roots are empty", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-web-list-"));
  assert.deepEqual(await listPrototypeCandidates(root), []);
  assert.deepEqual(await listProjectWorkspaces(root), []);

  await saveProjectWorkspace(root, workspace("project-b", "2026-09-07T02:00:00.000Z"));
  await saveProjectWorkspace(root, workspace("project-a", "2026-09-07T01:00:00.000Z"));
  await writeFile(join(root, "projects", "README.txt"), "ignore me", "utf8");

  const listed = await listProjectWorkspaces(root);
  assert.deepEqual(listed.map((item) => item.id), ["project-a", "project-b"]);
});

test("json entries that are expected project records are not silently ignored", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-web-list-"));
  await mkdir(join(root, "prototypes"), { recursive: true });
  await writeFile(join(root, "prototypes", "broken.json"), "{broken", "utf8");

  await assert.rejects(listPrototypeCandidates(root), /JSON|Unexpected|Expected/);
});
