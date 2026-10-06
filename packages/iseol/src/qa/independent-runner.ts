export type QaStatus = "PASS" | "WARN" | "FAIL";

export type QaCheckResult = {
  status: QaStatus;
  summary: string;
  evidenceIds?: string[];
};

export type QaCheck = {
  id: string;
  label: string;
  run: () => Promise<QaCheckResult> | QaCheckResult;
};

export type QaFinding = {
  checkId: string;
  severity: Exclude<QaStatus, "PASS">;
  summary: string;
  evidenceIds: string[];
};

export type IndependentQaReportV1 = {
  schemaVersion: 1;
  projectId: string;
  projectRevision: string;
  status: QaStatus;
  independent: true;
  executor: "iseol-independent-qa";
  checks: Array<{
    id: string;
    label: string;
    status: QaStatus;
    summary: string;
    evidenceIds: string[];
  }>;
  findings: QaFinding[];
  evidenceIds: string[];
  createdAt: string;
};

export type IndependentQaInput = {
  projectId: string;
  projectRevision: string;
  checks: QaCheck[];
  now?: () => string;
};

export async function runIndependentQa(
  input: IndependentQaInput,
): Promise<IndependentQaReportV1> {
  const createdAt = input.now?.() ?? new Date().toISOString();
  const checks: IndependentQaReportV1["checks"] = [];
  const findings: QaFinding[] = [];
  const evidenceIds: string[] = [];

  for (const check of input.checks) {
    const checkEvidenceIds = new Set<string>();
    let result: QaCheckResult;
    try {
      result = await check.run();
      if (!isQaStatus(result.status)) throw new Error("invalid QA status");
    } catch (error) {
      result = {
        status: "FAIL",
        summary: error instanceof Error ? error.message : "QA check failed",
        evidenceIds: [`qa-error-${check.id}`],
      };
    }

    for (const evidenceId of result.evidenceIds ?? []) {
      if (evidenceId.trim()) checkEvidenceIds.add(evidenceId.trim());
    }
    if (checkEvidenceIds.size === 0) checkEvidenceIds.add(`qa-check-${check.id}`);
    const normalizedEvidenceIds = [...checkEvidenceIds];
    evidenceIds.push(...normalizedEvidenceIds);
    checks.push({
      id: check.id,
      label: check.label,
      status: result.status,
      summary: result.summary,
      evidenceIds: normalizedEvidenceIds,
    });
    if (result.status !== "PASS") {
      findings.push({
        checkId: check.id,
        severity: result.status,
        summary: result.summary,
        evidenceIds: normalizedEvidenceIds,
      });
    }
  }

  if (checks.length === 0) {
    findings.push({
      checkId: "qa-runner",
      severity: "FAIL",
      summary: "Independent QA cannot pass without at least one executed check",
      evidenceIds: ["qa-no-checks"],
    });
    evidenceIds.push("qa-no-checks");
  }

  return {
    schemaVersion: 1,
    projectId: requireNonEmpty(input.projectId, "projectId"),
    projectRevision: requireNonEmpty(input.projectRevision, "projectRevision"),
    status: findings.some((finding) => finding.severity === "FAIL")
      ? "FAIL"
      : findings.length > 0
        ? "WARN"
        : "PASS",
    independent: true,
    executor: "iseol-independent-qa",
    checks,
    findings,
    evidenceIds: [...new Set(evidenceIds)],
    createdAt,
  };
}

function isQaStatus(value: unknown): value is QaStatus {
  return value === "PASS" || value === "WARN" || value === "FAIL";
}

function requireNonEmpty(value: string, field: string): string {
  if (!value.trim()) throw new Error(`${field} is required`);
  return value.trim();
}
