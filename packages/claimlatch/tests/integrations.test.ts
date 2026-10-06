import assert from "node:assert/strict";
import test from "node:test";
import { ClaimLatch } from "../src/gate.js";
import {
  ClaimLatchBlockedError,
  createGuardedAnswerFetchHandler,
  createGuardedAnswerServer,
  verifyBeforeRelease,
} from "../src/integrations.js";
import type { ClaimExtractor, ClaimVerifier, EvidenceProvider } from "../src/types.js";

function fixtureGate(): ClaimLatch {
  const extractor: ClaimExtractor = {
    async extract({ answer }) {
      return [{ id: "claim_1", text: answer, kind: "fact", importance: "critical" }];
    },
  };
  const evidenceProvider: EvidenceProvider = {
    async search(claim) {
      return [{
        id: "e1",
        claimId: claim.id,
        title: "fixture",
        url: "https://example.test/source",
        snippet: claim.text,
        sourceType: "primary",
        retrievedAt: "2026-09-29T00:00:00.000Z",
        provider: "fixture",
      }];
    },
  };
  const verifier: ClaimVerifier = {
    async verify({ claim, evidence }) {
      const status = claim.text.includes("blocked") ? "CONTRADICTED" as const : "SUPPORTED" as const;
      return { claim, status, reason: "fixture", evidenceIds: ["e1"], evidence };
    },
  };
  return new ClaimLatch({ extractor, evidenceProvider, verifier });
}

test("verifyBeforeRelease returns the draft only after PASS", async () => {
  const result = await verifyBeforeRelease(fixtureGate(), {
    question: "question",
    answer: "supported draft",
  });

  assert.equal(result.answer, "supported draft");
  assert.equal(result.report.passed, true);
});

test("verifyBeforeRelease throws a report-bearing error on BLOCK", async () => {
  let caught: unknown;
  try {
    await verifyBeforeRelease(fixtureGate(), {
      question: "question",
      answer: "blocked draft",
    });
  } catch (error) {
    caught = error;
  }

  assert.ok(caught instanceof ClaimLatchBlockedError);
  assert.equal((caught as ClaimLatchBlockedError).report.passed, false);
  assert.equal((caught as ClaimLatchBlockedError).report.violations[0]?.code, "CONTRADICTION");
});

async function withGuardedAnswerServer(
  run: (url: string) => Promise<void>,
  gate: ClaimLatch = fixtureGate(),
): Promise<void> {
  const service = createGuardedAnswerServer({ gate });
  await service.listen(0, "127.0.0.1");
  const address = service.server.address();
  if (!address || typeof address === "string") throw new Error("missing guarded answer address");
  try {
    await run(`http://127.0.0.1:${address.port}`);
  } finally {
    await service.close();
  }
}

test("guarded answer HTTP integration releases only verified answers", async () => {
  await withGuardedAnswerServer(async (url) => {
    const health = await fetch(`${url}/health`);
    assert.equal(health.status, 200);

    const response = await fetch(`${url}/answer`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ question: "question", draft: "supported draft" }),
    });
    assert.equal(response.status, 200);
    const body = await response.json() as { answer?: string; report?: { passed?: boolean } };
    assert.equal(body.answer, "supported draft");
    assert.equal(body.report?.passed, true);
  });
});

test("guarded answer HTTP integration returns a report-bearing BLOCK", async () => {
  await withGuardedAnswerServer(async (url) => {
    const response = await fetch(`${url}/answer`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ question: "question", draft: "blocked draft" }),
    });
    assert.equal(response.status, 422);
    const body = await response.json() as { answer?: string; error?: { code?: string; report?: { passed?: boolean } } };
    assert.equal(body.answer, undefined);
    assert.equal(body.error?.code, "claimlatch_blocked");
    assert.equal(body.error?.report?.passed, false);
  });
});

test("guarded answer HTTP integration rejects malformed requests", async () => {
  await withGuardedAnswerServer(async (url) => {
    const response = await fetch(`${url}/answer`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ question: "question" }),
    });
    assert.equal(response.status, 400);
    const body = await response.json() as { error?: { code?: string } };
    assert.equal(body.error?.code, "invalid_request_error");
  });
});

test("guarded answer HTTP integration fails closed when verification throws", async () => {
  const failingGate = new ClaimLatch({
    extractor: {
      async extract() {
        throw new Error("fixture verifier failure");
      },
    },
    evidenceProvider: {
      async search() {
        return [];
      },
    },
    verifier: {
      async verify() {
        throw new Error("fixture verifier failure");
      },
    },
  });
  await withGuardedAnswerServer(async (url) => {
    const response = await fetch(`${url}/answer`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ question: "question", draft: "supported draft" }),
    });
    assert.equal(response.status, 502);
    const body = await response.json() as { answer?: string; error?: { code?: string } };
    assert.equal(body.answer, undefined);
    assert.equal(body.error?.code, "claimlatch_verification_error");
  }, failingGate);
});

