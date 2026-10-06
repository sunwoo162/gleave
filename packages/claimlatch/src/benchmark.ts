import { createHash } from "node:crypto";
import type { ClaimLatch } from "./gate.js";
import type { VerificationReport } from "./types.js";

export interface BenchmarkCase {
  id: string;
  question: string;
  answer: string;
  expectedPassed: boolean;
  sourceLine?: number;
  labelSourceUrls?: string[];
  note?: string;
}

export interface BenchmarkCaseResult {
  id: string;
  expectedPassed: boolean;
  actualPassed: boolean;
  labelSourceUrls?: string[];
  note?: string;
  sourceLine?: number;
  correct: boolean;
  falsePass: boolean;
  falseBlock: boolean;
  report: VerificationReport;
}

export interface BenchmarkReport {
  total: number;
  correct: number;
  decisionAccuracy: number;
  averageCoverage: number;
  negativeCases: number;
  positiveCases: number;
  falsePasses: number;
  falseBlocks: number;
  falsePassRate: number;
  falseBlockRate: number;
  cases: BenchmarkCaseResult[];
}

export interface BenchmarkManifestEntry {
  sha256: string;
  cases: number;
}

export interface BenchmarkManifest {
  version: 1;
  files: Record<string, BenchmarkManifestEntry>;
}

export interface BenchmarkManifestSource {
  fileName: string;
  content: string;
  caseCount: number;
}

export function createBenchmarkManifest(
  sources: readonly BenchmarkManifestSource[],
): BenchmarkManifest {
  if (sources.length === 0) throw new Error("Benchmark manifest sources cannot be empty.");

  const files: Record<string, BenchmarkManifestEntry> = {};
  for (const source of [...sources].sort((left, right) => left.fileName.localeCompare(right.fileName))) {
    if (!/^[a-z\d][a-z\d._-]*\.jsonl$/iu.test(source.fileName)) {
      throw new Error(`Benchmark manifest file name is unsafe: ${source.fileName}`);
    }
    if (files[source.fileName]) {
      throw new Error(`Duplicate benchmark manifest file: ${source.fileName}`);
    }
    if (!Number.isInteger(source.caseCount) || source.caseCount <= 0) {
      throw new Error(`Benchmark manifest case count is invalid: ${source.fileName}`);
    }
    const canonical = source.content.replace(/\r\n?/gu, "\n");
    files[source.fileName] = {
      sha256: createHash("sha256").update(canonical).digest("hex"),
      cases: source.caseCount,
    };
  }

  return { version: 1, files };
}

export async function runBenchmark(gate: ClaimLatch, cases: readonly BenchmarkCase[]): Promise<BenchmarkReport> {
  const results: BenchmarkCaseResult[] = [];

  for (const benchmarkCase of cases) {
    const report = await gate.verify({
      question: benchmarkCase.question,
      answer: benchmarkCase.answer,
    });
    const falsePass = !benchmarkCase.expectedPassed && report.passed;
    const falseBlock = benchmarkCase.expectedPassed && !report.passed;
    results.push({
      id: benchmarkCase.id,
      expectedPassed: benchmarkCase.expectedPassed,
      actualPassed: report.passed,
      ...(benchmarkCase.labelSourceUrls ? { labelSourceUrls: benchmarkCase.labelSourceUrls } : {}),
      ...(benchmarkCase.note ? { note: benchmarkCase.note } : {}),
      ...(benchmarkCase.sourceLine !== undefined ? { sourceLine: benchmarkCase.sourceLine } : {}),
      correct: benchmarkCase.expectedPassed === report.passed,
      falsePass,
      falseBlock,
      report,
    });
  }

  const correct = results.filter((item) => item.correct).length;
  const falsePasses = results.filter((item) => item.falsePass).length;
  const falseBlocks = results.filter((item) => item.falseBlock).length;
  const totalCoverage = results.reduce((sum, item) => sum + item.report.coverage, 0);
  const negativeCases = cases.filter((item) => !item.expectedPassed).length;
  const positiveCases = cases.filter((item) => item.expectedPassed).length;

  return {
    total: results.length,
    correct,
    decisionAccuracy: ratio(correct, results.length),
    averageCoverage: ratio(totalCoverage, results.length),
    negativeCases,
    positiveCases,
    falsePasses,
    falseBlocks,
    falsePassRate: ratio(falsePasses, negativeCases),
    falseBlockRate: ratio(falseBlocks, positiveCases),
    cases: results,
  };
}

