import assert from "node:assert/strict";
import test from "node:test";
import { EeeeReviewBridge } from "../src/services/eeee-review-bridge.js";

test("EEEE review bridge posts a versioned GitHub evidence contract", async () => {
  const originalFetch = globalThis.fetch;
  let request: Request | undefined;
  globalThis.fetch = async (input, init) => {
    request = new Request(input, init);
    return new Response(JSON.stringify({ status: "accepted" }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };

  try {
    const result = await new EeeeReviewBridge("http://127.0.0.1:8000", "bridge-token").ingest({
      projectId: "project-1",
      projectRevision: "rev-1",
      repository: "sunwoo162/gleave",
      pullNumber: 7,
      headSha: "a".repeat(40),
      reviewStatus: "passed",
      findingsCount: 0,
      checks: [{ name: "CI", status: "passed" }],
      source: "iseol-github-review",
      generatedAt: "2026-10-06T00:00:00.000Z",
    });

    assert.equal(result.status, "accepted");
    assert.equal(request?.method, "POST");
    assert.equal(request?.url, "http://127.0.0.1:8000/api/projects/project-1/evidence/github-review");
    assert.equal(request?.headers.get("X-Gleave-Bridge-Token"), "bridge-token");
    assert.equal((await request?.json())?.projectRevision, "rev-1");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

