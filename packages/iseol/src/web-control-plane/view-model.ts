import { loadEvaluationReport } from "../evaluation/report-store.js";
import { evaluationDirectory, listEvaluationJsonFiles } from "../evaluation/store-utils.js";
import { loadHarnessRun } from "../harness/run-store.js";
import { listIdeaLabCampaigns, loadIdeaLabCampaign } from "../idea-lab/campaign-store.js";
import { listPrototypeProductions } from "../idea-lab/production-store.js";
import { assertCheckHttpUrl } from "../desktop-agent/contracts.js";
import { loadProjectHistory } from "../project-model/history-store.js";
import { listPrototypeCandidates, loadPrototypeCandidate } from "../project-model/prototype-store.js";
import { loadProjectWorkspace, listProjectWorkspaces } from "../project-model/workspace-store.js";
import { sanitizeCredentialText } from "../security/text-safety.js";
import type { ProjectGenesis } from "../project-model/contracts.js";
import type {
  EvaluationView,
  IdeaLabView,
  ProjectWorkspaceView,
  ProjectWorkspaceListView,
  WebEvaluationReportSummary,
  WebIdeaLabCampaignSummary,
  WebIdeaLabCampaignDetail,
  WebIdeaLabProductionSummary,
  WebPrototypeCard,
  WebPrototypeDetail,
  WebProjectGenesis,
  WebRunSummary,
} from "./contracts.js";

export async function buildProjectWorkspaceListView(modelRoot: string): Promise<ProjectWorkspaceListView> {
  return { projects: (await listProjectWorkspaces(modelRoot)).map(({ id, name, status, createdAt, updatedAt }) => ({ id, name, status, createdAt, updatedAt })) };
}

export function toPrototypeCard(
  candidate: Awaited<ReturnType<typeof listPrototypeCandidates>>[number],
): WebPrototypeCard {
  const repositoryUrl = safeHttpUrl(candidate.repository.url);
  const deploymentUrl = safeHttpUrl(candidate.deployment.url);
  return {
    id: candidate.id,
    title: candidate.title,
    concept: candidate.concept,
    status: candidate.status,
    repository: {
      ...(repositoryUrl ? { url: repositoryUrl } : {}),
      branch: candidate.repository.branch,
      commitSha: candidate.repository.commitSha,
    },
    deployment: {
      ...(deploymentUrl ? { url: deploymentUrl } : {}),
      ...(candidate.deployment.provider === undefined
        ? {}
        : { provider: candidate.deployment.provider }),
    },
    ...(candidate.promotedProjectId === undefined
      ? {}
      : { promotedProjectId: candidate.promotedProjectId }),
    createdAt: candidate.createdAt,
    updatedAt: candidate.updatedAt,
  };
}

function safeIdeaLabSummary(value: string | undefined): string | undefined {
  return value ? sanitizeCredentialText(value) : undefined;
}

