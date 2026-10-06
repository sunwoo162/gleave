import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readdir, rename as fsRename } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  completeHarnessSideEffect,
  loadHarnessSideEffect,
  reserveHarnessSideEffect,
} from "../src/harness/side-effect-ledger.js";
import { withDurableHarnessRunEventLock } from "../src/harness/event-lock.js";

test("side effect reservation is idempotent while in progress", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-effects-"));
  const input = {
    runId: "run-001",
    key: "pull-request:owner/repo#feature",
    kind: "pull-request" as const,
    at: "2026-09-07T00:00:01.000Z",
  };

  const first = await reserveHarnessSideEffect(root, input);
  const second = await reserveHarnessSideEffect(root, {
    ...input,
    at: "2026-09-07T00:00:02.000Z",
  });

  assert.equal(first.outcome, "reserved");
  assert.equal(second.outcome, "in-progress");
  assert.equal(second.receipt.reservedAt, input.at);
});test("completed side effect receipt is reused on retry", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-effects-"));
  const input = {
    runId: "run-001",
    key: "deployment:production:abc123",
    kind: "deployment" as const,
    at: "2026-09-07T00:00:01.000Z",
  };

  await reserveHarnessSideEffect(root, input);
  const completed = await completeHarnessSideEffect(root, {
    runId: input.runId,
    key: input.key,
    at: "2026-09-07T00:00:03.000Z",
    externalReference: "deploy-42",
  });
  const retry = await reserveHarnessSideEffect(root, {
    ...input,
    at: "2026-09-07T00:00:04.000Z",
  });

  assert.equal(completed.status, "completed");
  assert.equal(retry.outcome, "completed");
  assert.equal(retry.receipt.externalReference, "deploy-42");
  assert.deepEqual(await loadHarnessSideEffect(root, input.runId, input.key), completed);
});

test("side effect run ids cannot escape the ledger", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-effects-"));
  await assert.rejects(
    reserveHarnessSideEffect(root, {
      runId: "../escape",
      key: "deployment:x",
      kind: "deployment",
      at: "2026-09-07T00:00:01.000Z",
    }),
    /Invalid Iseol Run id/,
  );
});
test("side effect completion retries transient atomic rename failures and cleans temp files", async () => {
  for (const code of ["EPERM", "EBUSY", "EACCES"] as const) {
    const root = await mkdtemp(join(tmpdir(), `iseol-effects-${code.toLowerCase()}-`));
    const input = {
      runId: "run-atomic",
      key: `deployment:${code.toLowerCase()}`,
      kind: "deployment" as const,
      at: "2026-09-08T13:00:00.000Z",
    };
    await reserveHarnessSideEffect(root, input);
    let attempts = 0;
    const completed = await completeHarnessSideEffect(root, {
      runId: input.runId,
      key: input.key,
      at: "2026-09-08T13:00:01.000Z",
      externalReference: `deploy-${code.toLowerCase()}`,
    }, {
      rename: async (source: string, target: string) => {
        attempts += 1;
        if (attempts === 1) throw Object.assign(new Error("locked"), { code });
        await fsRename(source, target);
      },
      sleep: async () => undefined,
      maxAttempts: 3,
    });
    assert.equal(attempts, 2, `${code} should retry exactly once`);
    assert.equal(completed.status, "completed");
    const files = await readdir(root, { recursive: true });
    assert.equal(files.some((name) => String(name).endsWith(".tmp")), false, `${code} left a temp receipt`);
  }
});

test("side effect completion does not retry non-transient rename failures and cleans temp files", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-effects-nontransient-"));
  const input = {
    runId: "run-atomic",
    key: "deployment:nontransient",
    kind: "deployment" as const,
    at: "2026-09-08T13:00:00.000Z",
  };
  await reserveHarnessSideEffect(root, input);
  let attempts = 0;
  await assert.rejects(completeHarnessSideEffect(root, {
    runId: input.runId,
    key: input.key,
    at: "2026-09-08T13:00:01.000Z",
  }, {
    rename: async () => {
      attempts += 1;
      throw Object.assign(new Error("bad path"), { code: "ENOENT" });
    },
    sleep: async () => undefined,
  }), /bad path/);
  assert.equal(attempts, 1);
  const files = await readdir(root, { recursive: true });
  assert.equal(files.some((name) => String(name).endsWith(".tmp")), false);
});

test("side effect completion waits for the durable Run event lock", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-effects-lock-"));
  const input = { runId: "run-lock", key: "deployment:lock", kind: "deployment" as const, at: "2026-09-08T13:00:00.000Z" };
  await reserveHarnessSideEffect(root, input);
  let settled = false;
  let completionPromise: Promise<unknown> | undefined;
  const pending = withDurableHarnessRunEventLock(
    root,
    input.runId,
    async () => {
      const ledger = await import("../src/harness/side-effect-ledger.js?side-effect-lock");
      completionPromise = ledger.completeHarnessSideEffect(root, { runId: input.runId, key: input.key, at: "2026-09-08T13:00:01.000Z" });
      completionPromise.finally(() => { settled = true; }).catch(() => undefined);
      await new Promise((resolveDelay) => setTimeout(resolveDelay, 50));
      assert.equal(settled, false);
    },
    { waitForMs: 2_000 },
  );
  await pending;
  await completionPromise;
  assert.equal((await loadHarnessSideEffect(root, input.runId, input.key))?.status, "completed");
});
