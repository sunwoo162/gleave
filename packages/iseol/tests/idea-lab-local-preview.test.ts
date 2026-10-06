import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createLocalPreviewDeployAdapter, resolveIdeaLabDeployAdapter } from "../src/idea-lab/local-preview-deploy-adapter.js";
import type { PrototypeDeployRequest } from "../src/idea-lab/deploy-adapter.js";

const serverScript = "require('node:http').createServer((_,res)=>res.end('ok')).listen(Number(process.env.ISEOL_PREVIEW_PORT), process.env.ISEOL_PREVIEW_HOST)";

function request(workspaceRoot: string): PrototypeDeployRequest {
  return {
    key: "prototype:camp:prod:commit",
    campaignId: "camp",
    productionId: "prod",
    runId: "run-prod",
    repositoryUrl: "https://github.com/example/repo.git",
    branch: "idea/camp/prod",
    commitSha: "0123456789abcdef0123456789abcdef01234567",
    workspaceRoot,
  };
}

async function fixture(options: { fetch?: typeof fetch } = {}) {
  const root = await mkdtemp(join(tmpdir(), "iseol-local-preview-"));
  const workspace = join(root, "workspace");
  await mkdir(workspace);
  const adapter = createLocalPreviewDeployAdapter({
    allowedWorkspaceRoot: root,
    executable: process.execPath,
    args: ["-e", serverScript],
    host: "127.0.0.1",
    port: 19091,
    readinessTimeoutMs: 3000,
    ...(options.fetch ? { fetch: options.fetch } : {}),
    now: () => "2026-09-21T00:00:00.000Z",
  });
  return { root, workspace, adapter };
}

test("local preview starts a trusted process, verifies HTTP, and disposes only its process", async () => {
  const f = await fixture();
  try {
    const receipt = await f.adapter.deploy(request(f.workspace));
    assert.equal(receipt.provider, "local-preview");
    assert.match(receipt.url, /^http:\/\/127\.0\.0\.1:\d+\/$/);
    assert.equal(receipt.commitSha, request(f.workspace).commitSha);
    const verified = await f.adapter.verify({ ...request(f.workspace), deployment: receipt });
    assert.equal(verified.verifiedAt, "2026-09-21T00:00:00.000Z");
    const reconciled = await f.adapter.reconcile(request(f.workspace));
    assert.deepEqual(reconciled, verified);
    await f.adapter.dispose();
    assert.equal(await f.adapter.reconcile(request(f.workspace)), null);
  } finally {
    await f.adapter.dispose();
    await rm(f.root, { recursive: true, force: true });
  }
});

test("local preview verification rejects non-canonical listener URLs before readiness fetch", async () => {
  let fetchCalls = 0;
  const f = await fixture({
    fetch: async () => {
      fetchCalls += 1;
      return new Response("ok", { status: 200 });
    },
  });
  try {
    const receipt = await f.adapter.deploy(request(f.workspace));
    fetchCalls = 0;
    for (const url of [
      "http://user:password@127.0.0.1:19091/",
      "http://127.0.0.1:19091/unsafe",
      "http://127.0.0.1:19091/?token=secret",
      "http://127.0.0.1:19091/#fragment",
      "https://127.0.0.1:19091/",
      "http://127.0.0.1:19091/../",
      "http://127.0.0.1:19091/%2e%2e/",
      "http://@127.0.0.1:19091/",
      "http://127.0.0.1:019091/",
    ]) {
      await assert.rejects(
        () => f.adapter.verify({ ...request(f.workspace), deployment: { ...receipt, url } }),
        /local preview URL/i,
      );
    }
    assert.equal(fetchCalls, 0);
  } finally {
    await f.adapter.dispose();
    await rm(f.root, { recursive: true, force: true });
  }
});

test("local preview rejects a workspace outside its boundary and never starts a process", async () => {
  const f = await fixture();
  const outside = await mkdtemp(join(tmpdir(), "iseol-local-preview-outside-"));
  try {
    await assert.rejects(() => f.adapter.deploy(request(outside)), /workspace/i);
    assert.equal(await f.adapter.reconcile(request(outside)), null);
  } finally {
    await f.adapter.dispose();
    await rm(f.root, { recursive: true, force: true });
    await rm(outside, { recursive: true, force: true });
  }
});

test("local preview fails closed when the child exits before readiness", async () => {
  const f = await fixture();
  const exiting = createLocalPreviewDeployAdapter({
    allowedWorkspaceRoot: f.root,
    executable: process.execPath,
    args: ["-e", "process.exit(7)"],
    host: "127.0.0.1",
    port: 19092,
    readinessTimeoutMs: 500,
  });
  try {
    await assert.rejects(() => exiting.deploy(request(f.workspace)), /exited|readiness/i);
    assert.equal(await exiting.reconcile(request(f.workspace)), null);
  } finally {
    await exiting.dispose();
    await f.adapter.dispose();
    await rm(f.root, { recursive: true, force: true });
  }
});

test("local preview rejects non-loopback hosts and duplicate ownership", async () => {
  const f = await fixture();
  try {
    assert.throws(() => createLocalPreviewDeployAdapter({
      allowedWorkspaceRoot: f.root,
      executable: "node",
      args: ["-e", serverScript],
      host: "127.0.0.1",
      port: 19093,
      readinessTimeoutMs: 500,
    }), /executable.*absolute/i);
    assert.throws(() => createLocalPreviewDeployAdapter({
      allowedWorkspaceRoot: f.root,
      executable: process.execPath,
      args: ["-e", serverScript],
      host: "0.0.0.0",
      port: 19093,
      readinessTimeoutMs: 500,
    }), /loopback/i);
    const first = await f.adapter.deploy(request(f.workspace));
    await assert.rejects(() => f.adapter.deploy(request(f.workspace)), /already|duplicate/i);
    await f.adapter.verify({ ...request(f.workspace), deployment: first });
  } finally {
    await f.adapter.dispose();
    await rm(f.root, { recursive: true, force: true });
  }
});

test("local-preview resolves without Vercel credentials while Vercel remains explicit", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-local-preview-config-"));
  try {
    const local = resolveIdeaLabDeployAdapter({}, {
      enabled: true,
      deploymentMode: "local-preview",
      repositoryRoot: join(root, "repository"),
      repositoryUrl: "https://github.com/example/repo.git",
      baseRef: "main",
      sandboxRoot: root,
      agentId: "agent",
      testExecutable: process.execPath,
      testArgs: [],
      testTimeoutMs: 1000,
      previewExecutable: process.execPath,
      previewArgs: ["-e", serverScript],
      previewHost: "127.0.0.1",
      previewPort: 19094,
      previewTimeoutMs: 1000,
    });
    assert.ok(local);
    await local?.dispose?.();
    assert.equal(resolveIdeaLabDeployAdapter({}, { enabled: true, deploymentMode: "vercel", repositoryRoot: root, repositoryUrl: "https://github.com/example/repo.git", baseRef: "main", sandboxRoot: root, agentId: "agent", testExecutable: process.execPath, testArgs: [], testTimeoutMs: 1000 }), null);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
