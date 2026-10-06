import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ProjectWorkspace } from "../src/project-model/contracts.js";
import { saveProjectWorkspace } from "../src/project-model/workspace-store.js";
import { loadProjectHistory } from "../src/project-model/history-store.js";
import { recordDiscordProjectHistory } from "../src/discord-project/history-recorder.js";
import { buildProjectWorkspaceView } from "../src/web-control-plane/view-model.js";

function workspace(): ProjectWorkspace {
  const at = "2026-09-08T08:00:00.000Z";
  return {
    version: 1,
    id: "project-timestamps",
    name: "Timestamp evaluation",
    status: "active",
    genesis: {
      prototypeId: "prototype-timestamps",
      repository: { url: "https://github.com/example/repo", branch: "main", commitSha: "abc123" },
      deployment: { url: "https://example.invalid" },
      runs: [],
      promotedAt: at,
    },
    tree: [{
      id: "root",
      kind: "root",
      title: "Timestamp evaluation",
      status: "in-progress",
      runIds: [],
      createdAt: at,
      updatedAt: at,
    }],
    createdAt: at,
    updatedAt: at,
  };
}

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "iseol-eval-timestamps-"));
  await saveProjectWorkspace(root, workspace());
  return root;
}

const INGESTED_AT = "2026-09-08T10:00:00.000Z";
const OCCURRED_AT = "2026-09-08T09:41:22.000Z";

function providerEvent(root: string, overrides: Record<string, unknown> = {}) {
  return {
    modelRoot: root,
    context: { projectId: "project-timestamps", nodeId: "root" },
    eventType: "integration-action-recorded" as const,
    source: "github" as const,
    action: "pr-opened",
    reference: "github:example/repo:pr:42",
    summary: "Pull request opened",
    at: INGESTED_AT,
    occurredAt: OCCURRED_AT,
    lifecycle: "pull-request-opened" as const,
    ...overrides,
  };
}

test("provider occurrence time survives delayed ingestion and Web view round-trip", async () => {
  const root = await fixture();
  await recordDiscordProjectHistory(providerEvent(root) as never);

  const history = await loadProjectHistory(root, "project-timestamps");
  assert.equal(history.length, 1);
  assert.equal(history[0]?.at, INGESTED_AT);
  assert.equal(history[0]?.occurredAt, OCCURRED_AT);
  assert.equal(history[0]?.lifecycle, "pull-request-opened");

  const view = await buildProjectWorkspaceView(root, root, "project-timestamps");
  assert.ok(view);
  assert.equal(view.history[0]?.at, INGESTED_AT);
  assert.equal(view.history[0]?.occurredAt, OCCURRED_AT);
  assert.equal(view.history[0]?.lifecycle, "pull-request-opened");
});

test("retrying the same provider occurrence dedupes even when ingestion time changes", async () => {
  const root = await fixture();
  assert.equal(await recordDiscordProjectHistory(providerEvent(root) as never), true);
  assert.equal(await recordDiscordProjectHistory(providerEvent(root, {
    at: "2026-09-08T10:05:00.000Z",
  }) as never), false);

  const history = await loadProjectHistory(root, "project-timestamps");
  assert.equal(history.length, 1);
  assert.equal(history[0]?.at, INGESTED_AT);
  assert.equal(history[0]?.occurredAt, OCCURRED_AT);
});

test("conflicting provider occurrence identity for one history id is rejected", async () => {
  const root = await fixture();
  await recordDiscordProjectHistory(providerEvent(root) as never);

  await assert.rejects(
    recordDiscordProjectHistory(providerEvent(root, {
      occurredAt: "2026-09-08T09:42:22.000Z",
    }) as never),
    /identity mismatch/i,
  );
});
