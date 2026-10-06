const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const appSource = fs.readFileSync(0, "utf8");

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}

function response(body, ok = true) {
  return {
    ok,
    headers: { get: () => null },
    json: async () => body,
  };
}

function run(id, summary, requestId = "request-1", status = "completed") {
  return {
    id,
    request_id: requestId,
    status,
    error: status === "failed" ? "Run result could not be persisted" : null,
    created_at: "2026-10-01T00:00:00Z",
    events: [],
    artifacts: [{ type: "agent_result", summary, changed_files: [], test_commands: [] }],
  };
}

function createHarness() {
  const elements = new Map();
  const approvalResponses = [];
  const snapshotResponses = [];
  const executionResponses = [];
  const retryResponses = [];
  const runStatusResponses = [];
  const researchResponses = new Map();
  let approvalRequests = 0;
  let snapshotRequests = 0;
  let researchRequests = 0;
  let executionRequests = 0;
  let runStatusRequests = 0;

  class FakeElement {
    constructor() {
      this.children = [];
      this.listeners = {};
      this.dataset = {};
      this.disabled = false;
      this.textContent = "";
      this.value = "";
      this.attributes = {};
    }

    addEventListener(name, listener) {
      this.listeners[name] = listener;
    }

    append(...children) {
      this.children.push(...children);
    }

    replaceChildren(...children) {
      this.children = children;
      this.textContent = "";
    }

    setAttribute(name, value) {
      this.attributes[name] = String(value);
    }
  }

  const document = {
    querySelector(selector) {
      if (!elements.has(selector)) elements.set(selector, new FakeElement());
      return elements.get(selector);
    },
    querySelectorAll() {
      return [];
    },
    createElement() {
      return new FakeElement();
    },
  };
  const localStorage = {
    getItem: () => null,
    setItem() {},
    removeItem() {},
  };
  const fetch = (url) => {
    const path = String(url);
    if (path.startsWith("/api/runs?")) return Promise.resolve(response([]));
    if (path.endsWith("/execute")) {
      executionRequests += 1;
      const next = executionResponses.shift();
      if (!next) throw new Error("Unexpected run execution request");
      return next.promise;
    }
    if (path.endsWith("/retry")) {
      const next = retryResponses.shift();
      if (!next) throw new Error("Unexpected run retry request");
      return next.promise;
    }
    if (path.startsWith("/api/runs/")) {
      runStatusRequests += 1;
      const next = runStatusResponses.shift();
      if (!next) throw new Error(`Unexpected run status request: ${path}`);
      return next.promise;
    }
    if (path.endsWith("/research")) {
      researchRequests += 1;
      const requestId = path.split("/")[3];
      const next = researchResponses.get(requestId);
      if (!next) throw new Error(`Unexpected research request: ${requestId}`);
      researchResponses.delete(requestId);
      return next.promise;
    }
    if (path.endsWith("/approve")) {
      approvalRequests += 1;
      const next = approvalResponses.shift();
      if (!next) throw new Error("Unexpected approval request");
      return next.promise;
    }
    if (path.startsWith("/api/requests/")) {
      snapshotRequests += 1;
      const next = snapshotResponses.shift();
      if (!next) throw new Error("Unexpected request snapshot");
      return next.promise;
    }
    throw new Error(`Unexpected fetch: ${path}`);
  };

  const context = vm.createContext({ document, localStorage, fetch });
  vm.runInContext(appSource, context, { filename: "app.js" });

  function setRequestRuns(runs, requestId = "request-1", approved = false) {
    context.testRuns = runs;
    context.testRequestId = requestId;
    context.testApproved = approved;
    context.testCandidate = candidate("owner/alpha");
    vm.runInContext(
      'state.requestId = testRequestId; state.runId = testRuns[0].id; state.approved = testApproved; state.candidates = [testCandidate]; state.selectedCandidates = null; state.decisionEvents = []; state.runs = testRuns; renderCandidates(); renderRunHistory(state.runs); renderRun(testRuns[0]);',
      context,
    );
  }

  function selectRun(runId) {
    const history = elements.get("#run-history");
    const item = history.children.find((candidate) => candidate.children[0].dataset.runId === runId);
    assert.ok(item, `run ${runId} should be present in local history`);
    item.children[0].listeners.click();
  }

  function stateValue(expression) {
    return vm.runInContext(expression, context);
  }

  async function flush() {
    await new Promise((resolve) => setImmediate(resolve));
    await new Promise((resolve) => setImmediate(resolve));
  }

  return {
    elements,
    getElement: (selector) => document.querySelector(selector),
    approvalResponses,
    snapshotResponses,
    setResearchResponse(requestId, result) { researchResponses.set(requestId, result); },
    executionResponses,
    retryResponses,
    runStatusResponses,
    get approvalRequests() { return approvalRequests; },
    get snapshotRequests() { return snapshotRequests; },
    get researchRequests() { return researchRequests; },
    get executionRequests() { return executionRequests; },
    get runStatusRequests() { return runStatusRequests; },
    setRequestRuns,
    selectRun,
    stateValue,
    flush,
  };
}

