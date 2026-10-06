import assert from "node:assert/strict";
import test from "node:test";
import type { HarnessRunStage, HarnessRuntimeRunEnvelope } from "../src/harness/contracts.js";
import type { ReasoningTurn, WebWorkerSession } from "../src/chatgpt-web/contracts.js";
import { compileWebPrompt } from "../src/chatgpt-web/prompt-compiler.js";

function run(stage: HarnessRunStage = "IMPLEMENT", policySha256 = "policy-sha"): HarnessRuntimeRunEnvelope {
  return {
    version: 1,
    request: { version: 1, runId: "run-prompt", mode: "project-workspace", objective: "Add profile editing", targetRoot: "C:/workspace/project" },
    preflight: { version: 1, runId: "run-prompt", status: "ready", policy: { version: 1, loadedAt: "2026-09-08T01:00:00.000Z", effectiveSha256: policySha256, sources: [
      { kind: "iseol-global", path: "C:/iseol/docs/HARNESS_ENGINEERING.md", sha256: "global-sha", content: "SUPER_SECRET_POLICY_BODY token=do-not-leak" },
      { kind: "project-harness", path: "C:/workspace/project/docs/HARNESS_ENGINEERING.md", sha256: "project-sha", content: "PROJECT_SECRET_BODY" },
    ] } },
    state: { version: 1, stage, status: "RUNNING", completedStages: ["PREFLIGHT", "CONTEXT", "ANALYZE", "PLAN"], skippedStages: [], updatedAt: "2026-09-08T01:05:00.000Z" },
    evidence: [],
    updatedAt: "2026-09-08T01:05:00.000Z",
  };
}
function session(stage: HarnessRunStage = "IMPLEMENT", generation = 1, policySha256 = "policy-sha"): WebWorkerSession {
  return { version: 1, sessionId: `session-${generation}`, runId: "run-prompt", stage, generation, policySha256, status: "ready", createdAt: "2026-09-08T01:06:00.000Z" };
}
function turn(summary = "Keep the existing API contract"): ReasoningTurn {
  return {
    version: 1, turnId: "turn-prior", sessionId: "session-1", runId: "run-prompt", stage: "IMPLEMENT", generation: 1,
    promptSha256: "prompt-old", responseSha256: "response-old", summary, decisions: [summary], desktopIntentIds: [], outcome: "continue", recordedAt: "2026-09-08T01:07:00.000Z",
  };
}

const baseInput = () => ({
  kind: "initial" as const,
  run: run(),
  session: session(),
  priorTurns: [turn()],
  desktopEvidence: [{ kind: "test", summary: "unit tests pending", reference: "desktop-job:1" }],
});

test("prompt compiler is deterministic for identical durable state", () => {
  const first = compileWebPrompt(baseInput());
  const second = compileWebPrompt(structuredClone(baseInput()));
  assert.equal(first.body, second.body);
  assert.equal(first.sha256, second.sha256);
  assert.equal(first.runId, "run-prompt");
  assert.equal(first.stage, "IMPLEMENT");
});
test("prompt digest changes with stage generation policy decisions or evidence", () => {
  const original = compileWebPrompt(baseInput()).sha256;
  const changed = [
    compileWebPrompt({ ...baseInput(), run: run("SELF_REVIEW"), session: session("SELF_REVIEW") }).sha256,
    compileWebPrompt({ ...baseInput(), session: session("IMPLEMENT", 2) }).sha256,
    compileWebPrompt({ ...baseInput(), run: run("IMPLEMENT", "policy-new"), session: session("IMPLEMENT", 1, "policy-new") }).sha256,
    compileWebPrompt({ ...baseInput(), priorTurns: [turn("Use the new API contract")] }).sha256,
    compileWebPrompt({ ...baseInput(), desktopEvidence: [{ kind: "test", summary: "unit tests passed", reference: "desktop-job:2" }] }).sha256,
  ];
  for (const digest of changed) assert.notEqual(digest, original);
});

