const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const appSource = fs.readFileSync(0, "utf8");

function deferred() {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function response(body, ok = true) {
  return {
    ok,
    headers: { get: () => null },
    json: async () => body,
  };
}

class FakeElement {
  constructor() {
    this.children = [];
    this.listeners = {};
    this.dataset = {};
    this.attributes = {};
    this.textContent = "";
    this.value = "";
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
    this.attributes[name] = value;
  }
}

function createHarness() {
  const elements = new Map();
  const referenceResponses = [];
  const visualResponses = [];
  const element = (selector) => {
    if (!elements.has(selector)) elements.set(selector, new FakeElement());
    return elements.get(selector);
  };
  const document = {
    querySelector: element,
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
    if (path === "/api/design/references") {
      const next = referenceResponses.shift();
      if (!next) throw new Error("Unexpected reference request");
      return next.promise;
    }
    if (path === "/api/design/verify") {
      const next = visualResponses.shift();
      if (!next) throw new Error("Unexpected visual verification request");
      return next.promise;
    }
    throw new Error(`Unexpected fetch: ${path}`);
  };
  const context = vm.createContext({ document, localStorage, fetch });
  vm.runInContext(appSource, context, { filename: "app.js" });

  function submitDesign(url) {
    element("#reference-url").value = url;
    return element("#design-form").listeners.submit({ preventDefault() {} });
  }

  function submitVisual(url) {
    element("#visual-url").value = url;
    return element("#visual-form").listeners.submit({ preventDefault() {} });
  }

  return { elements, referenceResponses, visualResponses, submitDesign, submitVisual };
}

function referenceResult(title) {
  return {
    pack: {
      references: [{
        title,
        source_url: `https://example.test/${title}`,
        license_name: "CC BY 4.0",
        allowed_uses: ["reference_only"],
      }],
      attribution: [title],
    },
    tokens: { input: 1 },
  };
}

function visualResult(id, status) {
  return { id, report: { status, blocking_reason: null, differences: [] } };
}

async function verifyReferencesKeepLatestSubmission() {
  const harness = createHarness();
  const staleResponse = deferred();
  const latestResponse = deferred();
  harness.referenceResponses.push(staleResponse, latestResponse);
  const staleTask = harness.submitDesign("https://example.test/stale");
  const latestTask = harness.submitDesign("https://example.test/latest");

  latestResponse.resolve(response(referenceResult("latest")));
  await latestTask;
  staleResponse.resolve(response(referenceResult("stale")));
  await staleTask;

  assert.equal(harness.elements.get("#references").children[0].children[0].textContent, "latest");
  assert.equal(harness.elements.get("#design-status").textContent, "Pack recorded");
}

async function verifyReferenceErrorsFromOlderSubmissionsAreIgnored() {
  const harness = createHarness();
  const staleResponse = deferred();
  const latestResponse = deferred();
  harness.referenceResponses.push(staleResponse, latestResponse);
  const staleTask = harness.submitDesign("https://example.test/old-error");
  const latestTask = harness.submitDesign("https://example.test/current");

  latestResponse.resolve(response(referenceResult("current")));
  await latestTask;
  staleResponse.resolve(response({ detail: "stale reference error" }, false));
  await staleTask;

  assert.equal(harness.elements.get("#references").children[0].children[0].textContent, "current");
  assert.equal(harness.elements.get("#design-status").textContent, "Pack recorded");
}

async function verifyVisualChecksKeepLatestSubmission() {
  const harness = createHarness();
  const staleResponse = deferred();
  const latestResponse = deferred();
  harness.visualResponses.push(staleResponse, latestResponse);
  const staleTask = harness.submitVisual("https://example.test/stale");
  const latestTask = harness.submitVisual("https://example.test/latest");

  latestResponse.resolve(response(visualResult("latest", "pass")));
  await latestTask;
  staleResponse.resolve(response(visualResult("stale", "fail")));
  await staleTask;

  assert.match(harness.elements.get("#visual-status").textContent, /pass: No differences \(ID: latest\)/);
}

async function verifyVisualErrorsFromOlderSubmissionsAreIgnored() {
  const harness = createHarness();
  const staleResponse = deferred();
  const latestResponse = deferred();
  harness.visualResponses.push(staleResponse, latestResponse);
  const staleTask = harness.submitVisual("https://example.test/old-error");
  const latestTask = harness.submitVisual("https://example.test/current");

  latestResponse.resolve(response(visualResult("current", "pass")));
  await latestTask;
  staleResponse.resolve(response({ detail: "stale visual error" }, false));
  await staleTask;

  assert.match(harness.elements.get("#visual-status").textContent, /pass: No differences \(ID: current\)/);
}

async function verifyDesignFormsKeepIndependentSequences() {
  const harness = createHarness();
  const referenceResponse = deferred();
  const visualResponse = deferred();
  harness.referenceResponses.push(referenceResponse);
  harness.visualResponses.push(visualResponse);
  const referenceTask = harness.submitDesign("https://example.test/reference");
  const visualTask = harness.submitVisual("https://example.test/visual");

  visualResponse.resolve(response(visualResult("visual", "pass")));
  await visualTask;
  referenceResponse.resolve(response(referenceResult("reference")));
  await referenceTask;

  assert.equal(harness.elements.get("#references").children[0].children[0].textContent, "reference");
  assert.match(harness.elements.get("#visual-status").textContent, /ID: visual\)/);
}