const approvalResult = {
  decision: { approved: true, selected: [] },
  decision_events: [],
  run_id: "approved-run",
};

function candidate(name) {
  return {
    repository: {
      full_name: name,
      description: `${name} candidate`,
      stars: 10,
      forks: 1,
      pushed_at: "2026-10-01T00:00:00Z",
      license_spdx: "MIT",
    },
    total: 10,
    dimension_scores: { fit: 10 },
    evidence: ["Matches the brief"],
    risks: [],
  };
}

function approvalSnapshot(requestId = "request-1") {
  return {
    request_id: requestId,
    candidates: [candidate("owner/alpha")],
    decision: { approved: true, selected: [] },
    decision_events: [],
    runs: [
      run("chosen-run", "chosen summary", requestId),
      run("approved-run", "approved summary", requestId),
    ],
    brief: { raw_text: "", goal: "", target_type: "" },
    workspace: "",
  };
}

async function verifyApprovalPostDoesNotOverrideNewerRun() {
  const harness = createHarness();
  const approvalResponse = deferred();
  const snapshotResponse = deferred();
  harness.approvalResponses.push(approvalResponse);
  harness.snapshotResponses.push(snapshotResponse);
  harness.setRequestRuns([run("previous-run", "previous"), run("chosen-run", "chosen summary")]);

  const approvalTask = harness.elements.get("#approve-button").listeners.click();
  harness.selectRun("chosen-run");
  approvalResponse.resolve(response(approvalResult));
  for (let attempt = 0; attempt < 10 && harness.snapshotRequests === 0; attempt += 1) {
    await harness.flush();
  }

  assert.equal(harness.snapshotRequests, 1, "successful approval should refresh its request snapshot");
  assert.equal(harness.stateValue("state.approved"), true);
  assert.equal(harness.stateValue("state.runId"), "chosen-run");
  assert.equal(harness.elements.get("#run-summary").textContent, "completed: chosen summary");

  snapshotResponse.resolve(response(approvalSnapshot()));
  await approvalTask;
  assert.equal(harness.stateValue("state.runId"), "chosen-run");
  assert.equal(harness.elements.get("#run-summary").textContent, "completed: chosen summary");
}

async function verifySnapshotDoesNotOverrideNewerRun() {
  const harness = createHarness();
  const approvalResponse = deferred();
  const snapshotResponse = deferred();
  harness.approvalResponses.push(approvalResponse);
  harness.snapshotResponses.push(snapshotResponse);
  harness.setRequestRuns([run("previous-run", "previous"), run("chosen-run", "chosen summary")]);

  const approvalTask = harness.elements.get("#approve-button").listeners.click();
  approvalResponse.resolve(response(approvalResult));
  for (let attempt = 0; attempt < 10 && harness.snapshotRequests === 0; attempt += 1) {
    await harness.flush();
  }
  assert.equal(harness.snapshotRequests, 1, "approval should refresh its request snapshot");

  harness.selectRun("chosen-run");
  snapshotResponse.resolve(response(approvalSnapshot()));
  await approvalTask;

  assert.equal(harness.stateValue("state.runId"), "chosen-run");
  assert.equal(harness.elements.get("#run-summary").textContent, "completed: chosen summary");
}