test("prompt contains bounded durable context and allowed intent vocabulary", () => {
  const compiled = compileWebPrompt({ ...baseInput(), run: run("PLAN"), session: session("PLAN") });
  for (const expected of [
    "Add profile editing", "PLAN", "policy-sha", "Keep the existing API contract",
    "unit tests pending", "READ_CONTEXT", "RUN_TEST", "RUN_BUILD", "GIT_INSPECT", "REQUEST_COMMIT", "CHECK_HTTP",
  ]) assert.match(compiled.body, new RegExp(expected.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(compiled.body, /completion/i);
  assert.doesNotMatch(compiled.body, /SUPER_SECRET_POLICY_BODY|PROJECT_SECRET_BODY/);
});
test("project workspace prompts carry purpose and bounded project context", () => {
  const input = baseInput();
  input.run.request.projectId = "project-study-log";
  input.run.request.purposeProfile = {
    version: 1,
    purpose: "portfolio",
    executableRoles: ["orchestrator", "planning", "frontend", "qa"],
    plannedRoles: ["review", "documentation"],
    verificationStages: ["TEST", "BUILD"],
    documentationRequired: true,
  };
  input.run.request.projectContext = {
    name: "Study Log",
    purposeSummary: "Portfolio project",
    requirements: "Track study sessions locally and show seven-day totals.",
  };
  const payload = JSON.parse(compileWebPrompt(input).body) as any;
  assert.equal(payload.run.projectId, "project-study-log");
  assert.equal(payload.run.purposeProfile.purpose, "portfolio");
  assert.equal(payload.run.projectContext.name, "Study Log");
  assert.match(payload.run.projectContext.requirements, /seven-day/);
});
test("recovery prompts are marked and credential-like evidence is redacted", () => {
  const input = baseInput();
  input.desktopEvidence = [{
    kind: "command",
    summary: "Authorization: Bearer bearer-secret DISCORD_TOKEN=token-secret cookie=session-secret API_KEY=env-secret https://preview.example/?access_token=url-secret https%3A%2F%2Fpreview.example%2F%3Faccess_token%3Dencoded-secret",
    reference: "https://preview.example/?access_token=reference-secret",
  }];
  const compiled = compileWebPrompt({ ...input, kind: "recovery" });
  assert.match(compiled.body, /recovery/i);
  for (const secret of ["bearer-secret", "token-secret", "session-secret", "env-secret", "url-secret", "encoded-secret", "reference-secret", "SUPER_SECRET_POLICY_BODY"]) {
    assert.equal(compiled.body.includes(secret), false);
  }
  assert.match(compiled.body, /\[redacted\]/i);
});

test("prompt compiler rejects mismatched session and run policy context", () => {
  assert.throws(() => compileWebPrompt({ ...baseInput(), session: { ...session(), runId: "run-other" } }), /runId/i);
  assert.throws(() => compileWebPrompt({ ...baseInput(), session: session("PLAN") }), /stage/i);
  assert.throws(() => compileWebPrompt({ ...baseInput(), session: session("IMPLEMENT", 1, "wrong-policy") }), /policy/i);
});


test("prompt pins the exact reasoning result envelope and Desktop intent contract", () => {
  const compiled = compileWebPrompt({
    ...baseInput(),
    run: run("PLAN"),
    session: session("PLAN", 3),
  });
  const payload = JSON.parse(compiled.body) as any;
  assert.match(payload.outputContract.responseFormat, /exactly one JSON object/i);
  assert.deepEqual(payload.outputContract.reasoningTurnResult, {
    version: 1,
    runId: "run-prompt",
    stage: "PLAN",
    generation: 3,
    summary: "non-empty string",
    decisions: ["string"],
    intents: [],
    outcome: "continue|stage-complete|blocked-user|retryable",
  });
  assert.deepEqual(payload.outputContract.desktopIntentCommonRequired, {
    version: 1,
    intentId: "unique non-empty id",
    runId: "run-prompt",
    stage: "PLAN",
    workspaceRoot: "C:/workspace/project",
    policySha256: "policy-sha",
  });
  assert.deepEqual(payload.outputContract.requiredFieldsByIntentKind.READ_CONTEXT, ["path"]);
  assert.deepEqual(payload.outputContract.requiredFieldsByIntentKind.RUN_TEST, ["cwd", "executable", "args", "timeoutMs"]);
  assert.deepEqual(payload.outputContract.requiredFieldsByIntentKind.REQUEST_COMMIT, ["cwd", "message", "expectedHead?"]);
  assert.match(payload.outputContract.blockerReasonRule, /blocked-user/);
});

test("prompt renders Windows workspace roots with JSON-safe forward slashes", () => {
  const input = baseInput();
  input.run.request.targetRoot = "C:\\Users\\user\\IseolLiveSmoke\\sandbox\\campaign-1";
  input.run.state.stage = "PLAN";
  input.session.stage = "PLAN";

  const compiled = compileWebPrompt(input);
  const payload = JSON.parse(compiled.body) as any;

  assert.equal(
    payload.outputContract.desktopIntentCommonRequired.workspaceRoot,
    "C:/Users/user/IseolLiveSmoke/sandbox/campaign-1",
  );
});


test("IMPLEMENT prompt requests the exact PATCH_FRAME_V1 EOF transport", () => {
  const payload = JSON.parse(compileWebPrompt(baseInput()).body) as any;
  assert.equal(payload.outputContract.contract, "patch-frame-v1");
  assert.equal(payload.outputContract.header, "ISEOL_PATCH_V1");
  assert.equal(
    payload.outputContract.completionSignal,
    "ISEOL_IMPLEMENT_DONE",
  );
  assert.match(payload.outputContract.responseFormat, /exact first line/i);
  assert.match(payload.outputContract.payloadRule, /raw unified diff through EOF/i);
  assert.match(payload.outputContract.payloadRule, /exactly one file/i);
  assert.match(payload.outputContract.payloadRule, /next single-file patch/i);
  assert.match(payload.outputContract.payloadRule, /ISEOL_IMPLEMENT_DONE/i);
  assert.match(payload.outputContract.payloadRule, /git-apply-compatible/i);
  assert.match(payload.outputContract.payloadRule, /do not include markdown fences/i);
  assert.doesNotMatch(payload.outputContract.payloadRule, /closing three backticks must be the final line/i);
  assert.doesNotMatch(JSON.stringify(payload.outputContract), /patchText|JSON string|appendix|ISEOL_PATCH_BEGIN|ISEOL_PATCH_END/i);
  assert.equal(payload.outputContract.reasoningTurnResult, undefined);
  assert.equal(payload.outputContract.desktopIntentCommonRequired, undefined);
  assert.equal(payload.outputContract.requiredFieldsByIntentKind, undefined);
});

test("non-IMPLEMENT prompts retain the strict structured JSON contract", () => {
  for (const stage of ["ANALYZE", "PLAN", "SELF_REVIEW"] as const) {
    const payload = JSON.parse(compileWebPrompt({ ...baseInput(), run: run(stage), session: session(stage) }).body) as any;
    assert.match(payload.outputContract.responseFormat, /exactly one JSON object/i);
    assert.equal(payload.outputContract.reasoningTurnResult.stage, stage);
    assert.deepEqual(payload.outputContract.requiredFieldsByIntentKind.READ_CONTEXT, ["path"]);
  }
});


test("structured-json stages do not advertise PROPOSE_PATCH", () => {
  for (const stage of ["ANALYZE", "PLAN", "SELF_REVIEW"] as const) {
    const compiled = compileWebPrompt({
      ...baseInput(),
      run: run(stage),
      session: session(stage),
    });

    const payload = JSON.parse(compiled.body) as any;

    assert.equal(
      payload.allowedDesktopIntents.includes("PROPOSE_PATCH"),
      false,
    );

    assert.equal(
      Object.hasOwn(
        payload.outputContract.requiredFieldsByIntentKind,
        "PROPOSE_PATCH",
      ),
      false,
    );
  }
});

test("structured-json contract prevents raw double quotes inside human text fields", () => {
  const compiled = compileWebPrompt({
    ...baseInput(),
    run: run("PLAN"),
    session: session("PLAN"),
  });

  const payload = JSON.parse(compiled.body) as any;
  const rule = String(
    payload.outputContract.jsonStringEncodingRule ?? "",
  );

  assert.match(rule, /unescaped double quote/i);
  assert.match(rule, /single quotes/i);
  assert.match(rule, /summary and decisions/i);
});

test("prompt requires cwd to stay workspace-relative", () => {
  const payload = JSON.parse(compileWebPrompt({ ...baseInput(), run: run("PLAN"), session: session("PLAN") }).body) as any;
  const rule = String(payload.outputContract.cwdRule ?? "");
  assert.match(rule, /workspace-relative/i);
  assert.match(rule, /use ['"]?\.['"]? for (?:the )?workspace root/i);
  assert.match(rule, /never.*workspaceRoot/i);
});
