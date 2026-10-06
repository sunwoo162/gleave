import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import test from "node:test";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createSignedVerificationReceipt,
  FileVerificationReceiptStore,
  hashVerificationReceiptPayload,
  verifySignedVerificationReceipt,
} from "../src/receipt.js";
import type { ClaimVerification, VerificationReport } from "../src/types.js";

const privateKeyPem = `-----BEGIN PRIVATE KEY-----
MC4CAQAwBQYDK2VwBCIEIA5o+kxfZLkCkVmfck+DWeQHUPJMmhrVvy3bMY5B4yce
-----END PRIVATE KEY-----
`;

const publicKeyPem = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEAWSzOdmFYovKtzfdtxzINGW47WXaWju7Jsp08Avj7Gyo=
-----END PUBLIC KEY-----
`;

const report: VerificationReport = {
  passed: true,
  coverage: 1,
  counts: { total: 1, supported: 1, contradicted: 0, unsupported: 0, unverifiable: 0 },
  claims: [],
  violations: [],
  generatedAt: "2026-09-29T00:00:00.000Z",
};

const confidenceBearingClaim: ClaimVerification = {
  claim: {
    id: "claim-1",
    text: "The fixture claim is supported.",
    kind: "fact",
    importance: "normal",
  },
  status: "SUPPORTED",
  reason: "Fixture evidence supports the claim.",
  evidenceIds: ["evidence-1"],
  evidence: [],
  confidence: {
    value: 0.875,
    meaning: "verification-status-correctness",
    scorerId: "fixture-scorer-v1",
    calibrationProfileId: "fixture-profile-v1",
  },
};

const confidenceBearingReport: VerificationReport = {
  ...report,
  claims: [confidenceBearingClaim],
};

test("signed verification receipts are deterministic and verifiable", () => {
  const first = createSignedVerificationReceipt(report, { privateKeyPem, publicKeyPem, keyId: "fixture-key" });
  const second = createSignedVerificationReceipt(report, { privateKeyPem, publicKeyPem, keyId: "fixture-key" });

  assert.deepEqual(first, second);
  assert.equal(first.version, 1);
  assert.equal(first.algorithm, "Ed25519");
  assert.equal(first.payload.keyId, "fixture-key");
  assert.equal(verifySignedVerificationReceipt(first), true);
  const firstHash = hashVerificationReceiptPayload(first.payload);
  const secondHash = hashVerificationReceiptPayload(second.payload);
  assert.equal(firstHash, secondHash);
  assert.match(firstHash, /^[0-9a-f]{64}$/u);
});

test("signed receipts cover optional confidence values", () => {
  const receipt = createSignedVerificationReceipt(confidenceBearingReport, { privateKeyPem, publicKeyPem });

  assert.deepEqual(receipt.payload.report.claims[0]?.confidence, confidenceBearingClaim.confidence);
  assert.equal(verifySignedVerificationReceipt(receipt), true);
});

test("legacy reports without confidence remain valid", () => {
  const receipt = createSignedVerificationReceipt(report, { privateKeyPem, publicKeyPem });

  assert.equal(receipt.payload.report.claims.length, 0);
  assert.equal(verifySignedVerificationReceipt(receipt), true);
});

test("signed verification receipt creation rejects empty key IDs", () => {
  assert.throws(
    () => createSignedVerificationReceipt(report, { privateKeyPem, publicKeyPem, keyId: "   " }),
    /keyId must be a non-empty string/,
  );
});

test("receipt verification fails when the report is tampered with", () => {
  const receipt = createSignedVerificationReceipt(report, { privateKeyPem, publicKeyPem });
  const tampered = {
    ...receipt,
    payload: {
      ...receipt.payload,
      report: { ...receipt.payload.report, passed: false },
    },
  };

  assert.equal(verifySignedVerificationReceipt(tampered), false);
});

test("receipt verification fails when confidence is removed or changed", () => {
  const receipt = createSignedVerificationReceipt(confidenceBearingReport, { privateKeyPem, publicKeyPem });
  const claim = confidenceBearingClaim;

  const removed = {
    ...receipt,
    payload: {
      ...receipt.payload,
      report: {
        ...receipt.payload.report,
        claims: [{ ...claim, confidence: undefined }],
      },
    },
  } as unknown as typeof receipt;
  const changed = {
    ...receipt,
    payload: {
      ...receipt.payload,
      report: {
        ...receipt.payload.report,
        claims: [{ ...claim, confidence: { ...claim.confidence!, value: 0.1 } }],
      },
    },
  } as typeof receipt;

  assert.equal(verifySignedVerificationReceipt(removed), false);
  assert.equal(verifySignedVerificationReceipt(changed), false);
});

test("receipt verification rejects malformed confidence provenance", () => {
  const malformed = createSignedVerificationReceipt(
    {
      ...confidenceBearingReport,
      claims: [{
        ...confidenceBearingClaim,
        confidence: {
          ...confidenceBearingClaim.confidence!,
          value: 1.1,
        },
      }],
    } as unknown as VerificationReport,
    { privateKeyPem, publicKeyPem },
  );

  assert.equal(verifySignedVerificationReceipt(malformed), false);
});

test("receipt verification fails for a signed report with an invalid shape", () => {
  const malformedReceipt = createSignedVerificationReceipt(
    { ...report, counts: undefined } as unknown as VerificationReport,
    { privateKeyPem, publicKeyPem },
  );

  assert.equal(verifySignedVerificationReceipt(malformedReceipt), false);
});

test("receipt verification fails for malformed claim or violation entries", () => {
  const malformedClaimReceipt = createSignedVerificationReceipt(
    { ...report, claims: [{ status: "SUPPORTED" }] } as unknown as VerificationReport,
    { privateKeyPem, publicKeyPem },
  );
  const malformedViolationReceipt = createSignedVerificationReceipt(
    { ...report, violations: [{ code: "CONTRADICTION" }] } as unknown as VerificationReport,
    { privateKeyPem, publicKeyPem },
  );

  assert.equal(verifySignedVerificationReceipt(malformedClaimReceipt), false);
  assert.equal(verifySignedVerificationReceipt(malformedViolationReceipt), false);
});

test("receipt verification fails for a different public key or invalid signature", () => {
  const receipt = createSignedVerificationReceipt(report, { privateKeyPem, publicKeyPem });
  const otherKey = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEAMAv2OQLdt6DNpnq/zf54mdeV98ZScwOYfIDXKRLU6/0=
-----END PUBLIC KEY-----
`;

  assert.equal(verifySignedVerificationReceipt(receipt, { publicKeyPem: otherKey }), false);
  assert.equal(verifySignedVerificationReceipt({ ...receipt, signature: "invalid" }), false);
  assert.equal(verifySignedVerificationReceipt(null as unknown as typeof receipt), false);
});

