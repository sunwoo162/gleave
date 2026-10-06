import type { HarnessEvidenceRecord, HarnessRunStatus, HarnessRunStage } from "../harness/contracts.js";
import { assertCheckHttpUrl } from "../desktop-agent/contracts.js";

export type UserProjectRunObservationStatus =
  | "not-started" | "running" | "waiting" | "completed" | "failed" | "unknown";

export type UserProjectRunEvidenceItem = {
  id: string;
  kind: HarnessEvidenceRecord["kind"];
  stage: HarnessRunStage;
  summary: string;
  recordedAt: string;
};

export type UserProjectRunObservation = {
  runId: string;
  status: UserProjectRunObservationStatus;
  stage?: HarnessRunStage;
  blocker?: string;
  changedFiles: UserProjectRunEvidenceItem[];
  checks: UserProjectRunEvidenceItem[];
  logs: UserProjectRunEvidenceItem[];
  preview:
    | { status: "ready"; url: string; provider?: string; recordedAt: string }
    | { status: "not-available" | "unknown"; blocker: string };
};

function item(record: HarnessEvidenceRecord): UserProjectRunEvidenceItem {
  return {
    id: record.id,
    kind: record.kind,
    stage: record.stage,
    summary: record.summary,
    recordedAt: record.recordedAt,
  };
}

function bounded(records: HarnessEvidenceRecord[], kinds: HarnessEvidenceRecord["kind"][]): UserProjectRunEvidenceItem[] {
  return records
    .filter((record) => kinds.includes(record.kind))
    .sort((a, b) => a.recordedAt.localeCompare(b.recordedAt) || a.id.localeCompare(b.id))
    .slice(-100)
    .map(item);
}

function httpPreviewUrl(reference: string | undefined): string | null {
  const raw = reference?.trim();
  if (!raw || raw !== reference || /[\\\u0000-\u001f\u007f]/.test(raw) || /%5c/i.test(raw)) return null;
  try {
    assertCheckHttpUrl(raw);
    const url = new URL(raw);
    return url.toString();
  } catch {
    return null;
  }
}

function recordedPreview(evidence: HarnessEvidenceRecord[]): UserProjectRunObservation["preview"] {
  const deployments = evidence.filter((record) => record.kind === "deployment");
  const verifications = evidence
    .filter((record) => record.kind === "production-verification")
    .sort((a, b) => b.recordedAt.localeCompare(a.recordedAt) || b.id.localeCompare(a.id));
  for (const verification of verifications) {
    const url = httpPreviewUrl(verification.reference);
    if (!url) continue;
    const deployment = deployments.find((record) => httpPreviewUrl(record.reference) === url);
    return {
      status: "ready",
      url,
      ...(deployment?.provider ? { provider: deployment.provider } : {}),
      recordedAt: verification.recordedAt,
    };
  }
  return { status: "not-available", blocker: "Runtime가 검증된 미리보기 주소를 기록하지 않았습니다." };
}

export function runtimeObservationStatus(status: HarnessRunStatus): UserProjectRunObservationStatus {
  if (status === "DONE") return "completed";
  if (status === "FAILED_FINAL") return "failed";
  if (["WAITING_EXTERNAL", "WAITING_AGENT", "BLOCKED_USER", "PAUSED"].includes(status)) return "waiting";
  return "running";
}

export function projectRunObservation(input: {
  runId: string;
  status: UserProjectRunObservationStatus;
  stage?: HarnessRunStage;
  blocker?: string;
  evidence: HarnessEvidenceRecord[];
}): UserProjectRunObservation {
  return {
    runId: input.runId,
    status: input.status,
    ...(input.stage ? { stage: input.stage } : {}),
    ...(input.blocker ? { blocker: input.blocker } : {}),
    changedFiles: bounded(input.evidence, ["file-change"]),
    checks: bounded(input.evidence, ["build", "test"]),
    logs: bounded(input.evidence, ["command"]),
    preview: recordedPreview(input.evidence),
  };
}

export function missingProjectRunObservation(runId: string, blocker: string): UserProjectRunObservation {
  return {
    runId,
    status: "unknown",
    blocker,
    changedFiles: [],
    checks: [],
    logs: [],
    preview: { status: "unknown", blocker: "durable Run record가 없어 미리보기를 확인할 수 없습니다." },
  };
}