async function verifyDesignFormsDisableDuplicateSubmissions() {
  const harness = createHarness();
  const referenceResponse = deferred();
  const visualResponse = deferred();
  harness.referenceResponses.push(referenceResponse);
  harness.visualResponses.push(visualResponse);

  const referenceTask = harness.submitDesign("https://example.test/reference");
  const visualTask = harness.submitVisual("http://127.0.0.1:8000");
  assert.equal(harness.elements.get("#collect-reference-button").disabled, true);
  assert.equal(harness.elements.get("#verify-visual-button").disabled, true);

  referenceResponse.resolve(response(referenceResult("reference")));
  visualResponse.resolve(response(visualResult("visual", "pass")));
  await referenceTask;
  await visualTask;

  assert.equal(harness.elements.get("#collect-reference-button").disabled, false);
  assert.equal(harness.elements.get("#verify-visual-button").disabled, false);
}

async function verifyVisualVerificationShowsBusyState() {
  const harness = createHarness();
  const visualResponse = deferred();
  harness.visualResponses.push(visualResponse);

  const task = harness.submitVisual("http://127.0.0.1:8000");
  assert.equal(harness.elements.get("#visual-status").textContent, "Verifying…");
  assert.equal(harness.elements.get("#visual-form").attributes["aria-busy"], "true");

  visualResponse.resolve(response(visualResult("visual", "pass")));
  await task;

  assert.equal(harness.elements.get("#visual-form").attributes["aria-busy"], "false");
}

async function verifyReferenceCollectionShowsBusyState() {
  const harness = createHarness();
  const referenceResponse = deferred();
  harness.referenceResponses.push(referenceResponse);

  const task = harness.submitDesign("https://example.test/reference");
  assert.equal(harness.elements.get("#design-status").textContent, "Collecting…");
  assert.equal(harness.elements.get("#design-form").attributes["aria-busy"], "true");

  referenceResponse.resolve(response(referenceResult("reference")));
  await task;

  assert.equal(harness.elements.get("#design-form").attributes["aria-busy"], "false");
}

async function main() {
  await verifyReferencesKeepLatestSubmission();
  await verifyReferenceErrorsFromOlderSubmissionsAreIgnored();
  await verifyVisualChecksKeepLatestSubmission();
  await verifyVisualErrorsFromOlderSubmissionsAreIgnored();
  await verifyDesignFormsKeepIndependentSequences();
  await verifyDesignFormsDisableDuplicateSubmissions();
  await verifyVisualVerificationShowsBusyState();
  await verifyReferenceCollectionShowsBusyState();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
