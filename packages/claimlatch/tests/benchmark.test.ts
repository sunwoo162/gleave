import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  createBenchmarkManifest,
  parseBenchmarkJsonl,
  parseBenchmarkManifest,
  runBenchmark,
  verifyBenchmarkManifestEntry,
} from "../src/benchmark.js";
import {
  parseBenchmarkSplit,
  renderBenchmarkHelp,
  renderBenchmarkValidation,
  resolveBenchmarkDatasetPath,
  resolveBenchmarkDatasetSelection,
} from "../src/benchmark-cli-options.js";
import { ClaimLatch } from "../src/gate.js";
import type { ClaimExtractor, ClaimVerifier, EvidenceProvider } from "../src/types.js";

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

test("benchmark reports false-pass and false-block rates against independent labels", async () => {
  const gate = new ClaimLatch({ extractor, evidenceProvider, verifier });
  const report = await runBenchmark(gate, [
    { id: "positive", question: "q", answer: "true", expectedPassed: true },
    { id: "negative", question: "q", answer: "false", expectedPassed: false },
  ]);

  assert.equal(report.decisionAccuracy, 1);
  assert.equal(report.averageCoverage, 1);
  assert.equal(report.falsePassRate, 0);
  assert.equal(report.falseBlockRate, 0);
});

test("benchmark averages per-case coverage separately from decision accuracy", async () => {
  const coverageVerifier: ClaimVerifier = {
    async verify({ claim, evidence }) {
      const status = claim.text === "covered" ? "SUPPORTED" as const : "UNSUPPORTED" as const;
      return { claim, status, reason: "fixture", evidenceIds: ["e1"], evidence };
    },
  };
  const gate = new ClaimLatch({ extractor, evidenceProvider, verifier: coverageVerifier });
  const report = await runBenchmark(gate, [
    { id: "covered", question: "q", answer: "covered", expectedPassed: true },
    { id: "uncovered", question: "q", answer: "uncovered", expectedPassed: false },
  ]);

  assert.equal(report.decisionAccuracy, 1);
  assert.equal(report.averageCoverage, 0.5);
});

test("benchmark results preserve label provenance metadata", async () => {
  const gate = new ClaimLatch({ extractor, evidenceProvider, verifier });
  const report = await runBenchmark(gate, [{
    id: "with-provenance",
    question: "q",
    answer: "true",
    expectedPassed: true,
    labelSourceUrls: ["https://example.test/label"],
    note: "Human-authored label.",
  }]);

  assert.deepEqual(report.cases[0]?.labelSourceUrls, ["https://example.test/label"]);
  assert.equal(report.cases[0]?.note, "Human-authored label.");
});

test("benchmark split options resolve frozen datasets and reject unknown values", () => {
  assert.equal(parseBenchmarkSplit("train"), "train");
  assert.equal(parseBenchmarkSplit("dev"), "dev");
  assert.equal(parseBenchmarkSplit("test"), "test");
  assert.equal(resolveBenchmarkDatasetPath("dev").pathname.endsWith("/benchmarks/dev.jsonl"), true);
  const selectedSplit = resolveBenchmarkDatasetSelection(undefined, "test");
  if (!(selectedSplit instanceof URL)) throw new Error("expected frozen split URL");
  assert.equal(selectedSplit.pathname.endsWith("/benchmarks/test.jsonl"), true);
  assert.equal(resolveBenchmarkDatasetSelection("custom.jsonl", undefined), "custom.jsonl");
  assert.throws(() => resolveBenchmarkDatasetSelection("custom.jsonl", "train"), /cannot be combined/);
  assert.throws(() => parseBenchmarkSplit("independent"), /Unsupported benchmark split/);
});

