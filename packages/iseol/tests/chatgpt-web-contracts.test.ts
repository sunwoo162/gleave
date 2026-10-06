import assert from "node:assert/strict";
import test from "node:test";
import {
  ISEOL_CHATGPT_WEB_PROTOCOL_VERSION,
  assertDesktopIntent,
  assertReasoningTurn,
  assertReasoningTurnResult,
  reasoningResultRejectionDiagnostic,
  assertWebWorkerSession,
} from "../src/chatgpt-web/contracts.js";

const commonIntent = {
  version: 1 as const,
  intentId: "intent-1",
  runId: "run-1",
  stage: "IMPLEMENT" as const,
  workspaceRoot: "C:/workspace/project",
  policySha256: "abc123",
};

test("chatgpt web protocol version is strict", () => {
  assert.equal(ISEOL_CHATGPT_WEB_PROTOCOL_VERSION, 1);
  assert.throws(() => assertDesktopIntent({ ...commonIntent, version: 2, kind: "GIT_INSPECT", cwd: "." }), /protocol version/i);
});
test("session and turn records require safe identity and timestamps", () => {
  const session = { version: 1, sessionId: "session-1", runId: "run-1", stage: "PLAN", generation: 1, policySha256: "abc", status: "ready", createdAt: "2026-09-08T01:00:00.000Z" };
  assert.doesNotThrow(() => assertWebWorkerSession(session));
  assert.throws(() => assertWebWorkerSession({ ...session, sessionId: "../escape" }), /sessionId/i);
  assert.throws(() => assertWebWorkerSession({ ...session, createdAt: "not-a-date" }), /createdAt/i);

  const turn = { version: 1, turnId: "turn-1", sessionId: "session-1", runId: "run-1", stage: "PLAN", generation: 1, promptSha256: "p", responseSha256: "r", summary: "Plan ready", decisions: [], desktopIntentIds: [], outcome: "stage-complete", recordedAt: "2026-09-08T01:01:00.000Z" };
  assert.doesNotThrow(() => assertReasoningTurn(turn));
  assert.throws(() => assertReasoningTurn({ ...turn, turnId: "bad/id" }), /turnId/i);
  assert.throws(() => assertReasoningTurn({ ...turn, recordedAt: "invalid" }), /recordedAt/i);
});

test("desktop intents accept only the supported structured vocabulary", () => {
  const intents = [
    { ...commonIntent, kind: "READ_CONTEXT", path: "src/index.ts" },
    { ...commonIntent, intentId: "intent-2", kind: "PROPOSE_PATCH", path: "src/index.ts", patch: "patch" },
    { ...commonIntent, intentId: "intent-3", kind: "RUN_TEST", cwd: ".", executable: "npm", args: ["test"], timeoutMs: 60_000 },
    { ...commonIntent, intentId: "intent-4", kind: "RUN_BUILD", cwd: ".", executable: "npm", args: ["run", "build"], timeoutMs: 60_000 },
    { ...commonIntent, intentId: "intent-5", kind: "GIT_INSPECT", cwd: "." },
    { ...commonIntent, intentId: "intent-6", kind: "REQUEST_COMMIT", cwd: ".", message: "feat: test" },
    { ...commonIntent, intentId: "intent-7", kind: "CHECK_HTTP", url: "http://127.0.0.1:3000", timeoutMs: 5_000 },
  ];
  for (const intent of intents) assert.doesNotThrow(() => assertDesktopIntent(intent));
  assert.throws(() => assertDesktopIntent({ ...commonIntent, kind: "SHELL", command: "rm -rf ." }), /unsupported.*intent/i);
});
test("CHECK_HTTP intents reject unsafe URL syntax", () => {
  for (const url of [
    "ftp://preview.example.test/result",
    "http://user:password@preview.example.test/result",
    "http://@preview.example.test/result",
    "http://preview.example.test\\result",
    "http://preview.example.test/%5Cresult",
    "http://preview.example.test/result?token=secret-value",
    "http://preview.example.test/result?api_key=secret-value",
    "http://preview.example.test/result?client_secret=secret-value",
    "http://preview.example.test/result?id_token=secret-value",
    "http://preview.example.test/result?auth_token=secret-value",
    "http://preview.example.test/result?bearer_token=secret-value",
    "http://preview.example.test/result?x-api-key=secret-value",
    "http://preview.example.test/result?oauth_token=secret-value",
    "http://preview.example.test/result?x-auth-token=secret-value",
    "http://preview.example.test/result?api-token=secret-value",
    "http://preview.example.test/result?secret_key=secret-value",
    "http://preview.example.test/result?session_token=secret-value",
    "http://preview.example.test/result?jwt=secret-value",
    "http://preview.example.test/result?x-api-token=secret-value",
    "http://preview.example.test/result?x-access-token=secret-value",
    "http://preview.example.test/result?authorization_token=secret-value",
    "http://preview.example.test/result?csrf_token=secret-value",
    "http://preview.example.test/result?oauth2_token=secret-value",
    "http://preview.example.test/result?x-oauth-token=secret-value",
    "http://preview.example.test/result?oauth_access_token=secret-value",
    "http://preview.example.test/result#access_token=secret-value",
    "http://preview.example.test/result#oauth_token=secret-value",
    "http://preview.example.test/result#access_token%3Dsecret-value",
    "http://preview.example.test/result#foo%26oauth_token%3Dsecret-value",
    "http://preview.example.test/result#access_token%3Dsecret%ZZ",
    "http://preview.example.test/result#access_token%ZZ=secret-value",
    `http://preview.example.test/result${String.fromCharCode(10)}`,
  ]) {
    assert.throws(
      () => assertDesktopIntent({ ...commonIntent, kind: "CHECK_HTTP", url, timeoutMs: 5_000 }),
      /CHECK_HTTP|URL|credential|control/i,
      url,
    );
  }
  assert.doesNotThrow(() => assertDesktopIntent({ ...commonIntent, kind: "CHECK_HTTP", url: "http://127.0.0.1:3000", timeoutMs: 2_147_483_647 }));
  for (const timeoutMs of [2_147_483_648, Number.MAX_SAFE_INTEGER]) {
    assert.throws(
      () => assertDesktopIntent({ ...commonIntent, kind: "CHECK_HTTP", url: "http://127.0.0.1:3000", timeoutMs }),
      /timeout/i,
      String(timeoutMs),
    );
  }
});
test("desktop intents reject unsafe or unknown execution fields", () => {
  for (const [key, value] of Object.entries({ command: "x", shell: true, env: { X: "1" }, token: "secret", force: true })) {
    assert.throws(
      () => assertDesktopIntent({ ...commonIntent, kind: "GIT_INSPECT", cwd: ".", [key]: value }),
      /unexpected.*field/i,
    );
  }
  assert.throws(() => assertDesktopIntent({ ...commonIntent, kind: "GIT_INSPECT", cwd: ".", extra: true }), /unexpected.*field/i);
});