async function verifyApprovalButtonPreventsDuplicateSubmissions() {
  const harness = createHarness();
  const approvalResponse = deferred();
  const snapshotResponse = deferred();
  harness.approvalResponses.push(approvalResponse);
  harness.snapshotResponses.push(snapshotResponse);
  harness.setRequestRuns([run("current-run", "current")]);
  const approveButton = harness.elements.get("#approve-button");

  const approvalTask = approveButton.listeners.click();
  assert.equal(approveButton.disabled, true);
  await approveButton.listeners.click();
  assert.equal(harness.approvalRequests, 1);

  approvalResponse.resolve(response(approvalResult));
  for (let attempt = 0; attempt < 10 && harness.snapshotRequests === 0; attempt += 1) {
    await harness.flush();
  }
  snapshotResponse.resolve(response(approvalSnapshot()));
  await approvalTask;

  assert.equal(harness.approvalRequests, 1);
  assert.equal(harness.stateValue("state.approved"), true);
  assert.equal(approveButton.disabled, true);
}

async function verifyFailedApprovalCanBeRetried() {
  const harness = createHarness();
  const approvalResponse = deferred();
  harness.approvalResponses.push(approvalResponse);
  harness.setRequestRuns([run("current-run", "current")]);
  const approveButton = harness.elements.get("#approve-button");

  const approvalTask = approveButton.listeners.click();
  assert.equal(approveButton.disabled, true);
  approvalResponse.resolve(response({ detail: "Approval temporarily unavailable" }, false));
  await approvalTask;

  assert.equal(harness.stateValue("state.approved"), false);
  assert.equal(approveButton.disabled, false);
}

async function verifyFailedResearchCanBeRetried() {
  const harness = createHarness();
  const failedResearchResponse = deferred();
  const retryResearchResponse = deferred();
  harness.setResearchResponse("request-1", failedResearchResponse);
  harness.setRequestRuns([run("current-run", "current")]);
  const researchButton = harness.elements.get("#research-button");

  const firstTask = researchButton.listeners.click();
  const disabledDuringFirstAttempt = researchButton.disabled;
  failedResearchResponse.reject(new Error("Temporary research failure"));
  await firstTask;
  const enabledAfterFailure = !researchButton.disabled;

  harness.setResearchResponse("request-1", retryResearchResponse);
  const retryTask = researchButton.listeners.click();
  const disabledDuringRetry = researchButton.disabled;
  const requestsAfterRetry = harness.researchRequests;
  retryResearchResponse.resolve(response({
    candidates: [candidate("owner/recovered")],
    work_plan: { steps: [] },
  }));
  await retryTask;

  assert.deepEqual({
    disabledDuringFirstAttempt,
    enabledAfterFailure,
    disabledDuringRetry,
    requestsAfterRetry,
    enabledAfterRetry: !researchButton.disabled,
    candidateAfterRetry: harness.stateValue("state.candidates[0].repository.full_name"),
  }, {
    disabledDuringFirstAttempt: true,
    enabledAfterFailure: true,
    disabledDuringRetry: true,
    requestsAfterRetry: 2,
    enabledAfterRetry: true,
    candidateAfterRetry: "owner/recovered",
  });
}

async function verifySnapshotRestoreKeepsPendingResearchDisabled() {
  const harness = createHarness();
  const researchResponse = deferred();
  const snapshotResponse = deferred();
  harness.setResearchResponse("request-1", researchResponse);
  harness.snapshotResponses.push(snapshotResponse);
  harness.setRequestRuns([run("current-run", "current")]);
  const researchButton = harness.elements.get("#research-button");

  const researchTask = researchButton.listeners.click();
  const disabledDuringResearch = researchButton.disabled;
  const busyDuringResearch = harness.elements.get("#candidates").attributes["aria-busy"];
  const snapshot = approvalSnapshot("request-1");
  snapshot.decision = null;
  harness.getElement("#restore-request-id").value = "request-1";
  const restoreTask = harness.elements.get("#restore-form").listeners.submit({
    preventDefault() {},
  });
  for (let attempt = 0; attempt < 10 && harness.snapshotRequests === 0; attempt += 1) {
    await harness.flush();
  }
  snapshotResponse.resolve(response(snapshot));
  await restoreTask;
  const disabledAfterRestore = researchButton.disabled;
  const busyAfterRestore = harness.elements.get("#candidates").attributes["aria-busy"];

  researchResponse.resolve(response({
    candidates: [candidate("owner/refreshed")],
    work_plan: { steps: [] },
  }));
  await researchTask;
  const busyAfterResearch = harness.elements.get("#candidates").attributes["aria-busy"];

  assert.deepEqual({
    disabledDuringResearch,
    busyDuringResearch,
    disabledAfterRestore,
    busyAfterRestore,
    enabledAfterResearch: !researchButton.disabled,
    busyAfterResearch,
  }, {
    disabledDuringResearch: true,
    busyDuringResearch: "true",
    disabledAfterRestore: true,
    busyAfterRestore: "true",
    enabledAfterResearch: true,
    busyAfterResearch: "false",
  });
}