test("benchmark CLI help documents datasets, splits, manifests, and formats", () => {
  const help = renderBenchmarkHelp();

  assert.match(help, /Usage:\s+claimlatch-bench/);
  assert.match(help, /--dataset <path>/);
  assert.match(help, /--split <train\|dev\|test>/);
  assert.match(help, /--manifest <path>/);
  assert.match(help, /--format <text\|json\|junit\|sarif>/);
  assert.match(help, /default is the 200-case independent\.jsonl aggregate/);
});

test("benchmark validation output is credential-free and deterministic", () => {
  const text = renderBenchmarkValidation({
    dataset: "benchmarks/test.jsonl",
    cases: 10,
    manifest: "benchmarks/MANIFEST.json",
  }, "text");
  assert.match(text, /Dataset valid/);
  assert.match(text, /benchmarks\/test\.jsonl/);
  assert.match(text, /Cases\s+10/);
  assert.match(text, /Manifest verified/);

  const json = JSON.parse(renderBenchmarkValidation({
    dataset: "benchmarks/test.jsonl",
    cases: 10,
    manifest: "benchmarks/MANIFEST.json",
  }, "json")) as { valid?: boolean; cases?: number };
  assert.equal(json.valid, true);
  assert.equal(json.cases, 10);
});

test("benchmark JSONL parser rejects duplicate IDs", () => {
  assert.throws(() => parseBenchmarkJsonl([
    JSON.stringify({ id: "same", question: "q", answer: "a", expectedPassed: true }),
    JSON.stringify({ id: "same", question: "q2", answer: "a2", expectedPassed: false }),
  ].join("\n")), /Duplicate benchmark id/);
});

test("benchmark JSONL parser rejects malformed label source URLs", () => {
  assert.throws(
    () => parseBenchmarkJsonl(JSON.stringify({
      id: "malformed-source",
      question: "q",
      answer: "a",
      expectedPassed: true,
      labelSourceUrls: ["ftp://example.test/source"],
    })),
    /invalid labelSourceUrls/,
  );
});

test("benchmark JSONL parser preserves source line numbers for report locations", () => {
  const cases = parseBenchmarkJsonl([
    "# benchmark fixture",
    JSON.stringify({ id: "first", question: "q", answer: "a", expectedPassed: true }),
    "",
    JSON.stringify({ id: "second", question: "q2", answer: "a2", expectedPassed: false }),
  ].join("\n"));

  assert.deepEqual(cases.map((item) => item.sourceLine), [2, 4]);
});

test("independent benchmark contains a balanced expanded label set", async () => {
  const raw = await readFile(new URL("../../benchmarks/independent.jsonl", import.meta.url), "utf8");
  const cases = parseBenchmarkJsonl(raw);
  const sourceUrls = new Set(cases.flatMap((item) => item.labelSourceUrls ?? []));

  assert.equal(cases.length, 200);
  assert.equal(cases.filter((item) => item.expectedPassed).length, 100);
  assert.equal(cases.filter((item) => !item.expectedPassed).length, 100);
  assert.ok(sourceUrls.size >= 17);
  assert.ok(cases.every((item) => (item.labelSourceUrls?.length ?? 0) > 0));
});

test("independent benchmark preserves one positive and one negative label per question", async () => {
  const raw = await readFile(new URL("../../benchmarks/independent.jsonl", import.meta.url), "utf8");
  const cases = parseBenchmarkJsonl(raw);
  const byQuestion = new Map<string, typeof cases>();

  for (const item of cases) {
    const group = byQuestion.get(item.question) ?? [];
    group.push(item);
    byQuestion.set(item.question, group);
  }

  assert.equal(byQuestion.size, 100);
  assert.ok([...byQuestion.values()].every((group) => {
    return group.length === 2 && group.filter((item) => item.expectedPassed).length === 1;
  }));
});