test("reasoning results bind run stage generation and intent identity", () => {
  const result = {
    version: 1,
    runId: "run-1",
    stage: "IMPLEMENT",
    generation: 2,
    summary: "Apply the validated patch",
    decisions: ["Keep the existing API"],
    intents: [{ ...commonIntent, kind: "GIT_INSPECT", cwd: "." }],
    outcome: "continue",
  };
  assert.doesNotThrow(() => assertReasoningTurnResult(result));
  assert.throws(() => assertReasoningTurnResult({ ...result, generation: 0 }), /generation/i);
  assert.throws(() => assertReasoningTurnResult({ ...result, intents: [{ ...commonIntent, runId: "run-other", kind: "GIT_INSPECT", cwd: "." }] }), /runId/i);
  assert.throws(() => assertReasoningTurnResult({ ...result, intents: [{ ...commonIntent, stage: "PLAN", kind: "GIT_INSPECT", cwd: "." }] }), /stage/i);
  assert.throws(() => assertReasoningTurnResult({ ...result, intents: [result.intents[0], result.intents[0]] }), /duplicate.*intent/i);
});
test("blocked-user is the only result outcome that carries blockerReason", () => {
  const base = { version: 1, runId: "run-1", stage: "PLAN", generation: 1, summary: "Need a product decision", decisions: [], intents: [] };
  assert.doesNotThrow(() => assertReasoningTurnResult({ ...base, outcome: "blocked-user", blockerReason: "Choose API behavior" }));
  assert.throws(() => assertReasoningTurnResult({ ...base, outcome: "blocked-user" }), /blockerReason/i);
  assert.throws(() => assertReasoningTurnResult({ ...base, outcome: "stage-complete", blockerReason: "not allowed" }), /blockerReason/i);
  assert.throws(() => assertReasoningTurnResult({ ...base, outcome: "done" }), /outcome/i);
});

test("reasoning results reject credential-shaped durable data", () => {
  const base = {
    version: 1,
    runId: "run-1",
    stage: "IMPLEMENT",
    generation: 1,
    decisions: [],
    intents: [],
    outcome: "stage-complete",
  };
  for (const summary of [
    "token=super-secret-token",
    "password=hunter2",
    "cookie=raw-cookie",
    "Bearer abcdef123456",
  ]) {
    assert.throws(
      () => assertReasoningTurnResult({ ...base, summary }),
      /credential-shaped/i,
    );
  }
});

test("reasoning result schema failures expose bounded rejection classes", () => {
  const valid = {
    version: 1, runId: "run-1", stage: "ANALYZE", generation: 1,
    summary: "ok", decisions: [], intents: [], outcome: "stage-complete",
  };
  for (const [value, expected] of [
    [[], "top-level-not-object"],
    [{ ...valid, outcome: "unknown" }, "outcome-invalid"],
    [{ ...valid, decisions: "nope" }, "decisions-invalid"],
  ] as const) {
    let error: unknown;
    try { assertReasoningTurnResult(value); } catch (candidate) { error = candidate; }
    const diagnostic = reasoningResultRejectionDiagnostic(value, error);
    assert.equal(diagnostic.rejectionClass, expected);
    assert.equal(diagnostic.parserInputReceived, true);
    assert.equal(JSON.stringify(diagnostic).includes("nope"), false);
  }
});
