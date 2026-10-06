import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { loadIdeaLabCampaign, saveIdeaLabCampaign } from "../src/idea-lab/campaign-store.js";
import { listPrototypeProductions } from "../src/idea-lab/production-store.js";
import { FakeIdeaProposalProvider } from "../src/idea-lab/test-support/fake-proposal-provider.js";
import { superviseIdeaLabCampaign } from "../src/idea-lab/campaign-supervisor.js";
import { createIdeaLabRuntimeService } from "../src/idea-lab/runtime-service.js";

const campaign = (id: string, status: "generating" | "producing" | "complete" | "blocked" | "cancelled") => ({
  version: 1 as const, id, seed: "seed", constraints: [], targetReadyCount: 1, productionConcurrency: 3,
  proposalIds: [], productionIds: [], status, createdAt: "2026-09-09T00:00:00.000Z", updatedAt: "2026-09-09T00:00:00.000Z",
});

test("runtime collapses duplicate pending and active ids and runs FIFO with one worker", async () => {
  const root = await mkdtemp(join(tmpdir(), "idea-lab-runtime-"));
  const calls: string[] = [];
  let release!: () => void;
  const first = new Promise<void>((resolve) => { release = resolve; });
  const runtime = createIdeaLabRuntimeService({ modelRoot: root, superviseCampaign: async (id) => {
    calls.push(id);
    if (id === "camp-a") await first;
  }});
  runtime.enqueue("camp-a"); runtime.enqueue("camp-a"); runtime.enqueue("camp-b");
  await new Promise((resolve) => setImmediate(resolve));
  runtime.enqueue("camp-a");
  assert.deepEqual(calls, ["camp-a"]);
  release();
  await runtime.idle();
  assert.deepEqual(calls, ["camp-a", "camp-b"]);
  await runtime.dispose();
});

test("runtime releases ids after success and rejection, with bounded error summary", async () => {
  const root = await mkdtemp(join(tmpdir(), "idea-lab-runtime-"));
  const calls: string[] = []; const errors: Array<[string, string]> = [];
  const runtime = createIdeaLabRuntimeService({ modelRoot: root, onError: (id, summary) => errors.push([id, summary]), superviseCampaign: async (id) => {
    calls.push(id); if (id === "bad") throw new Error("prompt body secret-token C:/private/profile.json");
  }});
  runtime.enqueue("bad"); runtime.enqueue("good"); await runtime.idle();
  runtime.enqueue("bad"); await runtime.idle();
  assert.deepEqual(calls, ["bad", "good", "bad"]);
  assert.equal(errors.length, 2);
  assert.match(errors[0][1], /^Campaign supervision failed$/);
  assert.doesNotMatch(errors[0][1], /secret-token|profile|prompt/i);
  await runtime.dispose();
});

test("recover schedules only generating and producing campaigns", async () => {
  const root = await mkdtemp(join(tmpdir(), "idea-lab-runtime-"));
  for (const [id, status] of [["generating", "generating"], ["producing", "producing"], ["complete", "complete"], ["blocked", "blocked"], ["cancelled", "cancelled"]] as const) {
    await saveIdeaLabCampaign(root, campaign(id, status));
  }
  const calls: string[] = [];
  const runtime = createIdeaLabRuntimeService({ modelRoot: root, superviseCampaign: async (id) => calls.push(id) });
  await runtime.recover();
  await runtime.idle();
  assert.deepEqual(calls, ["generating", "producing"]);
  await runtime.dispose();
});

test("dispose stops future enqueue and waits for current worker", async () => {
  const root = await mkdtemp(join(tmpdir(), "idea-lab-runtime-"));
  let release!: () => void; const started = new Promise<void>((resolve) => { release = resolve; });
  let finished = false;
  const runtime = createIdeaLabRuntimeService({ modelRoot: root, superviseCampaign: async () => { await started; finished = true; } });
  runtime.enqueue("camp-a");
  await new Promise((resolve) => setImmediate(resolve));
  const disposed = runtime.dispose();
  runtime.enqueue("camp-b");
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(finished, false); release(); await disposed;
  assert.equal(finished, true);
});

test("runtime rejects unsupported scheduler concurrency", () => {
  assert.throws(
    () => createIdeaLabRuntimeService({
      modelRoot: "C:/model",
      superviseCampaign: async () => undefined,
      concurrency: 2 as never,
    }),
    /concurrency/i,
  );
});


test("fresh enqueue runs before pending recovery backlog", async () => {
  const root = await mkdtemp(join(tmpdir(), "idea-lab-runtime-priority-"));
  await saveIdeaLabCampaign(root, campaign("recover-a", "generating"));
  await saveIdeaLabCampaign(root, campaign("recover-b", "generating"));
  const calls: string[] = [];
  let release!: () => void;
  const first = new Promise<void>((resolve) => { release = resolve; });
  const runtime = createIdeaLabRuntimeService({ modelRoot: root, superviseCampaign: async (id) => {
    calls.push(id);
    if (id === "recover-a") await first;
  }});
  await runtime.recover();
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(calls, ["recover-a"]);
  runtime.enqueue("fresh");
  release();
  await runtime.idle();
  assert.deepEqual(calls, ["recover-a", "fresh", "recover-b"]);
  await runtime.dispose();
});

