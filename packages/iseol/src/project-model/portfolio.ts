import { loadHarnessRun } from "../harness/run-store.js";
import type { HarnessEvidenceRecord, HarnessRuntimeRunEnvelope } from "../harness/contracts.js";
import { assertCheckHttpUrl } from "../desktop-agent/contracts.js";
import { loadProjectHistory } from "./history-store.js";
import { loadProjectWorkspace } from "./workspace-store.js";
import { sanitizeProjectEvidenceReference } from "./reference-safety.js";
import { sanitizeCredentialText } from "../security/text-safety.js";
import type { ProjectWorkspace } from "./contracts.js";
import type { ProjectPurpose } from "./execution-profile.js";

export type ProjectEvidence = {
  id: string;
  kind: string;
  summary: string;
  reference?: string;
  source: "project" | "run" | "history";
  runId?: string;
};

export type ProjectEvidenceBundle = {
  projectId: string;
  projectName: string;
  objective: string;
  repository: { url?: string; branch: string; commitSha: string };
  deployment: { url?: string; provider?: string };
  features: Array<{ id: string; title: string; status: string; runIds: string[] }>;
  runs: Array<{ runId: string; stage: string; status: string; objective: string }>;
  evidence: ProjectEvidence[];
  purpose?: { id: ProjectPurpose; summary: string; source: "user" | "default" };
};

export type PortfolioClaim = {
  id: string;
  text: string;
  evidenceIds: string[];
};

export type PortfolioDraft = {
  version: 1;
  projectId: string;
  generatedAt: string;
  overview: string;
  features: string[];
  technology: string[];
  troubleshooting: string[];
  claims: PortfolioClaim[];
  readme: string;
  purpose?: { id: ProjectPurpose; summary: string; source: "user" | "default" };
};

function safeText(value: string, max = 500): string {
  return sanitizeCredentialText(value.replace(/[\r\n]+/g, " ").trim(), max);
}

function safeHttpUrl(value: string | undefined): string | undefined {
  if (!value || /%(?![0-9a-f]{2})/i.test(value)) return undefined;
  try {
    assertCheckHttpUrl(value);
    return value;
  } catch {
    return undefined;
  }
}

function evidenceFromRun(run: HarnessRuntimeRunEnvelope): ProjectEvidence[] {
  return run.evidence.slice(0, 200).map((record: HarnessEvidenceRecord) => {
    const reference = record.reference === undefined ? undefined : sanitizeProjectEvidenceReference(record.reference);
    return {
      id: record.id,
      kind: record.kind,
      summary: safeText(record.summary),
      ...(reference ? { reference: safeText(reference, 240) } : {}),
      source: "run" as const,
      runId: run.request.runId,
    };
  });
}

export async function collectProjectEvidence(
  modelRoot: string,
  runRoot: string,
  projectId: string,
): Promise<ProjectEvidenceBundle> {
  const workspace = await loadProjectWorkspace(modelRoot, projectId);
  if (!workspace) throw new Error(`Project workspace not found: ${projectId}`);
  const runIds = [...new Set(workspace.tree.flatMap((node) => node.runIds))];
  const runs: HarnessRuntimeRunEnvelope[] = [];
  for (const runId of runIds) {
    const run = await loadHarnessRun(runRoot, runId);
    if (run) runs.push(run);
  }
  const repositoryUrl = safeHttpUrl(workspace.genesis.repository.url);
  const deploymentUrl = safeHttpUrl(workspace.genesis.deployment.url);
  const evidence: ProjectEvidence[] = [
    { id: `project:${workspace.id}:repository`, kind: "repository", summary: repositoryUrl ? `저장소 ${repositoryUrl} (${safeText(workspace.genesis.repository.branch, 120)})` : `저장소 주소가 검증되지 않았습니다. (${safeText(workspace.genesis.repository.branch, 120)})`, reference: safeText(workspace.genesis.repository.commitSha, 120), source: "project" },
    { id: `project:${workspace.id}:deployment`, kind: "deployment", summary: deploymentUrl ? `배포 주소 ${deploymentUrl}` : "배포 주소가 검증되지 않았습니다.", source: "project" },
    ...runs.flatMap(evidenceFromRun),
  ];
  const history = await loadProjectHistory(modelRoot, projectId);
  evidence.push(...history.slice(0, 200).map((event) => {
    const reference = event.reference === undefined ? undefined : sanitizeProjectEvidenceReference(event.reference);
    return {
      id: event.id,
      kind: event.type,
      summary: safeText(event.summary),
      ...(reference ? { reference: safeText(reference, 240) } : {}),
      source: "history" as const,
      ...(event.runId ? { runId: event.runId } : {}),
    };
  }));
  return {
    projectId: workspace.id,
    projectName: safeText(workspace.name, 160),
    objective: safeText(runs[0]?.request.objective ?? workspace.name),
    repository: { ...(repositoryUrl ? { url: repositoryUrl } : {}), branch: safeText(workspace.genesis.repository.branch, 120), commitSha: safeText(workspace.genesis.repository.commitSha, 120) },
    deployment: { ...(deploymentUrl ? { url: deploymentUrl } : {}), ...(workspace.genesis.deployment.provider ? { provider: workspace.genesis.deployment.provider } : {}) },
    features: workspace.tree.filter((node) => node.kind === "feature" || node.kind === "task").map((node) => ({ id: node.id, title: safeText(node.title, 160), status: node.status, runIds: [...node.runIds] })),
    runs: runs.map((run) => ({ runId: run.request.runId, stage: run.state.stage, status: run.state.status, objective: safeText(run.request.objective) })),
    evidence,
    ...(workspace.purposeSelection ? {
      purpose: {
        id: workspace.purposeSelection.purpose,
        summary: safeText(workspace.purposeSelection.profile.koreanSummary, 500),
        source: workspace.purposeSelection.source,
      },
    } : {}),
  };
}