test("benchmark dataset is partitioned into balanced train, dev, and test splits", async () => {
  const splitNames = ["train", "dev", "test"] as const;
  const splitCases = await Promise.all(splitNames.map(async (split) => {
    const raw = await readFile(new URL(`../../benchmarks/${split}.jsonl`, import.meta.url), "utf8");
    return [split, parseBenchmarkJsonl(raw)] as const;
  }));

  const expectedCounts = [164, 24, 12];
  const allCases = splitCases.flatMap(([, cases]) => cases);
  const aggregateRaw = await readFile(new URL("../../benchmarks/independent.jsonl", import.meta.url), "utf8");
  const aggregateCases = parseBenchmarkJsonl(aggregateRaw);

  assert.deepEqual(splitCases.map(([, cases]) => cases.length), expectedCounts);
  assert.equal(new Set(allCases.map((item) => item.id)).size, 200);
  assert.deepEqual(
    new Set(allCases.map((item) => item.id)),
    new Set(aggregateCases.map((item) => item.id)),
  );
  assert.ok(splitCases.every(([, cases]) => {
    const positive = cases.filter((item) => item.expectedPassed).length;
    const negative = cases.filter((item) => !item.expectedPassed).length;
    return positive === negative;
  }));
});

test("benchmark splits keep paired questions in one partition", async () => {
  const splitNames = ["train", "dev", "test"] as const;
  const locations = new Map<string, Set<string>>();

  for (const split of splitNames) {
    const raw = await readFile(new URL(`../../benchmarks/${split}.jsonl`, import.meta.url), "utf8");
    for (const item of parseBenchmarkJsonl(raw)) {
      const splitNamesForQuestion = locations.get(item.question) ?? new Set<string>();
      splitNamesForQuestion.add(split);
      locations.set(item.question, splitNamesForQuestion);
    }
  }

  assert.equal(locations.size, 100);
  assert.ok([...locations.values()].every((splits) => splits.size === 1));
});

test("benchmark files match the committed integrity manifest", async () => {
  const manifestUrl = new URL("../../benchmarks/MANIFEST.json", import.meta.url);
  const manifest = parseBenchmarkManifest(await readFile(manifestUrl, "utf8"));

  assert.equal(manifest.version, 1);
  assert.deepEqual(Object.keys(manifest.files ?? {}).sort(), [
    "dev.jsonl",
    "independent.jsonl",
    "test.jsonl",
    "train.jsonl",
  ]);

  for (const [fileName, metadata] of Object.entries(manifest.files ?? {})) {
    const raw = await readFile(new URL(`../../benchmarks/${fileName}`, import.meta.url), "utf8");
    verifyBenchmarkManifestEntry(manifest, fileName, raw, parseBenchmarkJsonl(raw).length);
    assert.equal(createHash("sha256").update(raw.replace(/\r\n?/gu, "\n")).digest("hex"), metadata.sha256);
  }
});

test("benchmark manifest generation canonicalizes line endings and records case counts", () => {
  const content = '{"id":"one"}\r\n';
  const canonical = content.replace(/\r\n?/gu, "\n");
  const manifest = createBenchmarkManifest([{
    fileName: "dev.jsonl",
    content,
    caseCount: 1,
  }]);

  assert.deepEqual(manifest, {
    version: 1,
    files: {
      "dev.jsonl": {
        sha256: createHash("sha256").update(canonical).digest("hex"),
        cases: 1,
      },
    },
  });
});

test("benchmark manifest verification fails closed for tampered content or case counts", async () => {
  const manifest = parseBenchmarkManifest(await readFile(new URL("../../benchmarks/MANIFEST.json", import.meta.url), "utf8"));
  const raw = await readFile(new URL("../../benchmarks/dev.jsonl", import.meta.url), "utf8");

  assert.equal(verifyBenchmarkManifestEntry(manifest, "dev.jsonl", raw, 24), undefined);
  assert.throws(
    () => verifyBenchmarkManifestEntry(manifest, "dev.jsonl", `${raw}\n`, 8),
    /SHA-256 mismatch/,
  );
  assert.throws(
    () => verifyBenchmarkManifestEntry(manifest, "dev.jsonl", raw, 7),
    /case count mismatch/,
  );
});