test("recovery guard blocks producing campaigns with an external-waiting production", async () => {
  const root = await mkdtemp(join(tmpdir(), "idea-lab-runtime-waiting-external-"));
  await saveIdeaLabCampaign(root, campaign("blocked-producing", "producing"));
  const calls: string[] = [];
  const runtime = createIdeaLabRuntimeService({
    modelRoot: root,
    recoveryGuard: async () => false,
    superviseCampaign: async (id) => calls.push(id),
  });
  await runtime.recover();
  await runtime.idle();
  assert.deepEqual(calls, []);
  await runtime.dispose();
});

test("recovery guard permits a producing campaign when its durable runs are resumable", async () => {
  const root = await mkdtemp(join(tmpdir(), "idea-lab-runtime-recoverable-"));
  await saveIdeaLabCampaign(root, campaign("recoverable-producing", "producing"));
  const calls: string[] = [];
  const runtime = createIdeaLabRuntimeService({
    modelRoot: root,
    recoveryGuard: async () => true,
    superviseCampaign: async (id) => calls.push(id),
  });
  await runtime.recover();
  await runtime.idle();
  assert.deepEqual(calls, ["recoverable-producing"]);
  await runtime.dispose();
});

test("runtime retries interrupted campaign supervision once and reuses an already allocated sandbox", async () => {
  const root = await mkdtemp(join(tmpdir(), "idea-lab-runtime-interrupted-allocation-"));
  await saveIdeaLabCampaign(root, {
    ...campaign("camp-retry", "generating"),
    productionConcurrency: 1,
  });
  const provider = new FakeIdeaProposalProvider([[
    {
      title: "Allocated prototype",
      concept: "A prototype whose worktree exists after a delayed Desktop Agent result",
      problemDomain: "domain",
      targetUser: "user",
      jobToBeDone: "job",
      coreInteractionLoop: "loop",
      dataModel: "model",
      primaryDifferentiator: "different",
      whyMateriallyDifferent: "A distinct workflow",
    },
  ]]);
  let createAttempts = 0;
  let worktreeExists = false;
  let advances = 0;
  const runtime = createIdeaLabRuntimeService({
    modelRoot: root,
    superviseCampaign: async (campaignId) => superviseIdeaLabCampaign({
      root,
      campaignId,
      proposalProvider: provider,
      createProduction: async (proposal, ordinal) => {
        createAttempts += 1;
        if (createAttempts === 1) {
          worktreeExists = true;
          throw new Error("Desktop Job result timeout after worktree creation");
        }
        assert.equal(worktreeExists, true, "retry must enter the existing sandbox inspect/reuse path");
        return {
          version: 1,
          id: `${campaignId}-prod-${ordinal}`,
          campaignId,
          proposalId: proposal.id,
          runId: `run-${campaignId}-prod-${ordinal}`,
          repositoryUrl: "https://example.invalid/repo.git",
          sandboxRoot: "C:/sandbox",
          worktreeRoot: `C:/sandbox/${campaignId}-prod-${ordinal}`,
          branch: `idea/${campaignId}/${campaignId}-prod-${ordinal}`,
          baseRef: "main",
          status: "queued",
          createdAt: "2026-09-16T00:00:00.000Z",
          updatedAt: "2026-09-16T00:00:00.000Z",
        };
      },
      advanceProduction: async (production) => {
        advances += 1;
        return { ...production, status: "ready", commitSha: "a".repeat(40), updatedAt: "2026-09-16T00:00:01.000Z" };
      },
      now: () => "2026-09-16T00:00:00.000Z",
    }),
  });

  runtime.enqueue("camp-retry");
  await runtime.idle();

  const recovered = await loadIdeaLabCampaign(root, "camp-retry");
  const productions = await listPrototypeProductions(root);
  assert.equal(recovered?.status, "complete");
  assert.equal(recovered?.proposalIds.length, 1);
  assert.equal(recovered?.productionIds.length, 1);
  assert.equal(productions.length, 1);
  assert.equal(createAttempts, 2);
  assert.equal(advances, 1);
  await runtime.dispose();
});


test("recover requested during an active campaign schedules one follow-up pass", async () => {
  const root = await mkdtemp(
    join(tmpdir(), "idea-lab-runtime-active-recovery-"),
  );

  await saveIdeaLabCampaign(
    root,
    campaign("recover-active", "producing"),
  );

  let calls = 0;
  let releaseFirst!: () => void;
  let markStarted!: () => void;

  const firstStarted = new Promise<void>((resolve) => {
    markStarted = resolve;
  });

  const firstPass = new Promise<void>((resolve) => {
    releaseFirst = resolve;
  });

  const runtime = createIdeaLabRuntimeService({
    modelRoot: root,
    superviseCampaign: async (id) => {
      assert.equal(id, "recover-active");
      calls += 1;

      if (calls === 1) {
        markStarted();
        await firstPass;
      }
    },
  });

  runtime.enqueue("recover-active");

  await firstStarted;

  // Models an Agent reconnect arriving while the WAITING_AGENT
  // supervision pass is still unwinding.
  await runtime.recover();

  releaseFirst();

  await runtime.idle();

  assert.equal(
    calls,
    2,
    "recovery requested during an active pass must survive deduplication",
  );

  await runtime.dispose();
});