function humanize(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

export function buildPortfolioDraft(bundle: ProjectEvidenceBundle, generatedAt = new Date().toISOString()): PortfolioDraft {
  const repositoryEvidence = bundle.evidence.find((item) => item.kind === "repository");
  const featureClaims = bundle.features.map((feature) => {
    const evidenceIds = feature.runIds.flatMap((runId) => bundle.evidence.filter((item) => item.runId === runId).map((item) => item.id));
    return { id: `feature:${feature.id}`, text: `${feature.title} 기능은 기록된 작업 트리에 포함되어 있습니다.`, evidenceIds: [...new Set(evidenceIds)] };
  }).filter((claim) => claim.evidenceIds.length > 0);
  const testEvidence = bundle.evidence.filter((item) => item.kind === "test" || item.kind === "build");
  const claims: PortfolioClaim[] = [
    { id: "project-overview", text: `${bundle.projectName}은(는) ${bundle.objective}를 목표로 합니다.`, evidenceIds: repositoryEvidence ? [repositoryEvidence.id] : [] },
    ...featureClaims,
    ...(testEvidence.length > 0 ? [{ id: "verification", text: "테스트 또는 빌드 결과가 개발 기록에 남아 있습니다.", evidenceIds: testEvidence.map((item) => item.id) }] : []),
  ].filter((claim) => claim.evidenceIds.length > 0).map((claim) => ({ ...claim, text: humanize(claim.text) }));
  const features = bundle.features.map((feature) => `${feature.title} (${feature.status})`);
  const technology = [`저장소: ${bundle.repository.url ?? "검증되지 않은 저장소 주소"}`, `브랜치: ${bundle.repository.branch}`, `기준 커밋: ${bundle.repository.commitSha}`];
  const troubleshooting = bundle.evidence.filter((item) => /fail|error|recover|reject|실패|복구/i.test(item.summary)).map((item) => `${item.summary} [근거: ${item.id}]`);
  const readme = [`# ${bundle.projectName}`, "", bundle.objective, "", "## 주요 기능", ...(features.length ? features.map((item) => `- ${item}`) : ["- 기록된 기능이 없습니다."]), "", "## 검증", ...(testEvidence.length ? testEvidence.map((item) => `- ${item.summary}`) : ["- 기록된 테스트 또는 빌드 근거가 없습니다."])].join("\n");
  const purpose = bundle.purpose;
  const overview = humanize(`${bundle.projectName}: ${bundle.objective}${purpose ? ` (${purpose.id})` : ""}`);
  return { version: 1, projectId: bundle.projectId, generatedAt, overview, features, technology, troubleshooting, claims, readme, ...(purpose ? { purpose } : {}) };
}

export function verifyPortfolioGrounding(draft: PortfolioDraft, bundle: ProjectEvidenceBundle): { grounded: boolean; ungroundedClaimIds: string[] } {
  const ids = new Set(bundle.evidence.map((item) => item.id));
  const ungroundedClaimIds = draft.claims.filter((claim) => claim.evidenceIds.length === 0 || claim.evidenceIds.some((id) => !ids.has(id))).map((claim) => claim.id);
  return { grounded: ungroundedClaimIds.length === 0, ungroundedClaimIds };
}