async function verifyResearchSubmissionIsScopedToItsRequest() {
  const harness = createHarness();
  const firstResearchResponse = deferred();
  const secondResearchResponse = deferred();
  harness.setResearchResponse("request-1", firstResearchResponse);
  harness.setResearchResponse("request-2", secondResearchResponse);
  harness.setRequestRuns([run("first-run", "first", "request-1")], "request-1");
  const researchButton = harness.elements.get("#research-button");

  const firstTask = researchButton.listeners.click();
  const disabledForFirstRequest = researchButton.disabled;
  const duplicateTask = researchButton.listeners.click();
  const requestsAfterDuplicate = harness.researchRequests;

  harness.setRequestRuns([run("second-run", "second", "request-2")], "request-2");
  const secondTask = researchButton.listeners.click();
  const requestsWithSecondRequest = harness.researchRequests;
  const disabledForSecondRequest = researchButton.disabled;

  firstResearchResponse.resolve(response({
    candidates: [candidate("owner/stale")],
    work_plan: { steps: [] },
  }));
  await firstTask;
  await duplicateTask;
  const remainsDisabledAfterStaleCompletion = researchButton.disabled;
  const selectedRequestAfterStaleCompletion = harness.stateValue("state.requestId");

  secondResearchResponse.resolve(response({
    candidates: [candidate("owner/current")],
    work_plan: { steps: [] },
  }));
  await secondTask;

  assert.deepEqual({
    disabledForFirstRequest,
    requestsAfterDuplicate,
    requestsWithSecondRequest,
    disabledForSecondRequest,
    remainsDisabledAfterStaleCompletion,
    selectedRequestAfterStaleCompletion,
    currentCandidate: harness.stateValue("state.candidates[0].repository.full_name"),
    enabledAfterCurrentCompletion: !researchButton.disabled,
  }, {
    disabledForFirstRequest: true,
    requestsAfterDuplicate: 1,
    requestsWithSecondRequest: 2,
    disabledForSecondRequest: true,
    remainsDisabledAfterStaleCompletion: true,
    selectedRequestAfterStaleCompletion: "request-2",
    currentCandidate: "owner/current",
    enabledAfterCurrentCompletion: true,
  });
}

async function verifyApprovalsForDifferentRequestsCanOverlap() {
  const harness = createHarness();
  const firstApprovalResponse = deferred();
  const secondApprovalResponse = deferred();
  const secondSnapshotResponse = deferred();
  harness.approvalResponses.push(firstApprovalResponse, secondApprovalResponse);
  harness.setRequestRuns([run("first-run", "first", "request-1")], "request-1");
  const approveButton = harness.elements.get("#approve-button");
  const firstTask = approveButton.listeners.click();

  harness.setRequestRuns([run("second-run", "second", "request-2")], "request-2");
  const secondTask = approveButton.listeners.click();
  assert.equal(approveButton.disabled, true);
  assert.equal(harness.approvalRequests, 2);

  harness.snapshotResponses.push(secondSnapshotResponse);
  secondApprovalResponse.resolve(response(approvalResult));
  for (let attempt = 0; attempt < 10 && harness.snapshotRequests === 0; attempt += 1) {
    await harness.flush();
  }
  secondSnapshotResponse.resolve(response(approvalSnapshot("request-2")));
  await secondTask;
  assert.equal(harness.stateValue("state.runId"), "approved-run");
  assert.equal(harness.stateValue("state.selectedCandidates.length"), 0);
  assert.equal(harness.stateValue("state.decisionEvents.length"), 0);

  firstApprovalResponse.resolve(response({
    decision: { approved: true, selected: ["owner/stale"] },
    decision_events: [{ action: "approved", selected: ["owner/stale"] }],
    run_id: "stale-request-1-run",
  }));
  await firstTask;
  assert.equal(harness.stateValue("state.requestId"), "request-2");
  assert.equal(harness.stateValue("state.approved"), true);
  assert.equal(harness.stateValue("state.runId"), "approved-run");
  assert.equal(harness.stateValue("state.selectedCandidates.length"), 0);
  assert.equal(harness.stateValue("state.decisionEvents.length"), 0);
}

