import assert from "node:assert/strict";
import test from "node:test";
import { parseReceiptCliArguments, renderReceiptHelp } from "../src/receipt-cli-options.js";
import { renderReceiptVerificationJson } from "../src/receipt-cli-output.js";

test("receipt CLI help documents verification command and fail-closed exit codes", () => {
  const help = renderReceiptHelp();

  assert.match(help, /Usage:\s+claimlatch-receipt verify/);
  assert.match(help, /--file <path>/);
  assert.match(help, /--public-key-file <path>/);
  assert.match(help, /--json/);
  assert.match(help, /0\s+Receipt signature is valid/);
  assert.match(help, /1\s+Receipt is invalid/);
  assert.match(help, /2\s+Usage or file error/);
});

test("receipt CLI argument parser rejects unknown options", () => {
  assert.throws(
    () => parseReceiptCliArguments(["verify", "--file", "receipt.json", "--unexpected"]),
    /Unknown option: --unexpected/,
  );
});

test("receipt CLI argument parser rejects duplicate value options", () => {
  assert.throws(
    () => parseReceiptCliArguments([
      "verify",
      "--file", "first.json",
      "--file", "second.json",
    ]),
    /--file may only be specified once/,
  );
  assert.throws(
    () => parseReceiptCliArguments([
      "verify",
      "--file", "receipt.json",
      "--public-key-file", "first.pem",
      "--public-key-file", "second.pem",
    ]),
    /--public-key-file may only be specified once/,
  );
});

test("receipt CLI JSON output exposes signed receipt metadata for audit logs", () => {
  const output = renderReceiptVerificationJson({
    valid: true,
    filePath: "receipts/answer-001.json",
    publicKeyPath: "keys/current.pem",
    payloadSha256: "a".repeat(64),
    receipt: {
      version: 1,
      algorithm: "Ed25519",
      payload: {
        keyId: "key-2026-09",
      },
    },
  });

  assert.deepEqual(JSON.parse(output), {
    valid: true,
    file: "receipts/answer-001.json",
    version: 1,
    algorithm: "Ed25519",
    keyId: "key-2026-09",
    publicKeyFile: "keys/current.pem",
    payloadSha256: "a".repeat(64),
  });
});

test("receipt CLI JSON output omits untrusted metadata with an invalid receipt shape", () => {
  const output = renderReceiptVerificationJson({
    valid: false,
    filePath: "receipts/invalid.json",
    receipt: { version: 2, algorithm: "unknown", payload: { keyId: 123 } },
  });

  assert.deepEqual(JSON.parse(output), {
    valid: false,
    file: "receipts/invalid.json",
  });
});

test("receipt CLI JSON output includes the signed decision only after verification succeeds", () => {
  const validOutput = renderReceiptVerificationJson({
    valid: true,
    filePath: "receipts/blocked.json",
    receipt: {
      version: 1,
      algorithm: "Ed25519",
      payload: {
        report: { passed: false, generatedAt: "2026-09-30T00:00:00.000Z" },
      },
    },
  });
  assert.deepEqual(JSON.parse(validOutput), {
    valid: true,
    file: "receipts/blocked.json",
    version: 1,
    algorithm: "Ed25519",
    decision: "BLOCK",
    generatedAt: "2026-09-30T00:00:00.000Z",
  });

  const invalidOutput = renderReceiptVerificationJson({
    valid: false,
    filePath: "receipts/tampered.json",
    payloadSha256: "b".repeat(64),
    receipt: {
      version: 1,
      algorithm: "Ed25519",
      payload: {
        report: { passed: true, generatedAt: "2026-09-30T00:00:00.000Z" },
      },
    },
  });
  assert.deepEqual(JSON.parse(invalidOutput), {
    valid: false,
    file: "receipts/tampered.json",
    version: 1,
    algorithm: "Ed25519",
  });
});

test("receipt CLI JSON output includes the verified report summary only for valid receipts", () => {
  const validOutput = renderReceiptVerificationJson({
    valid: true,
    filePath: "receipts/summary.json",
    receipt: {
      version: 1,
      algorithm: "Ed25519",
      payload: {
        report: {
          coverage: 0.75,
          counts: { total: 4, supported: 3, contradicted: 1, unsupported: 0, unverifiable: 0 },
        },
      },
    },
  });
  assert.deepEqual(JSON.parse(validOutput), {
    valid: true,
    file: "receipts/summary.json",
    version: 1,
    algorithm: "Ed25519",
    coverage: 0.75,
    counts: { total: 4, supported: 3, contradicted: 1, unsupported: 0, unverifiable: 0 },
  });

  const invalidOutput = renderReceiptVerificationJson({
    valid: false,
    filePath: "receipts/tampered-summary.json",
    receipt: {
      version: 1,
      algorithm: "Ed25519",
      payload: {
        report: {
          coverage: 1,
          counts: { total: 1, supported: 1, contradicted: 0, unsupported: 0, unverifiable: 0 },
        },
      },
    },
  });
  assert.deepEqual(JSON.parse(invalidOutput), {
    valid: false,
    file: "receipts/tampered-summary.json",
    version: 1,
    algorithm: "Ed25519",
  });

  const malformedSummaryOutput = renderReceiptVerificationJson({
    valid: true,
    filePath: "receipts/malformed-summary.json",
    receipt: {
      version: 1,
      algorithm: "Ed25519",
      payload: {
        report: {
          coverage: 2,
          counts: { total: "4", supported: 3, contradicted: 1, unsupported: 0, unverifiable: 0 },
        },
      },
    },
  });
  assert.deepEqual(JSON.parse(malformedSummaryOutput), {
    valid: true,
    file: "receipts/malformed-summary.json",
    version: 1,
    algorithm: "Ed25519",
  });
});