test("file receipt store persists receipts and rejects unsafe IDs", async () => {
  const directory = await mkdtemp(join(tmpdir(), "claimlatch-receipts-"));
  try {
    const store = new FileVerificationReceiptStore({ directory });
    const receipt = createSignedVerificationReceipt(report, { privateKeyPem, publicKeyPem, keyId: "fixture-key" });

    await store.save("receipt-001", receipt);
    await store.save("receipt-001", receipt);
    assert.deepEqual(await store.load("receipt-001"), receipt);
    assert.equal(await store.load("missing"), undefined);
    await assert.rejects(store.save("malformed", {} as typeof receipt), /Invalid signed verification receipt/);
    await assert.rejects(store.save("../escape", receipt), /Receipt ID/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("file receipt store rejects malformed receipt key metadata", async () => {
  const directory = await mkdtemp(join(tmpdir(), "claimlatch-receipts-"));
  try {
    const store = new FileVerificationReceiptStore({ directory });
    const receipt = createSignedVerificationReceipt(report, { privateKeyPem, publicKeyPem });

    await assert.rejects(
      store.save("empty-signature", { ...receipt, signature: "" }),
      /Invalid signed verification receipt/,
    );
    await assert.rejects(
      store.save("empty-public-key", {
        ...receipt,
        payload: { ...receipt.payload, publicKeyPem: "" },
      }),
      /Invalid signed verification receipt/,
    );
    await assert.rejects(
      store.save("invalid-key-id", {
        ...receipt,
        payload: { ...receipt.payload, keyId: 123 as unknown as string },
      }),
      /Invalid signed verification receipt/,
    );
    await assert.rejects(
      store.save("empty-key-id", {
        ...receipt,
        payload: { ...receipt.payload, keyId: "   " },
      }),
      /Invalid signed verification receipt/,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("receipt key resolver supports rotation by key ID and fails closed for unknown keys", () => {
  const receipt = createSignedVerificationReceipt(report, { privateKeyPem, publicKeyPem, keyId: "old-key" });

  assert.equal(
    verifySignedVerificationReceipt(receipt, { keyResolver: (keyId) => keyId === "old-key" ? publicKeyPem : undefined }),
    true,
  );
  assert.equal(
    verifySignedVerificationReceipt(receipt, { keyResolver: () => undefined }),
    false,
  );
});