async function verifyRunExecutionIsLockedPerRunAndAllowsOtherRuns() {
  const harness = createHarness();
  const firstResponse = deferred();
  const secondResponse = deferred();
  harness.executionResponses.push(firstResponse, secondResponse);
  harness.setRequestRuns([
    run("first-run", "first", "request-1", "created"),
    run("second-run", "second", "request-1", "created"),
  ], "request-1", true);
  const runButton = harness.getElement("#run-button");
  harness.selectRun("first-run");

  const firstTask = runButton.listeners.click();
  assert.equal(runButton.disabled, true);
  await runButton.listeners.click();
  assert.equal(harness.executionRequests, 1, "a second click must not submit the same run twice");

  harness.selectRun("second-run");
  assert.equal(runButton.disabled, false, "another run remains executable");
  const secondTask = runButton.listeners.click();
  assert.equal(harness.executionRequests, 2);
  harness.selectRun("first-run");
  assert.equal(runButton.disabled, true, "returning to an in-flight run keeps it locked");

  firstResponse.resolve(response(run("first-run", "first complete", "request-1")));
  await firstTask;
  secondResponse.resolve(response(run("second-run", "second complete", "request-1")));
  await secondTask;

  assert.equal(harness.executionRequests, 2);
  assert.equal(runButton.disabled, true, "a completed run cannot be executed again");
}

async function verifyFailedRunSubmissionCanBeRetried() {
  const harness = createHarness();
  const failedResponse = deferred();
  const retryResponse = deferred();
  harness.executionResponses.push(failedResponse, retryResponse);
  harness.setRequestRuns([run("retry-run", "retry", "request-1", "created")], "request-1", true);
  const runButton = harness.getElement("#run-button");
  harness.selectRun("retry-run");

  const firstTask = runButton.listeners.click();
  failedResponse.resolve(response({ detail: "Temporary network failure" }, false));
  await firstTask;
  assert.equal(runButton.disabled, false, "a failed request releases the run lock for retry");

  const retryTask = runButton.listeners.click();
  assert.equal(harness.executionRequests, 2);
  retryResponse.resolve(response(run("retry-run", "retry complete", "request-1")));
  await retryTask;
  assert.equal(harness.executionRequests, 2);
}

async function verifyExecutionErrorRefreshesPersistedRunStatus() {
  const harness = createHarness();
  const failedExecutionResponse = deferred();
  const savedRunResponse = deferred();
  harness.executionResponses.push(failedExecutionResponse);
  harness.runStatusResponses.push(savedRunResponse);
  harness.setRequestRuns([run("saved-run", "initial", "request-1", "created")], "request-1", true);
  const runButton = harness.getElement("#run-button");
  const retryButton = harness.getElement("#retry-button");
  harness.selectRun("saved-run");

  const executionTask = runButton.listeners.click();
  failedExecutionResponse.resolve(response({ detail: "Internal Server Error" }, false));
  for (let attempt = 0; attempt < 10 && harness.runStatusRequests === 0; attempt += 1) {
    await harness.flush();
  }
  assert.equal(harness.runStatusRequests, 1, "a failed execution response should refresh the saved run");
  savedRunResponse.resolve(response(run("saved-run", "initial", "request-1", "failed")));
  await executionTask;

  assert.equal(harness.stateValue('state.runs.find((item) => item.id === "saved-run").status'), "failed");
  assert.equal(runButton.disabled, true, "the persisted failed state cannot be executed directly");
  assert.equal(retryButton.disabled, false, "the persisted failed state exposes retry");
  assert.equal(harness.getElement("#run-summary").textContent, "failed: Run result could not be persisted");
}

