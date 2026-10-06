import assert from "node:assert/strict";
import test from "node:test";
import {
  disposeWithShutdownDiagnostics,
  type ShutdownDiagnostic,
  type ShutdownStage,
} from "../src/runtime/shutdown.js";

function stages(
  overrides: Partial<Record<ShutdownStage, () => Promise<void>>> = {},
) {
  return ([
    "web-server",
    "chatgpt-bridge",
    "idea-lab-runtime",
    "deploy-adapter",
    "desktop-core",
    "browser",
  ] as const).map((name) => ({
    name,
    dispose: overrides[name] ?? (async () => undefined),
  }));
}

test("shutdown records every phase and completes all owned resources", async () => {
  const events: ShutdownDiagnostic[] = [];
  await disposeWithShutdownDiagnostics({
    stages: stages(),
    stageTimeoutMs: 50,
    record: (event) => events.push(event),
  });

  assert.deepEqual(
    events.filter((event) => event.event === "completed").map((event) => event.stage),
    ["web-server", "chatgpt-bridge", "idea-lab-runtime", "deploy-adapter", "desktop-core", "browser"],
  );
  assert.equal(events.at(-1)?.lastCompletedStage, "browser");
  assert.deepEqual(events.at(-1)?.remainingStages, []);
});
test("shutdown bounds a delayed Idea Lab idle and preserves later ownership", async () => {
  const events: ShutdownDiagnostic[] = [];
  let desktopClosed = false;
  await assert.rejects(
    () => disposeWithShutdownDiagnostics({
      stages: stages({
        "idea-lab-runtime": () => new Promise<void>(() => undefined),
        "desktop-core": async () => { desktopClosed = true; },
      }),
      stageTimeoutMs: 10,
      record: (event) => events.push(event),
    }),
    /idea-lab-runtime.*timeout/i,
  );
  const timeout = events.find((event) => event.stage === "idea-lab-runtime" && event.event === "timed-out");
  assert.equal(timeout?.failureClass, "timeout");
  assert.deepEqual(timeout?.remainingStages, ["deploy-adapter", "desktop-core", "browser"]);
  assert.equal(desktopClosed, false);
});

test("shutdown bounds a connected Desktop Core close and identifies the remaining stages", async () => {
  const events: ShutdownDiagnostic[] = [];
  let agentConnected = true;
  await assert.rejects(
    () => disposeWithShutdownDiagnostics({
      stages: stages({
        "desktop-core": () => {
          assert.equal(agentConnected, true);
          return new Promise<void>(() => undefined);
        },
      }),
      stageTimeoutMs: 10,
      record: (event) => events.push(event),
    }),
    /desktop-core.*timeout/i,
  );
  agentConnected = false;
  const timeout = events.find((event) => event.stage === "desktop-core" && event.event === "timed-out");
  assert.equal(timeout?.failureClass, "timeout");
  assert.deepEqual(timeout?.remainingStages, ["browser"]);
});

test("shutdown bounds a delayed browser close without claiming completion", async () => {
  const events: ShutdownDiagnostic[] = [];
  await assert.rejects(
    () => disposeWithShutdownDiagnostics({
      stages: stages({ browser: () => new Promise<void>(() => undefined) }),
      stageTimeoutMs: 10,
      record: (event) => events.push(event),
    }),
    /browser.*timeout/i,
  );
  const timeout = events.find((event) => event.stage === "browser" && event.event === "timed-out");
  assert.equal(timeout?.failureClass, "timeout");
  assert.deepEqual(timeout?.remainingStages, []);
});

test("shutdown continues independent cleanup after a bounded dispose failure", async () => {
  const events: ShutdownDiagnostic[] = [];
  let browserClosed = false;
  await assert.rejects(
    () => disposeWithShutdownDiagnostics({
      stages: stages({
        "desktop-core": async () => { throw new Error("fixture failure"); },
        browser: async () => { browserClosed = true; },
      }),
      stageTimeoutMs: 50,
      record: (event) => events.push(event),
    }),
    /desktop-core.*dispose-error/i,
  );
  assert.equal(browserClosed, true);
  const failed = events.find((event) => event.stage === "desktop-core" && event.event === "failed");
  assert.equal(failed?.failureClass, "dispose-error");
  assert.equal(events.at(-1)?.lastCompletedStage, "browser");
});