export function parseBenchmarkJsonl(input: string): BenchmarkCase[] {
  const cases: BenchmarkCase[] = [];
  const ids = new Set<string>();

  for (const [index, line] of input.split(/\r?\n/).entries()) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed);
    } catch (error) {
      throw new Error(`Invalid benchmark JSON on line ${index + 1}: ${error instanceof Error ? error.message : String(error)}`);
    }
    if (!parsed || typeof parsed !== "object") throw new Error(`Benchmark line ${index + 1} must be a JSON object.`);
    const value = parsed as Record<string, unknown>;
    if (typeof value.id !== "string" || !value.id.trim()) throw new Error(`Benchmark line ${index + 1} is missing id.`);
    if (ids.has(value.id)) throw new Error(`Duplicate benchmark id: ${value.id}`);
    if (typeof value.question !== "string" || !value.question.trim()) throw new Error(`Benchmark ${value.id} is missing question.`);
    if (typeof value.answer !== "string" || !value.answer.trim()) throw new Error(`Benchmark ${value.id} is missing answer.`);
    if (typeof value.expectedPassed !== "boolean") throw new Error(`Benchmark ${value.id} is missing expectedPassed boolean.`);

    let labelSourceUrls: string[] | undefined;
    if (value.labelSourceUrls !== undefined) {
      if (
        !Array.isArray(value.labelSourceUrls)
        || value.labelSourceUrls.length === 0
        || value.labelSourceUrls.some((url) => !isHttpUrl(url))
      ) {
        throw new Error(`Benchmark ${value.id} has invalid labelSourceUrls.`);
      }
      labelSourceUrls = value.labelSourceUrls as string[];
    }

    cases.push({
      id: value.id,
      question: value.question,
      answer: value.answer,
      expectedPassed: value.expectedPassed,
      sourceLine: index + 1,
      ...(labelSourceUrls && labelSourceUrls.length > 0 ? { labelSourceUrls } : {}),
      ...(typeof value.note === "string" ? { note: value.note } : {}),
    });
    ids.add(value.id);
  }

  if (cases.length === 0) throw new Error("Benchmark dataset contains no cases.");
  return cases;
}

export function parseBenchmarkManifest(input: string): BenchmarkManifest {
  let parsed: unknown;
  try {
    parsed = JSON.parse(input);
  } catch (error) {
    throw new Error(`Invalid benchmark manifest JSON: ${error instanceof Error ? error.message : String(error)}`);
  }

  if (!parsed || typeof parsed !== "object") throw new Error("Benchmark manifest must be a JSON object.");
  const value = parsed as Record<string, unknown>;
  if (value.version !== 1) throw new Error("Benchmark manifest version must be 1.");
  if (!value.files || typeof value.files !== "object" || Array.isArray(value.files)) {
    throw new Error("Benchmark manifest files must be an object.");
  }

  const files: Record<string, BenchmarkManifestEntry> = {};
  for (const [fileName, rawEntry] of Object.entries(value.files as Record<string, unknown>)) {
    if (!/^[a-z\d][a-z\d._-]*\.jsonl$/iu.test(fileName)) {
      throw new Error(`Benchmark manifest file name is unsafe: ${fileName}`);
    }
    if (!rawEntry || typeof rawEntry !== "object" || Array.isArray(rawEntry)) {
      throw new Error(`Benchmark manifest entry is invalid: ${fileName}`);
    }
    const entry = rawEntry as Record<string, unknown>;
    if (typeof entry.sha256 !== "string" || !/^[a-f\d]{64}$/iu.test(entry.sha256)) {
      throw new Error(`Benchmark manifest SHA-256 is invalid: ${fileName}`);
    }
    if (typeof entry.cases !== "number" || !Number.isInteger(entry.cases) || entry.cases <= 0) {
      throw new Error(`Benchmark manifest case count is invalid: ${fileName}`);
    }
    files[fileName] = { sha256: entry.sha256.toLowerCase(), cases: entry.cases };
  }

  if (Object.keys(files).length === 0) throw new Error("Benchmark manifest contains no files.");
  return { version: 1, files };
}

export function verifyBenchmarkManifestEntry(
  manifest: BenchmarkManifest,
  fileName: string,
  content: string,
  caseCount: number,
): void {
  const expected = manifest.files[fileName];
  if (!expected) throw new Error(`Benchmark manifest does not list ${fileName}.`);

  const canonical = content.replace(/\r\n?/gu, "\n");
  const actualHash = createHash("sha256").update(canonical).digest("hex");
  if (actualHash !== expected.sha256) {
    throw new Error(`Benchmark manifest SHA-256 mismatch for ${fileName}.`);
  }
  if (caseCount !== expected.cases) {
    throw new Error(`Benchmark manifest case count mismatch for ${fileName}.`);
  }
}

function ratio(numerator: number, denominator: number): number {
  return denominator === 0 ? 0 : numerator / denominator;
}

function isHttpUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    const parsed = new URL(value);
    return (parsed.protocol === "http:" || parsed.protocol === "https:") && parsed.hostname.length > 0;
  } catch {
    return false;
  }
}