async function verifyRetryConfirmationWarnsAboutPartialWorkspaceChanges() {
  const harness = createHarness();
  harness.retryResponses.push({ promise: Promise.resolve(response(run("failed-run", "retry queued", "request-1", "created"))) });
  harness.setRequestRuns([run("failed-run", "previous attempt failed", "request-1", "failed")], "request-1", true);

  await harness.getElement("#retry-button").listeners.click();

  assert.equal(
    harness.getElement("#run-summary").textContent,
    "Retry queued. Check the workspace for partial changes before executing again.",
  );
}

async function verifyRunDisplaysReportedTestCommands() {
  const harness = createHarness();
  const completed = run("verified-run", "verified", "request-1", "completed");
  completed.artifacts.unshift({ type: "metadata", changed_files: [] });
  completed.artifacts.unshift({ type: "run_bundle", path: "workspace/run/FINAL-REPORT.md" });
  completed.artifacts[2].test_commands = ["pytest -q", "git diff --check"];
  harness.setRequestRuns([completed], "request-1", true);

  assert.deepEqual(
    harness.getElement("#test-commands").children.map((item) => item.textContent),
    ["pytest -q", "git diff --check"],
  );
}

async function verifyRunDisplaysArtifactPaths() {
  const harness = createHarness();
  const completed = run("artifact-run", "artifact", "request-1", "completed");
  completed.artifacts.push({ type: "run_bundle", path: "workspace/run/FINAL-REPORT.md" });
  harness.setRequestRuns([completed], "request-1", true);

  assert.deepEqual(
    harness.getElement("#run-artifacts").children.map((item) => item.textContent),
    ["workspace/run/FINAL-REPORT.md"],
  );
}

async function verifyRunStatusRefreshDoesNotReplaceNewSelection() {
  const harness = createHarness();
  const failedExecutionResponse = deferred();
  const savedRunResponse = deferred();
  harness.executionResponses.push(failedExecutionResponse);
  harness.runStatusResponses.push(savedRunResponse);
  harness.setRequestRuns([
    run("failed-run", "old run", "request-1", "created"),
    run("selected-run", "selected run", "request-1", "created"),
  ], "request-1", true);
  const runButton = harness.getElement("#run-button");
  const retryButton = harness.getElement("#retry-button");
  harness.selectRun("failed-run");

  const executionTask = runButton.listeners.click();
  failedExecutionResponse.resolve(response({ detail: "Internal Server Error" }, false));
  for (let attempt = 0; attempt < 10 && harness.runStatusRequests === 0; attempt += 1) {
    await harness.flush();
  }
  assert.equal(harness.runStatusRequests, 1);
  harness.selectRun("selected-run");
  savedRunResponse.resolve(response(run("failed-run", "old run", "request-1", "failed")));
  await executionTask;

  assert.equal(harness.stateValue("state.runId"), "selected-run");
  assert.equal(harness.getElement("#run-summary").textContent, "created: selected run");
  assert.equal(runButton.disabled, false);
  assert.equal(retryButton.disabled, true);
  assert.equal(harness.stateValue('state.runs.find((item) => item.id === "failed-run").status'), "failed");
}

async function main() {
  await verifyApprovalPostDoesNotOverrideNewerRun();
  await verifySnapshotDoesNotOverrideNewerRun();
  await verifyApprovalButtonPreventsDuplicateSubmissions();
  await verifyFailedApprovalCanBeRetried();
  await verifyFailedResearchCanBeRetried();
  await verifySnapshotRestoreKeepsPendingResearchDisabled();
  await verifyResearchSubmissionIsScopedToItsRequest();
  await verifyApprovalsForDifferentRequestsCanOverlap();
  await verifyRunExecutionIsLockedPerRunAndAllowsOtherRuns();
  await verifyFailedRunSubmissionCanBeRetried();
  await verifyExecutionErrorRefreshesPersistedRunStatus();
  await verifyRetryConfirmationWarnsAboutPartialWorkspaceChanges();
  await verifyRunDisplaysReportedTestCommands();
  await verifyRunDisplaysArtifactPaths();
  await verifyRunStatusRefreshDoesNotReplaceNewSelection();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
