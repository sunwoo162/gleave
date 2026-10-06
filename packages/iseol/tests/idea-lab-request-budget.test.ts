import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequestBudgetStore } from "../src/chatgpt-web/request-budget.js";

test("request budget reserves once, consumes, and rejects after exhaustion", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-request-budget-"));
  try {
    const store = createRequestBudgetStore(root, 2);
    assert.equal(await store.reserve("run-1", "req-1", { stage: "PLAN" }), "reserved");
    assert.equal(await store.reserve("run-1", "req-1", { stage: "PLAN" }), "already-reserved");
    await store.complete("run-1", "req-1", "consumed");
    assert.equal(await store.reserve("run-1", "req-2", { stage: "IMPLEMENT" }), "reserved");
    await store.complete("run-1", "req-2", "unknown");
    assert.equal(await store.reserve("run-1", "req-3", { stage: "SELF_REVIEW" }), "exhausted");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("concurrent reservations cannot exceed the durable limit", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-request-budget-concurrent-"));
  try {
    const store = createRequestBudgetStore(root, 1);
    const results = await Promise.all([
      store.reserve("run-1", "req-a", { stage: "PLAN" }),
      store.reserve("run-1", "req-b", { stage: "PLAN" }),
    ]);
    assert.equal(results.filter((result) => result === "reserved").length, 1);
    assert.equal(results.filter((result) => result === "exhausted").length, 1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("request budget limit remains atomic across service instances", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-request-budget-cross-service-"));
  try {
    const instances = await Promise.all(
      Array.from({ length: 8 }, (_, index) => import(`../src/chatgpt-web/request-budget.ts?instance=${index}`)),
    );
    const results = await Promise.all(instances.map((instance, index) => {
      const store = instance.createRequestBudgetStore(root, 1);
      return store.reserve(`run-${index}`, `req-${index}`, { stage: "PLAN" });
    }));
    assert.equal(results.filter((result) => result === "reserved").length, 1);
    assert.equal(results.filter((result) => result === "exhausted").length, 7);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("budget records remain bound to the execution identity", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-request-budget-identity-"));
  try {
    const store = createRequestBudgetStore(root, 1);
    assert.equal(await store.reserve("run-1", "req-1", { stage: "PLAN" }), "reserved");
    await assert.rejects(() => store.reserve("run-2", "req-1", { stage: "PLAN" }), /another Run/i);
    const one = await store.inspect("run-1");
    const two = await store.inspect("run-2");
    assert.equal(one?.runId, "run-1");
    assert.equal(two?.runId, "run-2");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
