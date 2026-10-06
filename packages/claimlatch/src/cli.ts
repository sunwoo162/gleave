#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { createDefaultClaimLatch } from "./default-gate.js";
import type { GatePolicy, VerificationReport } from "./types.js";

interface CliArgs {
  question?: string;
  answer?: string;
  answerFile?: string;
  json: boolean;
  help: boolean;
  minimumCoverage?: number;
  allowUnsupported?: number;
  allowUnverifiable?: number;
  requireDocumentProvenance: boolean;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }

  if (!args.question) throw new Error("Missing --question.");
  const answer = args.answer ?? (args.answerFile ? await readFile(args.answerFile, "utf8") : undefined);
  if (!answer?.trim()) throw new Error("Provide --answer or --answer-file.");

  const apiKey = process.env.CLAIMLATCH_LLM_API_KEY ?? process.env.OPENAI_API_KEY;
  const model = process.env.CLAIMLATCH_LLM_MODEL;
  const baseUrl = process.env.CLAIMLATCH_LLM_BASE_URL;
  const tavilyKey = process.env.TAVILY_API_KEY;

  if (!model) throw new Error("Set CLAIMLATCH_LLM_MODEL to an OpenAI-compatible model name.");
  if (!tavilyKey) throw new Error("Set TAVILY_API_KEY for web evidence retrieval.");

  const gate = createDefaultClaimLatch({
    ...(apiKey ? { llmApiKey: apiKey } : {}),
    llmModel: model,
    ...(baseUrl ? { llmBaseUrl: baseUrl } : {}),
    tavilyApiKey: tavilyKey,
  });

  const policy: Partial<GatePolicy> = {};
  if (args.minimumCoverage !== undefined) policy.minimumCoverage = args.minimumCoverage;
  if (args.allowUnsupported !== undefined) policy.maxUnsupportedClaims = args.allowUnsupported;
  if (args.allowUnverifiable !== undefined) policy.maxUnverifiableClaims = args.allowUnverifiable;
  if (args.requireDocumentProvenance) policy.requireRetrievedDocumentForDecisiveClaims = true;

  const report = await gate.verify({
    question: args.question,
    answer,
    policy,
  });

  if (args.json) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } else {
    process.stdout.write(renderReport(report));
  }

  process.exitCode = report.passed ? 0 : 1;
}

function parseArgs(argv: string[]): CliArgs {
  const result: CliArgs = { json: false, help: false, requireDocumentProvenance: false };
  const seenValueOptions = new Set<string>();

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];
    switch (arg) {
      case "--question":
      case "-q":
        rejectDuplicateValueOption(seenValueOptions, "--question");
        result.question = requireValue(arg, next);
        i += 1;
        break;
      case "--answer":
      case "-a":
        rejectDuplicateValueOption(seenValueOptions, "--answer");
        result.answer = requireValue(arg, next);
        i += 1;
        break;
      case "--answer-file":
        rejectDuplicateValueOption(seenValueOptions, "--answer-file");
        result.answerFile = requireValue(arg, next);
        i += 1;
        break;
      case "--minimum-coverage":
        rejectDuplicateValueOption(seenValueOptions, "--minimum-coverage");
        result.minimumCoverage = parseUnitInterval(arg, requireValue(arg, next));
        i += 1;
        break;
      case "--allow-unsupported":
        rejectDuplicateValueOption(seenValueOptions, "--allow-unsupported");
        result.allowUnsupported = parseNonNegativeInteger(arg, requireValue(arg, next));
        i += 1;
        break;
      case "--allow-unverifiable":
        rejectDuplicateValueOption(seenValueOptions, "--allow-unverifiable");
        result.allowUnverifiable = parseNonNegativeInteger(arg, requireValue(arg, next));
        i += 1;
        break;
      case "--require-document-provenance":
        result.requireDocumentProvenance = true;
        break;
      case "--json":
        result.json = true;
        break;
      case "--help":
      case "-h":
        result.help = true;
        break;
      default:
        if (arg?.startsWith("-")) throw new Error(`Unknown option: ${arg}`);
        break;
    }
  }

  return result;
}

function rejectDuplicateValueOption(seen: Set<string>, option: string): void {
  if (seen.has(option)) throw new Error(`${option} may only be specified once.`);
  seen.add(option);
}

function requireValue(name: string, value: string | undefined): string {
  if (!value || value.startsWith("-")) throw new Error(`${name} requires a value.`);
  return value;
}

function parseUnitInterval(name: string, value: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) {
    throw new Error(`${name} must be a number between 0 and 1.`);
  }
  return parsed;
}

function parseNonNegativeInteger(name: string, value: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`${name} must be a non-negative integer.`);
  }
  return parsed;
}

function renderReport(report: VerificationReport): string {
  const lines: string[] = [];
  lines.push("ClaimLatch verification", "");

  for (const item of report.claims) {
    const symbol = item.status === "SUPPORTED" ? "✓" : item.status === "CONTRADICTED" ? "✗" : "?";
    lines.push(`${symbol} ${item.status}  ${item.claim.text}`);
    lines.push(`  ${item.reason}`);
    if (item.evidenceIds.length > 0) {
      lines.push(`  Evidence: ${item.evidenceIds.join(", ")}`);
      for (const evidence of item.evidence.filter((candidate) => item.evidenceIds.includes(candidate.id))) {
        lines.push(`    ↳ ${evidence.provenance?.kind ?? "unknown-provenance"} ${evidence.url}`);
      }
    }
    lines.push("");
  }

  lines.push("────────────────────────────────");
  lines.push(`Coverage       ${(report.coverage * 100).toFixed(1)}%`);
  lines.push(`Supported      ${report.counts.supported}`);
  lines.push(`Contradicted   ${report.counts.contradicted}`);
  lines.push(`Unsupported    ${report.counts.unsupported}`);
  lines.push(`Unverifiable   ${report.counts.unverifiable}`);

  if (report.violations.length > 0) {
    lines.push("", "Policy violations:");
    for (const violation of report.violations) lines.push(`- ${violation.code}: ${violation.message}`);
  }

  lines.push("", `RESULT: ${report.passed ? "PASS" : "BLOCKED"}`, "");
  return lines.join("\n");
}

function printHelp(): void {
  process.stdout.write(`ClaimLatch — evidence-backed output gate for LLM answers\n\nUsage:\n  claimlatch --question <text> --answer <text> [options]\n  claimlatch --question <text> --answer-file <path> [options]\n\nEnvironment:\n  CLAIMLATCH_LLM_API_KEY   Optional API key (OPENAI_API_KEY is also accepted)\n  CLAIMLATCH_LLM_MODEL     OpenAI-compatible model name\n  CLAIMLATCH_LLM_BASE_URL  Optional base URL (default: https://api.openai.com/v1)\n  TAVILY_API_KEY           Tavily API key for evidence search\n\nOptions:\n  -q, --question <text>          Original user question\n  -a, --answer <text>            Draft LLM answer to verify\n      --answer-file <path>       Read draft answer from a file\n      --minimum-coverage <0..1>  Required evidence coverage\n      --allow-unsupported <n>    Allowed unsupported claims\n      --allow-unverifiable <n>   Allowed unverifiable claims\n      --require-document-provenance\n                                 Require decisive verdicts to cite fetched source text\n      --json                     Print machine-readable report\n  -h, --help                     Show this help\n`);
}

main().catch((error: unknown) => {
  process.stderr.write(`claimlatch: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 2;
});
