#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import {
  parseBenchmarkJsonl,
  parseBenchmarkManifest,
  runBenchmark,
  verifyBenchmarkManifestEntry,
} from "./benchmark.js";
import { formatBenchmarkReport, resolveBenchmarkOutputFormat } from "./benchmark-formatters.js";
import {
  renderBenchmarkHelp,
  renderBenchmarkValidation,
  resolveBenchmarkDatasetSelection,
} from "./benchmark-cli-options.js";
import { createDefaultClaimLatch } from "./default-gate.js";

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  if (argv.includes("--help") || argv.includes("-h")) {
    process.stdout.write(renderBenchmarkHelp());
    return;
  }
  const format = resolveBenchmarkOutputFormat(argv);
  const validate = argv.includes("--validate");
  const datasetArgument = argumentValue(argv, "--dataset");
  const splitArgument = argumentValue(argv, "--split");
  const datasetPath = resolveBenchmarkDatasetSelection(datasetArgument, splitArgument);
  const manifestPath = argumentValue(argv, "--manifest")
    ?? (datasetArgument ? undefined : new URL("../../benchmarks/MANIFEST.json", import.meta.url));
  const raw = await readFile(datasetPath, "utf8");
  const cases = parseBenchmarkJsonl(raw);
  if (manifestPath) {
    const manifest = parseBenchmarkManifest(await readFile(manifestPath, "utf8"));
    verifyBenchmarkManifestEntry(manifest, fileName(datasetPath), raw, cases.length);
  }

  const artifactUri = typeof datasetPath === "string" ? datasetPath : `benchmarks/${fileName(datasetPath)}`;
  if (validate) {
    if (format !== "text" && format !== "json") {
      throw new Error("--validate supports only text or json output.");
    }
    const manifestUri = manifestPath
      ? typeof manifestPath === "string" ? manifestPath : `benchmarks/${fileName(manifestPath)}`
      : undefined;
    process.stdout.write(renderBenchmarkValidation({
      dataset: artifactUri,
      cases: cases.length,
      ...(manifestUri ? { manifest: manifestUri } : {}),
    }, format));
    return;
  }

  const llmModel = process.env.CLAIMLATCH_LLM_MODEL;
  const tavilyApiKey = process.env.TAVILY_API_KEY;
  if (!llmModel) throw new Error("Set CLAIMLATCH_LLM_MODEL for the verifier model.");
  if (!tavilyApiKey) throw new Error("Set TAVILY_API_KEY for evidence retrieval.");

  const llmApiKey = process.env.CLAIMLATCH_LLM_API_KEY ?? process.env.OPENAI_API_KEY;
  const llmBaseUrl = process.env.CLAIMLATCH_LLM_BASE_URL;
  const gate = createDefaultClaimLatch({
    llmModel,
    tavilyApiKey,
    ...(llmApiKey ? { llmApiKey } : {}),
    ...(llmBaseUrl ? { llmBaseUrl } : {}),
  });

  const report = await runBenchmark(gate, cases);
  process.stdout.write(formatBenchmarkReport(report, format, { artifactUri }));

  process.exitCode = report.falsePasses === 0 ? 0 : 1;
}

function argumentValue(argv: string[], name: string): string | undefined {
  const index = argv.indexOf(name);
  if (index === -1) return undefined;
  if (argv.indexOf(name, index + 1) !== -1) {
    throw new Error(`${name} may only be specified once.`);
  }
  const value = argv[index + 1];
  if (!value || value.startsWith("-")) throw new Error(`${name} requires a value.`);
  return value;
}

function fileName(path: string | URL): string {
  const value = typeof path === "string" ? path : path.pathname;
  const segments = value.split(/[\\/]/u);
  return decodeURIComponent(segments[segments.length - 1] ?? "");
}

main().catch((error: unknown) => {
  process.stderr.write(`claimlatch-bench: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 2;
});
