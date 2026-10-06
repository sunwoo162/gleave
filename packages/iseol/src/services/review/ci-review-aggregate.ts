import { filterReviewFindings } from "./review-filter.js";
import type { ReviewFinding, ReviewResult } from "./review-types.js";
import type { CiReviewArtifact, CiReviewFinding } from "./ci-review-types.js";

const STYLE_RULES = new Set([
  "semi",
  "quotes",
  "comma-dangle",
  "max-len",
  "indent",
  "eol-last",
  "prettier/prettier",
]);

const STYLE_TEXT = [
  /missing semicolon/i,
  /extra semicolon/i,
  /quote style/i,
  /line length/i,
  /trailing comma/i,
  /indentation/i,
  /prettier/i,
];

const severityRank = { critical: 0, major: 1, minor: 2 } as const;

function isStyleNoise(finding: CiReviewFinding): boolean {
  if (finding.ruleId && STYLE_RULES.has(finding.ruleId.toLowerCase())) return true;
  return STYLE_TEXT.some((pattern) => pattern.test(finding.explanation));
}

function groupKey(finding: CiReviewFinding): string {
  return `${finding.filePath}:${finding.line}:${finding.category}`;
}

function mergeGroup(group: CiReviewFinding[]): ReviewFinding {
  const sorted = [...group].sort((a, b) => {
    return severityRank[a.severity] - severityRank[b.severity] || b.confidence - a.confidence;
  });
  const strongest = sorted[0]!;
  const tools = new Set(group.map((finding) => finding.tool.toLowerCase()));
  const confidence = Math.min(0.99, Math.max(...group.map((finding) => finding.confidence)) + Math.max(0, tools.size - 1) * 0.04);
  const suggestion = sorted.find((finding) => finding.suggestion?.trim())?.suggestion;
  const explanation = tools.size > 1
    ? `${strongest.explanation.trim()} (${[...tools].join(", ")} 교차 확인)`
    : strongest.explanation.trim();

  return {
    filePath: strongest.filePath,
    line: strongest.line,
    severity: strongest.severity,
    category: strongest.category,
    confidence,
    explanation,
    suggestion,
  };
}

function buildSummary(artifact: CiReviewArtifact, findings: ReviewFinding[]): string[] {
  const summary: string[] = [];
  const failed = artifact.checks.filter((check) => check.status === "failed");
  if (failed.length > 0) summary.push(`CI 검사 실패: ${failed.map((check) => check.name).join(", ")}`);

  const security = findings.filter((finding) => finding.category === "security").length;
  const correctness = findings.filter((finding) => finding.category === "correctness").length;
  const performance = findings.filter((finding) => finding.category === "performance").length;
  const maintainability = findings.filter((finding) => finding.category === "maintainability").length;
  if (security) summary.push(`보안 관련 수정 권장 ${security}건`);
  if (correctness) summary.push(`정확성 관련 수정 권장 ${correctness}건`);
  if (performance) summary.push(`성능 관련 수정 권장 ${performance}건`);
  if (maintainability) summary.push(`유지보수 관련 수정 권장 ${maintainability}건`);
  if (summary.length === 0) summary.push("이번 변경에서 수정할 가치가 높은 문제를 찾지 못했습니다.");
  return summary.slice(0, 5);
}

export function aggregateCiFindings(artifact: CiReviewArtifact, changedLines: Set<string>): ReviewResult {
  const groups = new Map<string, CiReviewFinding[]>();
  for (const finding of artifact.findings) {
    if (isStyleNoise(finding)) continue;
    const key = groupKey(finding);
    const bucket = groups.get(key) ?? [];
    bucket.push(finding);
    groups.set(key, bucket);
  }

  const merged = [...groups.values()].map(mergeGroup);
  const filtered = filterReviewFindings({ summary: [], findings: merged }, changedLines);
  return {
    summary: buildSummary(artifact, filtered.findings),
    findings: filtered.findings,
  };
}
