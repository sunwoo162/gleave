import assert from "node:assert/strict";
import test from "node:test";
import {
  createDeterministicFaultInjector,
  type FaultPoint,
} from "../src/evaluation/fault-injector.js";
import { createScriptedFaultBoundary } from "../src/evaluation/test-support/scripted-fault-boundary.js";
import type { FaultPlanEntry, InjectedFault } from "../src/evaluation/contracts.js";

const PLAN: FaultPlanEntry[] = [
  { boundary: "desktop", point: "after-lease", occurrence: 1, action: "disconnect" },
  { boundary: "desktop", point: "after-lease", occurrence: 2, action: "drop-response" },
  { boundary: "deploy", point: "after-provider-success", occurrence: 1, action: "drop-response" },
];
const NOW = "2026-09-08T05:30:00.000Z";

async function replay(points: FaultPoint[]): Promise<Array<string>> {
  const recorded: InjectedFault[] = [];
  const injector = createDeterministicFaultInjector({
    scenarioId: "scenario-1",
    seed: "seed-abc",
    plan: PLAN,
    now: () => NOW,
    recordFault: async (fault) => { recorded.push(fault); },
  });
  const output: string[] = [];
  for (const point of points) {
    const decision = await injector.hit(point);
    output.push(decision.action === "none" ? "none" : `${decision.action}:${decision.faultId}`);
  }
  return [...output, ...recorded.map((item) => `${item.action}:${item.faultId}:${item.injectedAt}`)];
}

test("identical scenario seed and plan replay the same fault sequence", async () => {
  const points: FaultPoint[] = [
    { boundary: "desktop", point: "after-lease", occurrence: 1 },
    { boundary: "desktop", point: "after-lease", occurrence: 2 },
    { boundary: "desktop", point: "unplanned", occurrence: 1 },
    { boundary: "deploy", point: "after-provider-success", occurrence: 1 },
  ];
  assert.deepEqual(await replay(points), await replay(points));
});

test("occurrences remain distinct and unplanned points never inject or record", async () => {
  const recorded: InjectedFault[] = [];
  const injector = createDeterministicFaultInjector({
    scenarioId: "scenario-1", seed: "seed-abc", plan: PLAN, now: () => NOW,
    recordFault: async (fault) => { recorded.push(fault); },
  });
  const first = await injector.hit({ boundary: "desktop", point: "after-lease", occurrence: 1 });
  const second = await injector.hit({ boundary: "desktop", point: "after-lease", occurrence: 2 });
  const third = await injector.hit({ boundary: "desktop", point: "after-lease", occurrence: 3 });
  assert.equal(first.action, "disconnect");
  assert.equal(second.action, "drop-response");
  assert.deepEqual(third, { action: "none" });
  assert.notEqual(first.action === "none" ? "" : first.faultId, second.action === "none" ? "" : second.faultId);
  assert.equal(recorded.length, 2);
  assert.deepEqual(recorded.map((fault) => fault.injectedAt), [NOW, NOW]);
});

test("scripted boundary assigns semantic occurrence counts without collisions", async () => {
  const recorded: InjectedFault[] = [];
  const injector = createDeterministicFaultInjector({
    scenarioId: "scenario-1", seed: "seed-abc", plan: PLAN, now: () => NOW,
    recordFault: async (fault) => { recorded.push(fault); },
  });
  const boundary = createScriptedFaultBoundary({ boundary: "desktop", injector });
  const first = await boundary.hit("after-lease");
  const second = await boundary.hit("after-lease");
  const third = await boundary.hit("after-lease");
  assert.equal(first.action, "disconnect");
  assert.equal(second.action, "drop-response");
  assert.deepEqual(third, { action: "none" });
  assert.equal(recorded.length, 2);
});

test("fault IDs are deterministic and recorded with the exact injection timestamp", async () => {
  const recorded: InjectedFault[] = [];
  const create = () => createDeterministicFaultInjector({
    scenarioId: "scenario-1", seed: "seed-abc", plan: PLAN, now: () => NOW,
    recordFault: async (fault) => { recorded.push(fault); },
  });
  const a = await create().hit({ boundary: "deploy", point: "after-provider-success", occurrence: 1 });
  const b = await create().hit({ boundary: "deploy", point: "after-provider-success", occurrence: 1 });
  assert.notEqual(a.action, "none");
  assert.notEqual(b.action, "none");
  if (a.action === "none" || b.action === "none") return;
  assert.equal(a.faultId, b.faultId);
  assert.equal(recorded[0]?.injectedAt, NOW);
  assert.equal(recorded[0]?.faultId, a.faultId);
});

test("invalid plans reject unsafe boundary action occurrence and executable fields", () => {
  const base = {
    scenarioId: "scenario-1", seed: "seed-abc", now: () => NOW,
    recordFault: async (_fault: InjectedFault) => undefined,
  };
  assert.throws(() => createDeterministicFaultInjector({ ...base, plan: [
    { boundary: "shell", point: "after-lease", occurrence: 1, action: "disconnect" },
  ] as never }));
  assert.throws(() => createDeterministicFaultInjector({ ...base, plan: [
    { boundary: "desktop", point: "after-lease", occurrence: -1, action: "disconnect" },
  ] as never }));
  assert.throws(() => createDeterministicFaultInjector({ ...base, plan: [
    { boundary: "desktop", point: "after-lease", occurrence: 1, action: "run-code" },
  ] as never }));
  assert.throws(() => createDeterministicFaultInjector({ ...base, plan: [
    { boundary: "desktop", point: "", occurrence: 1, action: "disconnect" },
  ] as never }));
  assert.throws(() => createDeterministicFaultInjector({ ...base, plan: [
    { boundary: "desktop", point: "after-lease", occurrence: 1, action: "disconnect", code: "rm -rf /" },
  ] as never }));
  assert.throws(() => createDeterministicFaultInjector({ ...base, plan: [
    { boundary: "desktop", point: "after-lease", occurrence: 1, action: "disconnect", callback: () => undefined },
  ] as never }));
});

test("invalid runtime fault points fail closed before any record", async () => {
  const recorded: InjectedFault[] = [];
  const injector = createDeterministicFaultInjector({
    scenarioId: "scenario-1", seed: "seed-abc", plan: PLAN, now: () => NOW,
    recordFault: async (fault) => { recorded.push(fault); },
  });
  await assert.rejects(() => injector.hit({ boundary: "desktop", point: "after-lease", occurrence: 0 }));
  await assert.rejects(() => injector.hit({ boundary: "shell", point: "after-lease", occurrence: 1 } as never));
  assert.equal(recorded.length, 0);
});
