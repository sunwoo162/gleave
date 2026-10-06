import type { BenchmarkReport } from "./benchmark.js";

export type BenchmarkOutputFormat = "text" | "json" | "junit" | "sarif";

export interface BenchmarkFormatOptions {
  artifactUri?: string;
}

export function resolveBenchmarkOutputFormat(argv: readonly string[]): BenchmarkOutputFormat {
  const json = argv.includes("--json");
  const formatArguments = argv.filter((argument) => argument === "--format" || argument.startsWith("--format="));
  if (formatArguments.length > 1) throw new Error("--format may only be specified once.");
  const formatIndex = argv.indexOf("--format");
  const inlineFormat = formatArguments.find((argument) => argument.startsWith("--format="));
  const requested = inlineFormat
    ? inlineFormat.slice("--format=".length)
    : formatIndex === -1
      ? undefined
      : argv[formatIndex + 1];

  if (requested === undefined) return json ? "json" : "text";
  if (!requested || requested.startsWith("-")) throw new Error("--format requires a value.");
  if (json && requested !== "json") throw new Error("--json cannot be combined with a non-JSON --format.");
  if (requested !== "text" && requested !== "json" && requested !== "junit" && requested !== "sarif") {
    throw new Error(`Unsupported benchmark format: ${requested}. Use text, json, junit, or sarif.`);
  }
  return requested;
}

export function formatBenchmarkReport(
  report: BenchmarkReport,
  format: BenchmarkOutputFormat,
  options: BenchmarkFormatOptions = {},
): string {
  switch (format) {
    case "text":
      return renderBenchmarkText(report);
    case "json":
      return `${JSON.stringify(report, null, 2)}\n`;
    case "junit":
      return renderBenchmarkJUnit(report);
    case "sarif":
      return renderBenchmarkSarif(report, options);
  }
}

export function renderBenchmarkText(report: BenchmarkReport): string {
  const lines = [
    "ClaimLatch benchmark",
    "",
    `Cases             ${report.total}`,
    `Decision accuracy ${(report.decisionAccuracy * 100).toFixed(1)}%`,
    `Average coverage  ${(report.averageCoverage * 100).toFixed(1)}%`,
    `False passes      ${report.falsePasses}/${report.negativeCases} (${(report.falsePassRate * 100).toFixed(1)}%)`,
    `False blocks      ${report.falseBlocks}/${report.positiveCases} (${(report.falseBlockRate * 100).toFixed(1)}%)`,
    "",
  ];

  for (const item of report.cases.filter((candidate) => !candidate.correct)) {
    lines.push(
      `${item.falsePass ? "FALSE PASS" : "FALSE BLOCK"}  ${item.id}`,
      `  expected=${item.expectedPassed ? "PASS" : "BLOCK"} actual=${item.actualPassed ? "PASS" : "BLOCK"}`,
    );
  }
  lines.push("");
  return lines.join("\n");
}

function renderBenchmarkJUnit(report: BenchmarkReport): string {
  const testcases = report.cases.map((item) => {
    const name = escapeXml(item.id);
    if (item.correct) return `  <testcase name="${name}" classname="ClaimLatch benchmark"/>`;

    const message = benchmarkMismatchMessage(item);
    const properties = renderBenchmarkJUnitProperties(item);
    return [
      `  <testcase name="${name}" classname="ClaimLatch benchmark">`,
      ...(properties ? [properties] : []),
      `    <failure message="${escapeXml(message)}">${escapeXml(message)}</failure>`,
      "  </testcase>",
    ].join("\n");
  }).join("\n");

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<testsuite name="ClaimLatch benchmark" tests="${report.total}" failures="${report.total - report.correct}" errors="0" skipped="0" time="0">`,
    renderBenchmarkJUnitAggregateProperties(report),
    testcases,
    "</testsuite>",
    "",
  ].join("\n");
}

function renderBenchmarkJUnitAggregateProperties(report: BenchmarkReport): string {
  return [
    "  <properties>",
    `    <property name="decisionAccuracy" value="${report.decisionAccuracy.toFixed(6)}"/>`,
    `    <property name="averageCoverage" value="${report.averageCoverage.toFixed(6)}"/>`,
    `    <property name="falsePassRate" value="${report.falsePassRate.toFixed(6)}"/>`,
    `    <property name="falseBlockRate" value="${report.falseBlockRate.toFixed(6)}"/>`,
    "  </properties>",
  ].join("\n");
}

function renderBenchmarkJUnitProperties(item: BenchmarkReport["cases"][number]): string {
  const properties: string[] = [];
  if (item.labelSourceUrls && item.labelSourceUrls.length > 0) {
    properties.push(`      <property name="labelSourceUrls" value="${escapeXml(item.labelSourceUrls.join(" "))}"/>`);
  }
  if (item.note) {
    properties.push(`      <property name="note" value="${escapeXml(item.note)}"/>`);
  }
  if (properties.length === 0) return "";
  return ["    <properties>", ...properties, "    </properties>"].join("\n");
}

function renderBenchmarkSarif(report: BenchmarkReport, options: BenchmarkFormatOptions): string {
  const artifactUri = options.artifactUri ?? "benchmark.jsonl";
  const results = report.cases.flatMap((item, index) => {
    if (item.correct) return [];

    return [{
      ruleId: item.falsePass ? "FALSE_PASS" : "FALSE_BLOCK",
      level: "error",
      message: { text: benchmarkMismatchMessage(item, true) },
      locations: [{
        physicalLocation: {
          artifactLocation: { uri: artifactUri },
          region: { startLine: item.sourceLine ?? index + 1 },
        },
      }],
      properties: {
        benchmarkId: item.id,
        expectedPassed: item.expectedPassed,
        actualPassed: item.actualPassed,
        ...(item.labelSourceUrls ? { labelSourceUrls: item.labelSourceUrls } : {}),
        ...(item.note ? { note: item.note } : {}),
      },
    }];
  });

  return `${JSON.stringify({
    $schema: "https://json.schemastore.org/sarif-2.1.0.json",
    version: "2.1.0",
    runs: [{
      tool: {
        driver: {
          name: "ClaimLatch",
          informationUri: "https://github.com/sunwoo162/claimlatch",
          rules: [
            { id: "FALSE_PASS", name: "False pass", shortDescription: { text: "The gate passed a benchmark case labeled BLOCK." } },
            { id: "FALSE_BLOCK", name: "False block", shortDescription: { text: "The gate blocked a benchmark case labeled PASS." } },
          ],
        },
      },
      properties: {
        decisionAccuracy: report.decisionAccuracy,
        averageCoverage: report.averageCoverage,
        falsePassRate: report.falsePassRate,
        falseBlockRate: report.falseBlockRate,
      },
      results,
    }],
  }, null, 2)}\n`;
}

function benchmarkMismatchMessage(
  item: BenchmarkReport["cases"][number],
  sarif = false,
): string {
  const expected = item.expectedPassed ? "PASS" : "BLOCK";
  const actual = item.actualPassed ? "PASS" : "BLOCK";
  if (sarif) return `Benchmark expected ${expected} but gate returned ${actual}.`;
  return `expected ${expected}, actual ${actual}`;
}

function escapeXml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    switch (character) {
      case "&": return "&amp;";
      case "<": return "&lt;";
      case ">": return "&gt;";
      case '"': return "&quot;";
      case "'": return "&apos;";
      default: return character;
    }
  });
}
