import assert from "node:assert/strict";
import test from "node:test";
import { renameWithTransientRetry } from "../src/desktop-agent/atomic-file.js";

test("transient Windows rename failures are retried with a bounded budget", async () => {
  let attempts = 0;
  const sleeps: number[] = [];
  await renameWithTransientRetry("temp.json", "agent.json", {
    rename: async () => {
      attempts += 1;
      if (attempts < 3) Object.assign(new Error("locked"), { code: "EPERM" });
      if (attempts < 3) throw Object.assign(new Error("locked"), { code: "EPERM" });
    },
    sleep: async (ms) => { sleeps.push(ms); },
    maxAttempts: 4,
    baseDelayMs: 5,
  });
  assert.equal(attempts, 3);
  assert.deepEqual(sleeps, [5, 10]);
});

test("non-transient rename failure is not retried", async () => {
  let attempts = 0;
  await assert.rejects(renameWithTransientRetry("temp.json", "agent.json", {
    rename: async () => { attempts += 1; throw Object.assign(new Error("bad path"), { code: "ENOENT" }); },
    sleep: async () => undefined,
  }), /bad path/);
  assert.equal(attempts, 1);
});