function safeRunSummary(value: string | undefined): string | undefined {
  return value ? sanitizeCredentialText(value) : undefined;
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

function toProjectGenesisView(genesis: ProjectGenesis): WebProjectGenesis {
  const repositoryUrl = safeHttpUrl(genesis.repository.url);
  const deploymentUrl = safeHttpUrl(genesis.deployment.url);
  return {
    ...structuredClone(genesis),
    repository: {
      ...(repositoryUrl ? { url: repositoryUrl } : {}),
      branch: genesis.repository.branch,
      commitSha: genesis.repository.commitSha,
    },
    deployment: {
      ...(deploymentUrl ? { url: deploymentUrl } : {}),
      ...(genesis.deployment.provider === undefined ? {} : { provider: genesis.deployment.provider }),
      ...(genesis.deployment.deploymentId === undefined ? {} : { deploymentId: genesis.deployment.deploymentId }),
    },
  };
}

function toProductionView(
  production: Awaited<ReturnType<typeof listPrototypeProductions>>[number],
  run: WebRunSummary | null,
): WebIdeaLabProductionSummary {
  const deploymentUrl = safeHttpUrl(production.deployment?.url);
  return {
    id: production.id,
    campaignId: production.campaignId,
    proposalId: production.proposalId,
    runId: production.runId,
    status: production.status,
    branch: production.branch,
    ...(production.commitSha ? { commitSha: production.commitSha } : {}),
    ...(deploymentUrl ? { deploymentUrl } : {}),
    ...(safeIdeaLabSummary(production.blockerSummary) ? { blockerSummary: safeIdeaLabSummary(production.blockerSummary) } : {}),
    updatedAt: production.updatedAt,
    ...(run ? { run } : {}),
  };
}

function safeRunReason(value: string | undefined): string | undefined {
  if (!value) return undefined;
  if (/waiting.*agent/i.test(value)) return "Run is waiting for the configured agent.";
  if (/waiting.*external/i.test(value)) return "Run is waiting for an external dependency.";
  if (/blocked/i.test(value)) return "Run is blocked pending user or policy action.";
  if (/failed|error|invalid|rejected/i.test(value)) return "A bounded Run failure was recorded; inspect its evidence.";
  return "A bounded Run status reason was recorded.";
}

export async function buildIdeaLabView(
  modelRoot: string,
  harnessRoot = modelRoot,
): Promise<IdeaLabView> {
  const prototypes = await listPrototypeCandidates(modelRoot);
  const campaigns = await listIdeaLabCampaigns(modelRoot);
  const productions = await listPrototypeProductions(modelRoot);
  const campaignViews: WebIdeaLabCampaignSummary[] = campaigns.map((campaign) => ({
    id: campaign.id,
    seed: campaign.seed,
    status: campaign.status,
    targetReadyCount: campaign.targetReadyCount,
    readyCount: productions.filter((item) => item.campaignId === campaign.id && item.status === "ready").length,
    productionCount: productions.filter((item) => item.campaignId === campaign.id).length,
    productionConcurrency: campaign.productionConcurrency,
    ...(safeIdeaLabSummary(campaign.blockerSummary) ? { blockerSummary: safeIdeaLabSummary(campaign.blockerSummary) } : {}),
    createdAt: campaign.createdAt,
    updatedAt: campaign.updatedAt,
  }));
  const productionViews: WebIdeaLabProductionSummary[] = [];
  for (const production of productions) {
    const run = await buildRunSummary(harnessRoot, production.runId);
    productionViews.push(toProductionView(production, run));
  }
  return { prototypes: prototypes.map(toPrototypeCard), campaigns: campaignViews, productions: productionViews };
}

function collectAttachedRunIds(
  tree: ProjectWorkspaceView["tree"],
): string[] {
  const ids = new Set<string>();
  for (const node of tree) {
    for (const runId of node.runIds) ids.add(runId);
  }
  return [...ids];
}

async function buildRunSummary(
  harnessRoot: string,
  runId: string,
): Promise<WebRunSummary | null> {
  const run = await loadHarnessRun(harnessRoot, runId);
  if (!run) return null;
  return {
    runId,
    objective: run.request.objective,
    stage: run.state.stage,
    status: run.state.status,
    updatedAt: run.updatedAt,
    ...(run.preflight.policy?.effectiveSha256 === undefined
      ? {}
      : { policySha256: run.preflight.policy.effectiveSha256 }),
    evidenceCount: run.evidence.length,
    ...(safeRunReason(run.state.reason) ? { reason: safeRunReason(run.state.reason) } : {}),
    evidence: run.evidence.slice(-20).map((item) => ({
      id: item.id,
      kind: item.kind,
      stage: item.stage,
      recordedAt: item.recordedAt,
      summary: safeRunSummary(item.summary) ?? "",
    })),
    agentPlan: [
      ...(run.request.purposeProfile?.executableRoles ?? []).map((role) => ({ role, status: "executable" as const })),
      ...(run.request.purposeProfile?.plannedRoles ?? []).map((role) => ({ role, status: "planned" as const })),
    ],
  };
}

export async function buildIdeaLabCampaignDetail(
  modelRoot: string,
  harnessRoot: string,
  campaignId: string,
): Promise<WebIdeaLabCampaignDetail | null> {
  const [campaign, productions, candidates] = await Promise.all([
    loadIdeaLabCampaign(modelRoot, campaignId),
    listPrototypeProductions(modelRoot),
    listPrototypeCandidates(modelRoot),
  ]);
  if (!campaign) return null;
  const campaignProductions: WebIdeaLabProductionSummary[] = [];
  for (const production of productions.filter((item) => item.campaignId === campaignId)) {
    const run = await buildRunSummary(harnessRoot, production.runId);
    campaignProductions.push(toProductionView(production, run));
  }
  const campaignSummary: WebIdeaLabCampaignSummary = {
    id: campaign.id,
    seed: campaign.seed,
    status: campaign.status,
    targetReadyCount: campaign.targetReadyCount,
    readyCount: campaignProductions.filter((item) => item.status === "ready").length,
    productionCount: campaignProductions.length,
    productionConcurrency: campaign.productionConcurrency,
    ...(safeIdeaLabSummary(campaign.blockerSummary) ? { blockerSummary: safeIdeaLabSummary(campaign.blockerSummary) } : {}),
    createdAt: campaign.createdAt,
    updatedAt: campaign.updatedAt,
  };
  return {
    campaign: campaignSummary,
    productions: campaignProductions,
    prototypes: candidates
      .filter((candidate) => candidate.ideaLabOrigin?.campaignId === campaignId)
      .map(toPrototypeCard),
  };
}

export async function buildPrototypeDetail(
  modelRoot: string,
  harnessRoot: string,
  prototypeId: string,
): Promise<WebPrototypeDetail | null> {
  const candidate = await loadPrototypeCandidate(modelRoot, prototypeId);
  if (!candidate) return null;
  const runs: WebRunSummary[] = [];
  for (const runId of candidate.runIds) {
    const summary = await buildRunSummary(harnessRoot, runId);
    if (summary) runs.push(summary);
  }
  return {
    prototype: toPrototypeCard(candidate),
    runs,
    ...(candidate.ideaLabOrigin ? { origin: { ...candidate.ideaLabOrigin } } : {}),
  };
}

export async function buildProjectWorkspaceView(
  modelRoot: string,
  harnessRoot: string,
  projectId: string,
): Promise<ProjectWorkspaceView | null> {
  const workspace = await loadProjectWorkspace(modelRoot, projectId);
  if (!workspace) return null;

  const history = await loadProjectHistory(modelRoot, workspace.id);
  const runs: WebRunSummary[] = [];
  for (const runId of collectAttachedRunIds(workspace.tree)) {
    const summary = await buildRunSummary(harnessRoot, runId);
    if (summary) runs.push(summary);
  }

  return {
    project: {
      id: workspace.id,
      name: workspace.name,
      status: workspace.status,
      createdAt: workspace.createdAt,
      updatedAt: workspace.updatedAt,
    },
    genesis: toProjectGenesisView(workspace.genesis),
    tree: workspace.tree.map((node) => ({ ...node, runIds: [...node.runIds] })),
    history: history.map((event) => ({ ...event })),
    runs,
    ...(workspace.purposeSelection ? {
      purposeSelection: {
        purpose: workspace.purposeSelection.purpose,
        selectedAt: workspace.purposeSelection.selectedAt,
        source: workspace.purposeSelection.source,
        profile: structuredClone(workspace.purposeSelection.profile),
      },
      executionPlan: {
        purpose: workspace.purposeSelection.profile.purpose,
        executableRoles: [...workspace.purposeSelection.profile.executableRoles],
        plannedRoles: [...workspace.purposeSelection.profile.plannedRoles],
        verificationStages: [...workspace.purposeSelection.profile.verificationStages],
        documentationRequired: workspace.purposeSelection.profile.documentationRequired,
      },
    } : {}),
  };
}
function safeEvaluationText(value: string, maxLength = 240): string {
  return sanitizeCredentialText(value, maxLength)
    .replace(/\[redacted-url\]/gi, "[REDACTED]")
    .replace(/\[redacted\]/gi, "[REDACTED]");
}

function toEvaluationSummary(
  report: NonNullable<Awaited<ReturnType<typeof loadEvaluationReport>>>,
): WebEvaluationReportSummary {
  let passed = 0;
  let failed = 0;
  let blocked = 0;
  for (const scenario of report.scenarios) {
    if (scenario.status === "passed") passed += 1;
    else if (scenario.status === "blocked-external") blocked += 1;
    else failed += 1;
  }
  return {
    evaluationId: report.evaluationId,
    suiteId: report.suiteId,
    status: report.status,
    completedAt: report.completedAt,
    counts: { passed, failed, blocked },
    duplicateSideEffectCount: report.metrics.duplicateSideEffectCount,
    unexpectedMutationCount: report.metrics.unexpectedMutationCount,
    recoveryLatencyMs: report.metrics.recoveryLatencyMs,
    failedInvariantIds: report.invariants
      .filter((item) => item.status === "failed")
      .map((item) => item.id)
      .slice(0, 20),
    failedScenarios: report.scenarios
      .filter((item) => item.status !== "passed" && item.status !== "blocked-external")
      .slice(0, 25)
      .map((item) => ({
        scenarioId: item.scenarioId,
        evaluationId: item.evaluationId,
        seed: item.seed,
        status: item.status,
      })),
    liveBlockers: report.liveBlockers.slice(0, 10).map((item) => safeEvaluationText(item)),
  };
}
export async function buildEvaluationView(root: string): Promise<EvaluationView> {
  const reports = [];
  for (const name of await listEvaluationJsonFiles(evaluationDirectory(root, "reports"))) {
    const report = await loadEvaluationReport(root, name.slice(0, -5));
    if (report) reports.push(report);
  }
  reports.sort((a, b) => a.completedAt.localeCompare(b.completedAt) || a.evaluationId.localeCompare(b.evaluationId));
  const latestQuick = reports.filter((item) => item.suiteId === "quick-evaluation").at(-1) ?? null;
  const latestSoak = reports.filter((item) => item.suiteId === "soak-evaluation").at(-1) ?? null;
  return {
    quick: latestQuick ? toEvaluationSummary(latestQuick) : null,
    soak: latestSoak ? toEvaluationSummary(latestSoak) : null,
  };
}
