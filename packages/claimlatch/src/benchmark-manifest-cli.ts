#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { createBenchmarkManifest, parseBenchmarkJsonl } from "./benchmark.js";

const BENCHMARK_FILES = ["dev.jsonl", "independent.jsonl", "test.jsonl", "train.jsonl"] as const;

async function main(): Promise<void> {
  const sources = await Promise.all(BENCHMARK_FILES.map(async (fileName) => {
    const content = await readFile(new URL(`../../benchmarks/${fileName}`, import.meta.url), "utf8");
    return { fileName, content, caseCount: parseBenchmarkJsonl(content).length };
  }));
  process.stdout.write(`${JSON.stringify(createBenchmarkManifest(sources), null, 2)}\n`);
}

main().catch((error: unknown) => {
  process.stderr.write(`claimlatch-bench-manifest: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 2;
});
