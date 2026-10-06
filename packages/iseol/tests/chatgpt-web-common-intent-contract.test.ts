import assert from "node:assert/strict";
import test from "node:test";
import type { HarnessRuntimeRunEnvelope } from "../src/harness/contracts.js";
import type { WebWorkerSession } from "../src/chatgpt-web/contracts.js";
import { compileWebPrompt } from "../src/chatgpt-web/prompt-compiler.js";

test("prompt explicitly requires every Desktop intent to include all common fields", () => {
  const run: HarnessRuntimeRunEnvelope = {
    version: 1,
    request: {
      version: 1,
      runId: "run-common-fields",
      mode: "project-workspace",
      objective: "Verify common Desktop intent fields",
      targetRoot: "C:/workspace/project",
    },
    preflight: {
      version: 1,
      runId: "run-common-fields",
      status: "ready",
      policy: {
        version: 1,
        loadedAt: "2026-09-16T02:00:00.000Z",
        effectiveSha256: "policy-common-fields",
        sources: [],
      },
    },
    state: {
      version: 1,
      stage: "ANALYZE",
      status: "RUNNING",
      completedStages: ["PREFLIGHT", "CONTEXT"],
      skippedStages: [],
      updatedAt: "2026-09-16T02:01:00.000Z",
    },
    evidence: [],
    updatedAt: "2026-09-16T02:01:00.000Z",
  };
  const session: WebWorkerSession = {
    version: 1,
    sessionId: "session-common-fields",
    runId: "run-common-fields",
    stage: "ANALYZE",
    generation: 1,
    policySha256: "policy-common-fields",
    status: "ready",
    createdAt: "2026-09-16T02:02:00.000Z",
  };

  const payload = JSON.parse(compileWebPrompt({
    kind: "initial",
    run,
    session,
    priorTurns: [],
    desktopEvidence: [],
  }).body) as any;

  const rule = String(payload.outputContract.desktopIntentCommonRule ?? "");
  assert.match(rule, /every Desktop intent/i);
  assert.match(rule, /MUST/i);
  assert.match(rule, /desktopIntentCommonRequired/i);
  assert.match(rule, /workspaceRoot/i);
  assert.match(rule, /policySha256/i);
});
