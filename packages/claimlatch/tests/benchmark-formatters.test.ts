import assert from "node:assert/strict";
import test from "node:test";
import { formatBenchmarkReport, resolveBenchmarkOutputFormat } from "../src/benchmark-formatters.js";
import { ClaimLatch } from "../src/gate.js";
import type { ClaimExtractor, ClaimVerifier, EvidenceProvider } from "../src/types.js";
import { runBenchmark } from "../src/benchmark.js";

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
      retrievedAt: "2026-09-28T00:00:00.000Z",
      provider: "fixture",
    }];
  },
};

const verifier: ClaimVerifier = {
  async verify({ claim, evidence }) {
    const status = claim.text === "true" ? "SUPPORTED" as const : "CONTRADICTED" as const;
    return { claim, status, reason: "fixture", evidenceIds: ["e1"], evidence };
  },
};

async function createReport() {
  const gate = new ClaimLatch({ extractor, evidenceProvider, verifier });
  return runBenchmark(gate, [
    { id: "passing&case", question: "q", answer: "true", expectedPassed: true },
    { id: "blocked<case>", question: "q", answer: "false", expectedPassed: true },
    {
      id: "false-pass",
      question: "q",
      answer: "true",
      expectedPassed: false,
      labelSourceUrls: ["https://example.test/label"],
      note: "Independent label.",
    },
  ]);
}

test("JUnit formatter escapes XML and records incorrect cases as failures", async () => {
  const output = formatBenchmarkReport(await createReport(), "junit");

  assert.match(output, /^<\?xml version="1\.0" encoding="UTF-8"\?>\n/);
  assert.match(output, /<testsuite name="ClaimLatch benchmark" tests="3" failures="2" errors="0" skipped="0" time="0">/);
  assert.match(output, /<property name="averageCoverage" value="1\.000000"\/>/);
  assert.match(output, /<property name="falsePassRate" value="1\.000000"\/>/);
  assert.match(output, /<testcase name="passing&amp;case" classname="ClaimLatch benchmark"\/>/);
  assert.match(output, /<testcase name="blocked&lt;case&gt;" classname="ClaimLatch benchmark">/);
  assert.match(output, /<failure message="expected PASS, actual BLOCK">expected PASS, actual BLOCK<\/failure>/);
  assert.match(output, /<testcase name="false-pass" classname="ClaimLatch benchmark">/);
  assert.match(output, /<properties>\n\s+<property name="labelSourceUrls" value="https:\/\/example\.test\/label"\/>\n\s+<property name="note" value="Independent label\."\/>\n\s+<\/properties>/);
  assert.match(output, /expected BLOCK, actual PASS/);
});

test("SARIF formatter emits only incorrect benchmark cases with deterministic locations", async () => {
  const output = formatBenchmarkReport(await createReport(), "sarif", {
    artifactUri: "benchmarks/independent.jsonl",
  });
  const sarif = JSON.parse(output) as {
    version: string;
    runs: Array<{
      tool: { driver: { name: string; rules: Array<{ id: string }> } };
      properties: {
        decisionAccuracy: number;
        averageCoverage: number;
        falsePassRate: number;
        falseBlockRate: number;
      };
      results: Array<{
        ruleId: string;
        level: string;
        message: { text: string };
        locations: Array<{ physicalLocation: { artifactLocation: { uri: string }; region: { startLine: number } } }>;
        properties: {
          benchmarkId: string;
          expectedPassed: boolean;
          actualPassed: boolean;
          labelSourceUrls?: string[];
          note?: string;
        };
      }>;
    }>;
  };

  assert.equal(sarif.version, "2.1.0");
  assert.equal(sarif.runs.length, 1);
  assert.equal(sarif.runs[0]?.tool.driver.name, "ClaimLatch");
  assert.deepEqual(sarif.runs[0]?.properties, {
    decisionAccuracy: 1 / 3,
    averageCoverage: 1,
    falsePassRate: 1,
    falseBlockRate: 0.5,
  });
  assert.deepEqual(sarif.runs[0]?.tool.driver.rules.map((rule) => rule.id), ["FALSE_PASS", "FALSE_BLOCK"]);
  assert.equal(sarif.runs[0]?.results.length, 2);
  assert.deepEqual(sarif.runs[0]?.results.map((result) => result.ruleId), ["FALSE_BLOCK", "FALSE_PASS"]);
  assert.equal(sarif.runs[0]?.results[0]?.level, "error");
  assert.equal(sarif.runs[0]?.results[0]?.message.text, "Benchmark expected PASS but gate returned BLOCK.");
  assert.equal(sarif.runs[0]?.results[0]?.locations[0]?.physicalLocation.artifactLocation.uri, "benchmarks/independent.jsonl");
  assert.equal(sarif.runs[0]?.results[0]?.locations[0]?.physicalLocation.region.startLine, 2);
  assert.deepEqual(sarif.runs[0]?.results[1]?.properties, {
    benchmarkId: "false-pass",
    expectedPassed: false,
    actualPassed: true,
    labelSourceUrls: ["https://example.test/label"],
    note: "Independent label.",
  });
});

test("benchmark formatter preserves text and JSON output modes", async () => {
  const report = await createReport();
  const text = formatBenchmarkReport(report, "text");
  const json = formatBenchmarkReport(report, "json");

  assert.match(text, /^ClaimLatch benchmark\n/);
  assert.match(text, /Average coverage\s+100\.0%/);
  assert.deepEqual(JSON.parse(json), report);
});

test("benchmark output format parser preserves --json compatibility and rejects conflicts", () => {
  assert.equal(resolveBenchmarkOutputFormat([]), "text");
  assert.equal(resolveBenchmarkOutputFormat(["--json"]), "json");
  assert.equal(resolveBenchmarkOutputFormat(["--format", "junit"]), "junit");
  assert.equal(resolveBenchmarkOutputFormat(["--format=sarif"]), "sarif");
  assert.throws(() => resolveBenchmarkOutputFormat(["--json", "--format", "sarif"]), /cannot be combined/);
  assert.throws(
    () => resolveBenchmarkOutputFormat(["--format", "json", "--format=text"]),
    /--format may only be specified once/,
  );
  assert.throws(() => resolveBenchmarkOutputFormat(["--format", "yaml"]), /Unsupported benchmark format/);
});
