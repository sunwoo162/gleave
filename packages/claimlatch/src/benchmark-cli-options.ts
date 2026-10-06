export type BenchmarkSplit = "train" | "dev" | "test";

export interface BenchmarkValidationSummary {
  dataset: string;
  cases: number;
  manifest?: string;
}

export function renderBenchmarkHelp(): string {
  return [
    "ClaimLatch benchmark",
    "",
    "Usage:",
    "  claimlatch-bench [options]",
    "",
    "Options:",
    "  --dataset <path>                 Run a custom JSONL dataset",
    "  --split <train|dev|test>          Run one frozen benchmark split",
    "  --manifest <path>                Verify a dataset against a manifest",
    "  --format <text|json|junit|sarif>  Select the output format",
        "  --validate                       Verify dataset and manifest without providers",
    "  --json                            Legacy alias for --format json",
    "  -h, --help                       Show this help",
    "",
    "The default is the 200-case independent.jsonl aggregate with manifest verification.",
    "--split cannot be combined with --dataset.",
    "",
  ].join("\n");
}

export function renderBenchmarkValidation(
  summary: BenchmarkValidationSummary,
  format: "text" | "json",
): string {
  if (format === "json") {
    return `${JSON.stringify({ valid: true, ...summary }, null, 2)}\n`;
  }

  return [
    "ClaimLatch benchmark dataset validation",
    "",
    "Dataset valid     true",
    `Dataset           ${summary.dataset}`,
    `Cases             ${summary.cases}`,
    `Manifest verified ${summary.manifest ?? "not requested"}`,
    "",
  ].join("\n");
}

export function parseBenchmarkSplit(value: string): BenchmarkSplit {
  if (value === "train" || value === "dev" || value === "test") return value;
  throw new Error(`Unsupported benchmark split: ${value}. Use train, dev, or test.`);
}

export function resolveBenchmarkDatasetPath(split: BenchmarkSplit): URL {
  return new URL(`../../benchmarks/${split}.jsonl`, import.meta.url);
}

export function resolveBenchmarkDatasetSelection(
  datasetArgument: string | undefined,
  splitArgument: string | undefined,
): string | URL {
  if (datasetArgument && splitArgument) {
    throw new Error("--split cannot be combined with --dataset.");
  }
  if (datasetArgument) return datasetArgument;
  if (splitArgument) return resolveBenchmarkDatasetPath(parseBenchmarkSplit(splitArgument));
  return new URL("../../benchmarks/independent.jsonl", import.meta.url);
}