test("guarded answer Fetch integration releases only verified answers", async () => {
  const handler = createGuardedAnswerFetchHandler({ gate: fixtureGate() });

  const health = await handler(new Request("https://example.test/health"));
  assert.equal(health.status, 200);

  const passed = await handler(new Request("https://example.test/answer", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ question: "question", draft: "supported draft" }),
  }));
  assert.equal(passed.status, 200);
  const passedBody = await passed.json() as { answer?: string; report?: { passed?: boolean } };
  assert.equal(passedBody.answer, "supported draft");
  assert.equal(passedBody.report?.passed, true);

  const blocked = await handler(new Request("https://example.test/answer", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ question: "question", draft: "blocked draft" }),
  }));
  assert.equal(blocked.status, 422);
  const blockedBody = await blocked.json() as { answer?: string; error?: { code?: string; report?: { passed?: boolean } } };
  assert.equal(blockedBody.answer, undefined);
  assert.equal(blockedBody.error?.code, "claimlatch_blocked");
  assert.equal(blockedBody.error?.report?.passed, false);
});

test("guarded answer Fetch integration fails closed for malformed and oversized requests", async () => {
  const handler = createGuardedAnswerFetchHandler({ gate: fixtureGate(), maxRequestBytes: 1_024 });

  const malformed = await handler(new Request("https://example.test/answer", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "not-json",
  }));
  assert.equal(malformed.status, 400);
  const malformedBody = await malformed.json() as { error?: { code?: string } };
  assert.equal(malformedBody.error?.code, "invalid_json");

  const oversized = await handler(new Request("https://example.test/answer", {
    method: "POST",
    body: JSON.stringify({ question: "question", draft: "x".repeat(2_000) }),
  }));
  assert.equal(oversized.status, 413);
  const oversizedBody = await oversized.json() as { error?: { code?: string } };
  assert.equal(oversizedBody.error?.code, "request_too_large");
});

test("guarded answer Fetch integration fails closed when verification throws", async () => {
  const failingGate = new ClaimLatch({
    extractor: {
      async extract() {
        throw new Error("fixture verifier failure");
      },
    },
    evidenceProvider: {
      async search() {
        return [];
      },
    },
    verifier: {
      async verify() {
        throw new Error("fixture verifier failure");
      },
    },
  });
  const handler = createGuardedAnswerFetchHandler({ gate: failingGate });
  const response = await handler(new Request("https://example.test/answer", {
    method: "POST",
    body: JSON.stringify({ question: "question", draft: "supported draft" }),
  }));

  assert.equal(response.status, 502);
  const body = await response.json() as { answer?: string; error?: { code?: string } };
  assert.equal(body.answer, undefined);
  assert.equal(body.error?.code, "claimlatch_verification_error");
});

test("guarded answer Fetch integration supports framework-specific route paths", async () => {
  const handler = createGuardedAnswerFetchHandler({
    gate: fixtureGate(),
    healthPath: "/status",
    answerPath: "/api/answer",
  });

  const health = await handler(new Request("https://example.test/status"));
  assert.equal(health.status, 200);

  const passed = await handler(new Request("https://example.test/api/answer", {
    method: "POST",
    body: JSON.stringify({ question: "question", draft: "supported draft" }),
  }));
  assert.equal(passed.status, 200);

  const defaultRoute = await handler(new Request("https://example.test/answer", {
    method: "POST",
    body: JSON.stringify({ question: "question", draft: "supported draft" }),
  }));
  assert.equal(defaultRoute.status, 404);

  const service = createGuardedAnswerServer({
    gate: fixtureGate(),
    healthPath: "/status",
    answerPath: "/api/answer",
  });
  await service.listen(0, "127.0.0.1");
  const address = service.server.address();
  if (!address || typeof address === "string") throw new Error("missing custom route address");
  try {
    const serverHealth = await fetch(`http://127.0.0.1:${address.port}/status`);
    assert.equal(serverHealth.status, 200);
    const serverAnswer = await fetch(`http://127.0.0.1:${address.port}/api/answer`, {
      method: "POST",
      body: JSON.stringify({ question: "question", draft: "supported draft" }),
    });
    assert.equal(serverAnswer.status, 200);
  } finally {
    await service.close();
  }
});

test("guarded answer integration rejects unsafe custom route paths", () => {
  assert.throws(
    () => createGuardedAnswerFetchHandler({ gate: fixtureGate(), answerPath: "https://evil.example/answer" }),
    /answerPath must be an absolute path/,
  );
  assert.throws(
    () => createGuardedAnswerFetchHandler({ gate: fixtureGate(), healthPath: "/health?full=1" }),
    /healthPath must be an absolute path/,
  );
});
