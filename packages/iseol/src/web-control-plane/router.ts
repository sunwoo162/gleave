import { resolve } from "node:path";
import { assertProjectModelId } from "../project-model/contracts.js";
import { defaultAgentRoleRegistrations, resolveExecutionProfile } from "../project-model/execution-profile.js";
import { loadProjectWorkspace, setProjectPurpose } from "../project-model/workspace-store.js";
import { createProjectWorkRequest, listProjectWorkRequests, claimProjectWorkRequest, loadProjectWorkRequest, updateProjectWorkRequest, executeProjectWorkRequest, projectWorkRequestRevision, reconcileProjectWorkRequest } from "../project-model/work-request.js";
import { loadHarnessRun } from "../harness/run-store.js";
import { prepareProjectWorkspaceRun, startProjectWorkspaceRun } from "../project-model/workspace-run-preparation.js";
import { buildPortfolioDraft, collectProjectEvidence, verifyPortfolioGrounding } from "../project-model/portfolio.js";
import { ensurePortfolioDocument, updatePortfolioDocument, verifyStoredPortfolioGrounding } from "../project-model/portfolio-store.js";
import { archivePrototypeCandidate } from "../idea-lab/prototype-actions.js";
import { recordPrototypeBrowserAcceptance } from "../project-model/prototype-store.js";
import { PROTOTYPE_BROWSER_ACCEPTANCE_CHECKS, type PrototypeBrowserAcceptanceCheck } from "../project-model/contracts.js";
import { promotePrototype } from "../project-model/promotion.js";
import {
  cancelWebIdeaLabCampaign,
  createWebIdeaLabCampaign,
  WebIdeaLabActionError,
} from "./idea-lab-actions.js";
import {
  buildEvaluationView,
  buildIdeaLabView,
  buildIdeaLabCampaignDetail,
  buildPrototypeDetail,
  buildProjectWorkspaceView,
  buildProjectWorkspaceListView,
} from "./view-model.js";
import type { OperatorReconciliationReason } from "../harness/operator-reconciliation.js";
import type { OperatorApproval } from "../harness/operator-approval-store.js";
import type { WebProductEventBus } from "./event-bus.js";
import { sanitizeCredentialText } from "../security/text-safety.js";

export type WebControlPlaneRequest = {
  method: string;
  path: string;
  rawPath?: string;
  headers: Record<string, string | undefined>;
  body?: unknown;
};

export type WebControlPlaneResponse = {
  status: number;
  headers: Record<string, string>;
  body: unknown;
};

export type IdeaLabRuntimeCapability = {
  state: "disabled" | "ready" | "blocked";
  enqueue?: (campaignId: string) => void;
  retryRun?: (runId: string) => Promise<"accepted" | "already-active" | "not-allowed">;
  enqueueProjectRun?: (runId: string) => Promise<"accepted" | "already-active" | "not-configured">;
  retryProjectRun?: (input: { projectId: string; runId: string }) => Promise<"accepted" | "already-active" | "not-allowed">;
  inspectProjectRunReconciliation?: (input: { projectId: string; runId: string; expectedRevision: string }) => Promise<unknown>;
  reconcileProjectRun?: (input: {
    projectId: string; runId: string; expectedRevision: string; operationId: string;
    reason: OperatorReconciliationReason; actor: "operator"; approvalId: string; at: string;
  }) => Promise<unknown>;
  issueProjectRunOperatorApproval?: (input: {
    projectId: string; runId: string; requestId: string; expectedRevision: string;
    reason: OperatorReconciliationReason; at: string; expiresAt: string; issuedBy: string;
  }) => Promise<OperatorApproval | { status: "rejected"; reason: string }>;
  inspectDesktopJobReconciliation?: (input: { projectId: string; jobId: string; now: string }) => Promise<unknown>;
  issueDesktopJobContainmentApproval?: (input: { projectId: string; jobId: string; requestId: string; expectedRevision: string; at: string; expiresAt: string; issuedBy: string }) => Promise<unknown>;
  containDesktopJob?: (input: { projectId: string; jobId: string; expectedRevision: string; operationId: string; approvalId: string; at: string; actor: "operator" }) => Promise<unknown>;
};

export type WebControlPlaneRouterDependencies = {
  modelRoot: string;
  harnessRoot: string;
  projectModelRoot?: string;
  projectHarnessRoot?: string;
  iseolRoot?: string;
  policyRoot?: string;
  evaluationRoot?: string;
  token?: string;
  operatorToken?: string;
  operatorId?: string;
  now?: () => string;
  campaignIdFactory?: () => string;
  ideaLabRuntime?: IdeaLabRuntimeCapability;
  eventBus?: WebProductEventBus;
};

const JSON_HEADERS = { "content-type": "application/json; charset=utf-8" };

function response(status: number, body: unknown): WebControlPlaneResponse {
  return { status, headers: JSON_HEADERS, body };
}
function decodeId(value: string): string | null {
  try {
    const decoded = decodeURIComponent(value);
    if (decoded.includes("/") || decoded.includes("\\")) return null;
    assertProjectModelId(decoded);
    return decoded;
  } catch {
    return null;
  }
}

function bearerToken(headers: Record<string, string | undefined>): string | null {
  const authorization = headers.authorization;
  if (!authorization?.startsWith("Bearer ")) return null;
  const token = authorization.slice("Bearer ".length).trim();
  return token.length > 0 ? token : null;
}

function mutationAuthorized(
  request: WebControlPlaneRequest,
  configuredToken: string | undefined,
): boolean {
  if (!configuredToken) return true;
  return bearerToken(request.headers) === configuredToken;
}

function operatorAuthorized(request: WebControlPlaneRequest, configuredToken: string | undefined): boolean {
  return Boolean(configuredToken) && bearerToken(request.headers) === configuredToken;
}

function methodNotAllowed(): WebControlPlaneResponse {
  return response(405, { error: "method not allowed" });
}
export async function routeWebControlPlaneRequest(
  request: WebControlPlaneRequest,
  deps: WebControlPlaneRouterDependencies,
): Promise<WebControlPlaneResponse> {
  const path = request.path.split("?", 1)[0] ?? request.path;
  const rawPathname = (request.rawPath ?? request.path).split("?", 1)[0] ?? "";
  const isProjectPath = path === "/api/projects" || path.startsWith("/api/projects/");
  if (isProjectPath && rawPathname.includes("\\")) return response(404, { error: "project route not found" });
  const projectModelRoot = deps.projectModelRoot ?? deps.modelRoot;
  const projectHarnessRoot = deps.projectHarnessRoot ?? deps.harnessRoot;

  const workListMatch = /^\/api\/projects\/([^/]+)\/work-requests$/.exec(path);
  if (workListMatch) {
    const projectId = decodeId(workListMatch[1] ?? "");
    if (!projectId) return response(404, { error: "not found" });
    if (!await loadProjectWorkspace(projectModelRoot, projectId)) return response(404, { error: "not found" });
    if (request.method === "GET") return response(200, { requests: await listProjectWorkRequests(projectModelRoot, projectId) });
    if (request.method !== "POST") return methodNotAllowed();
    if (!mutationAuthorized(request, deps.token)) return response(401, { error: "unauthorized" });
    if (!request.body || typeof request.body !== "object") return response(400, { error: "invalid work request" });
    const body = request.body as Record<string, unknown>;
    if (typeof body.title !== "string" || typeof body.objective !== "string" || typeof body.idempotencyKey !== "string") return response(400, { error: "title, objective and idempotencyKey are required" });
    try {
      if (body.dependencies !== undefined && (!Array.isArray(body.dependencies) || !body.dependencies.every((item): item is string => typeof item === "string"))) return response(400, { error: "dependencies must be an array of work request ids" });
      const dependencies = Array.isArray(body.dependencies) ? body.dependencies : undefined;
      const result = await createProjectWorkRequest({ root: projectModelRoot, projectId, title: body.title, objective: body.objective, idempotencyKey: body.idempotencyKey, ...(typeof body.nodeId === "string" ? { nodeId: body.nodeId } : {}), ...(dependencies ? { dependencies } : {}), at: (deps.now ?? (() => new Date().toISOString()))() });
      deps.eventBus?.publish({ type: "work-request.created", scope: { projectId }, payload: { projectId, workRequestId: result.request.id, status: result.request.status } });
      return response(result.created ? 201 : 200, result.request);
    } catch (error) {
      if (error instanceof Error && error.message.includes("idempotency conflict")) return response(409, { error: sanitizeCredentialText(error.message, 240) });
      if (error instanceof Error && /dependency/.test(error.message)) return response(409, { error: sanitizeCredentialText(error.message, 240) });
      throw error;
    }
  }

  const workExecuteMatch = /^\/api\/projects\/([^/]+)\/work-requests\/([^/]+)\/execute$/.exec(path);
  if (workExecuteMatch) {
    if (request.method !== "POST") return methodNotAllowed();
    if (!mutationAuthorized(request, deps.token)) return response(401, { error: "unauthorized" });
    const projectId = decodeId(workExecuteMatch[1] ?? "");
    const workId = decodeId(workExecuteMatch[2] ?? "");
    if (!projectId || !workId || !await loadProjectWorkspace(projectModelRoot, projectId)) return response(404, { error: "not found" });
    if (!request.body || typeof request.body !== "object") return response(400, { error: "runId, objective and targetRoot are required" });
    const body = request.body as Record<string, unknown>;
    if (typeof body.runId !== "string" || typeof body.targetRoot !== "string") return response(400, { error: "runId and targetRoot are required" });
    const at = (deps.now ?? (() => new Date().toISOString()))();
    const result = await executeProjectWorkRequest({
      root: projectModelRoot, projectId, id: workId, runId: body.runId as string, at,
      execute: async (workRequest) => {
        const started = await startProjectWorkspaceRun(projectModelRoot, projectId, { runId: body.runId as string, objective: workRequest.objective, targetRoot: body.targetRoot as string }, {
          iseolRoot: deps.iseolRoot ?? deps.modelRoot, storeRoot: projectHarnessRoot,
          ...(deps.policyRoot ? { policyRoot: deps.policyRoot } : {}), loadedAt: at,
        });
        const execution = deps.ideaLabRuntime?.enqueueProjectRun
          ? await deps.ideaLabRuntime.enqueueProjectRun(started.run.request.runId)
          : "not-configured" as const;
        return { runId: started.run.request.runId, status: execution === "accepted" ? "created" as const : execution === "already-active" ? "already-active" as const : "not-configured" as const };
      },
    });
    if (result.request) deps.eventBus?.publish({ type: "work-request.updated", scope: { projectId, runId: result.runId }, payload: { projectId, workRequestId: result.request.id, status: result.request.status, runId: result.runId, blocker: result.blocker } });
    const status = result.status === "started" ? 202 : result.status === "waiting" ? 409 : result.status === "failed" ? 502 : 200;
    return response(status, result);
  }

  const workReconcileMatch = /^\/api\/projects\/([^/]+)\/work-requests\/([^/]+)\/reconciliation$/.exec(path);
  if (workReconcileMatch) {
    if (request.method !== "GET") return methodNotAllowed();
    const projectId = decodeId(workReconcileMatch[1] ?? "");
    const workId = decodeId(workReconcileMatch[2] ?? "");
    if (!projectId || !workId) return response(404, { error: "not found" });
    const inspection = await reconcileProjectWorkRequest({ root: projectModelRoot, projectId, workId, at: (deps.now ?? (() => new Date().toISOString()))(), findRun: async (runId) => {
      const run = await loadHarnessRun(projectHarnessRoot, runId);
      return run ? { runId, projectId: run.request.projectId, state: run.state, updatedAt: run.updatedAt } : null;
    }});
    return inspection ? response(200, inspection) : response(404, { error: "not found" });
  }

  const workRetryMatch = /^\/api\/projects\/([^/]+)\/work-requests\/([^/]+)\/retry$/.exec(path);
  if (workRetryMatch) {
    if (request.method !== "POST") return methodNotAllowed();
    if (!operatorAuthorized(request, deps.operatorToken)) return response(401, { error: "operator authorization required" });
    const projectId = decodeId(workRetryMatch[1] ?? "");
    const workId = decodeId(workRetryMatch[2] ?? "");
    if (!projectId || !workId || !await loadProjectWorkspace(projectModelRoot, projectId)) return response(404, { error: "not found" });
    if (!request.body || typeof request.body !== "object") return response(400, { error: "expectedRevision and runId are required" });
    const body = request.body as Record<string, unknown>;
    if (typeof body.expectedRevision !== "string" || typeof body.runId !== "string") return response(400, { error: "expectedRevision and runId are required" });
    const current = await loadProjectWorkRequest(projectModelRoot, projectId, workId);
    if (!current) return response(404, { error: "not found" });
    if (projectWorkRequestRevision(current) !== body.expectedRevision) return response(409, { error: "work request revision is stale" });
    if (current.status !== "failed" || !current.requestedRunId || !current.runId) return response(409, { error: `work request is ${current.status}; only a failed request with a durable Run can be retried` });
    if (current.requestedRunId !== body.runId || current.runId !== body.runId) return response(409, { error: "retry Run identity does not match the durable work request" });
    const run = await loadHarnessRun(projectHarnessRoot, body.runId);
    if (!run || run.request.projectId !== projectId || run.request.mode !== "project-workspace") return response(409, { error: "retry Run is missing or belongs to another project" });
    if (!deps.ideaLabRuntime?.retryProjectRun) return response(503, { error: "project Runtime retry is unavailable" });
    const execution = await deps.ideaLabRuntime.retryProjectRun({ projectId, runId: body.runId });
    if (execution === "not-allowed") return response(409, { error: "project Run is not eligible for operator retry" });
    const at = (deps.now ?? (() => new Date().toISOString()))();
    const updated = await updateProjectWorkRequest(projectModelRoot, projectId, workId, {
      status: "running",
      runId: body.runId,
      requestedRunId: body.runId,
      executionRequestId: `${projectId}:${workId}:${body.runId}`,
      blocker: undefined,
    }, at);
    if (!updated) return response(404, { error: "work request not found" });
    deps.eventBus?.publish({ type: "work-request.updated", scope: { projectId, runId: body.runId }, payload: { projectId, workRequestId: workId, status: updated.status, runId: body.runId, actor: "operator" } });
    return response(execution === "accepted" ? 202 : 200, { status: execution === "accepted" ? "started" : "already-active", request: updated, runId: body.runId });
  }

  const workResumeMatch = /^\/api\/projects\/([^/]+)\/work-requests\/([^/]+)\/resume$/.exec(path);
  if (workResumeMatch) {
    if (request.method !== "POST") return methodNotAllowed();
    if (!mutationAuthorized(request, deps.token)) return response(401, { error: "unauthorized" });
    const projectId = decodeId(workResumeMatch[1] ?? "");
    const workId = decodeId(workResumeMatch[2] ?? "");
    if (!projectId || !workId || !await loadProjectWorkspace(projectModelRoot, projectId)) return response(404, { error: "not found" });
    if (!request.body || typeof request.body !== "object") return response(400, { error: "expectedRevision, runId and targetRoot are required" });
    const body = request.body as Record<string, unknown>;
    if (typeof body.expectedRevision !== "string" || typeof body.runId !== "string" || typeof body.targetRoot !== "string") {
      return response(400, { error: "expectedRevision, runId and targetRoot are required" });
    }
    const resumeRunId = body.runId;
    const resumeTargetRoot = body.targetRoot;
    const current = await loadProjectWorkRequest(projectModelRoot, projectId, workId);
    if (!current) return response(404, { error: "not found" });
    if (projectWorkRequestRevision(current) !== body.expectedRevision) return response(409, { error: "work request revision is stale" });
    if (current.status === "running") return response(409, { error: current.requestedRunId ? "work request is already running; inspect the linked Run" : "work request has no durable Run identity" });
    if (current.status !== "queued" && current.status !== "waiting") return response(409, { error: `work request is ${current.status}` });
    if (current.status === "waiting" && current.requestedRunId !== resumeRunId) return response(409, { error: "waiting work request must resume its existing Run identity" });

    const at = (deps.now ?? (() => new Date().toISOString()))();
    try {
      const result = current.status === "queued"
        ? await executeProjectWorkRequest({
            root: projectModelRoot, projectId, id: workId, runId: resumeRunId, at,
          execute: async (workRequest) => {
            const started = await startProjectWorkspaceRun(projectModelRoot, projectId, { runId: resumeRunId, objective: workRequest.objective, targetRoot: resumeTargetRoot }, {
              iseolRoot: deps.iseolRoot ?? deps.modelRoot, storeRoot: projectHarnessRoot,
              ...(deps.policyRoot ? { policyRoot: deps.policyRoot } : {}), loadedAt: at,
            });
            const execution = deps.ideaLabRuntime?.enqueueProjectRun
              ? await deps.ideaLabRuntime.enqueueProjectRun(started.run.request.runId)
              : "not-configured" as const;
            return { runId: started.run.request.runId, status: execution === "accepted" ? "created" as const : execution === "already-active" ? "already-active" as const : "not-configured" as const };
          },
        })
        : await (async () => {
          const started = await startProjectWorkspaceRun(projectModelRoot, projectId, { runId: resumeRunId, objective: current.objective, targetRoot: resumeTargetRoot }, {
            iseolRoot: deps.iseolRoot ?? deps.modelRoot, storeRoot: projectHarnessRoot,
            ...(deps.policyRoot ? { policyRoot: deps.policyRoot } : {}), loadedAt: at,
          });
          const execution = deps.ideaLabRuntime?.enqueueProjectRun
            ? await deps.ideaLabRuntime.enqueueProjectRun(started.run.request.runId)
            : "not-configured" as const;
          const updated = await updateProjectWorkRequest(projectModelRoot, projectId, workId, {
            status: execution === "accepted" || execution === "already-active" ? "running" : "waiting",
            runId: started.run.request.runId,
            requestedRunId: started.run.request.runId,
            blocker: execution === "not-configured" ? "Project Runtime is not configured" : undefined,
          }, at);
          return {
            status: execution === "not-configured" ? "waiting" as const : "already-active" as const,
            request: updated ?? current,
            runId: started.run.request.runId,
            ...(execution === "not-configured" ? { blocker: "Project Runtime is not configured" } : {}),
          };
        })();
      if (result.request) deps.eventBus?.publish({ type: "work-request.updated", scope: { projectId, runId: result.runId }, payload: { projectId, workRequestId: result.request.id, status: result.request.status, runId: result.runId, blocker: result.blocker } });
      return response(result.status === "started" ? 202 : result.status === "waiting" ? 409 : 200, result);
    } catch (error) {
      if (error instanceof Error && /workspace not found|Harness Run not found|Run identity|project folder/.test(error.message)) return response(409, { error: sanitizeCredentialText(error.message, 240) });
      throw error;
    }
  }

  const workActionMatch = /^\/api\/projects\/([^/]+)\/work-requests\/([^/]+)\/(claim|cancel)$/.exec(path);
  if (workActionMatch) {
    if (request.method !== "POST") return methodNotAllowed();
    if (!mutationAuthorized(request, deps.token)) return response(401, { error: "unauthorized" });
    const projectId = decodeId(workActionMatch[1] ?? "");
    const workId = decodeId(workActionMatch[2] ?? "");
    if (!projectId || !workId) return response(404, { error: "not found" });
    const at = (deps.now ?? (() => new Date().toISOString()))();
    let result;
    if (workActionMatch[3] === "claim") {
      result = await claimProjectWorkRequest(projectModelRoot, projectId, workId, at);
    } else {
      const current = await loadProjectWorkRequest(projectModelRoot, projectId, workId);
      if (!current) return response(404, { error: "not found" });
      if (current.status !== "queued") return response(409, { error: "only queued work requests can be cancelled; inspect the linked Run" });
      result = await updateProjectWorkRequest(projectModelRoot, projectId, workId, { status: "cancelled" }, at);
    }
    if (!result) return response(404, { error: "not found or not claimable" });
    deps.eventBus?.publish({ type: "work-request.updated", scope: { projectId, runId: result.runId }, payload: { projectId, workRequestId: result.id, status: result.status, runId: result.runId } });
    return response(200, result);
  }

  if (path === "/api/evaluation") {
    if (request.method !== "GET") return methodNotAllowed();
    const configuredRoot = process.env.ISEOL_EVALUATION_ROOT?.trim();
    const evaluationRoot = deps.evaluationRoot
      ?? (configuredRoot ? resolve(configuredRoot) : resolve(process.cwd(), "data", "iseol-evaluation"));
    return response(200, await buildEvaluationView(evaluationRoot));
  }

  if (path === "/api/idea-lab") {
    if (request.method !== "GET") return methodNotAllowed();
    return response(200, await buildIdeaLabView(deps.modelRoot, deps.harnessRoot));
  }

  if (path === "/api/idea-lab/campaigns") {
    if (request.method !== "POST") return methodNotAllowed();
    if (!mutationAuthorized(request, deps.token)) return response(401, { error: "unauthorized" });
    if (deps.ideaLabRuntime?.state === "blocked") return response(503, { error: "idea lab runtime unavailable" });
    try {
      const campaign = await createWebIdeaLabCampaign({
        root: deps.modelRoot, body: request.body ?? {},
        at: (deps.now ?? (() => new Date().toISOString()))(), idFactory: deps.campaignIdFactory,
      });
      if (deps.ideaLabRuntime?.state === "ready") deps.ideaLabRuntime.enqueue?.(campaign.id);
      deps.eventBus?.publish({ type: "campaign.created", scope: { campaignId: campaign.id }, payload: { campaignId: campaign.id, status: campaign.status } });
      return response(201, campaign);
    } catch (error) {
      if (error instanceof WebIdeaLabActionError) return response(error.status, { error: sanitizeCredentialText(error.message, 240) });
      throw error;
    }
  }

  if (path === "/api/execution-profile") {
    if (request.method !== "POST") return methodNotAllowed();
    if (!mutationAuthorized(request, deps.token)) return response(401, { error: "unauthorized" });
    const body = request.body;
    if (!body || typeof body !== "object") return response(400, { error: "purpose and objective are required" });
    const purpose = (body as Record<string, unknown>).purpose;
    const objective = (body as Record<string, unknown>).objective;
    if (typeof purpose !== "string" || typeof objective !== "string") {
      return response(400, { error: "purpose and objective are required" });
    }
    try {
      return response(200, resolveExecutionProfile({
        purpose: purpose as Parameters<typeof resolveExecutionProfile>[0]["purpose"],
        objective,
        roles: defaultAgentRoleRegistrations(),
      }));
    } catch {
      return response(400, { error: "invalid execution profile" });
    }
  }

  const portfolioMatch = /^\/api\/projects\/([^/]+)\/portfolio$/.exec(path);
  if (portfolioMatch) {
    const projectId = decodeId(portfolioMatch[1] ?? "");
    if (!projectId) return response(404, { error: "not found" });
    if (request.method === "PUT") {
      if (!mutationAuthorized(request, deps.token)) return response(401, { error: "unauthorized" });
      if (!request.body || typeof request.body !== "object") return response(400, { error: "invalid portfolio update" });
      try {
        return response(200, { document: await updatePortfolioDocument(projectModelRoot, projectId, request.body as { sections?: Array<{ id: string; content: string; included: boolean }>; readme?: string }, (deps.now ?? (() => new Date().toISOString()))()) });
      } catch (error) {
        if (error instanceof Error && error.message.startsWith("Portfolio document not found:")) return response(404, { error: "not found" });
        if (error instanceof Error && /Invalid portfolio/.test(error.message)) return response(400, { error: "invalid portfolio update" });
        throw error;
      }
    }
    if (request.method !== "GET") return methodNotAllowed();
    try {
      const evidence = await collectProjectEvidence(projectModelRoot, projectHarnessRoot, projectId);
      const draft = buildPortfolioDraft(evidence, (deps.now ?? (() => new Date().toISOString()))());
      const document = await ensurePortfolioDocument(projectModelRoot, draft, (deps.now ?? (() => new Date().toISOString()))());
      const generatedGrounding = verifyPortfolioGrounding(draft, evidence);
      const documentGrounding = verifyStoredPortfolioGrounding(document, new Set(evidence.evidence.map((item) => item.id)));
      return response(200, { draft, document, evidence: evidence.evidence, grounding: { ...generatedGrounding, documentGrounded: documentGrounding.grounded, needsReview: documentGrounding.needsReview } });
    } catch (error) {
      if (error instanceof Error && error.message.startsWith("Project workspace not found:")) return response(404, { error: "not found" });
      throw error;
    }
  }

  const purposeMatch = /^\/api\/projects\/([^/]+)\/purpose$/.exec(path);
  if (purposeMatch) {
    if (request.method !== "PUT") return methodNotAllowed();
    if (!mutationAuthorized(request, deps.token)) return response(401, { error: "unauthorized" });
    const projectId = decodeId(purposeMatch[1] ?? "");
    if (!projectId || !request.body || typeof request.body !== "object") return response(400, { error: "invalid project purpose" });
    const body = request.body as Record<string, unknown>;
    if (typeof body.purpose !== "string" || typeof body.objective !== "string") return response(400, { error: "purpose and objective are required" });
    try {
      const profile = resolveExecutionProfile({
        purpose: body.purpose as Parameters<typeof resolveExecutionProfile>[0]["purpose"],
        objective: body.objective,
        roles: defaultAgentRoleRegistrations(),
      });
      const selectedAt = (deps.now ?? (() => new Date().toISOString()))();
      await setProjectPurpose(projectModelRoot, projectId, profile, selectedAt, "user");
      const view = await buildProjectWorkspaceView(projectModelRoot, projectHarnessRoot, projectId);
      deps.eventBus?.publish({ type: "project.updated", scope: { projectId }, payload: { projectId, change: "purpose" } });
      return view ? response(200, view) : response(404, { error: "not found" });
    } catch (error) {
      if (error instanceof Error && error.message.startsWith("Project workspace not found:")) return response(404, { error: "not found" });
      if (error instanceof Error && /purpose|objective|Unsupported/.test(error.message)) return response(400, { error: "invalid project purpose" });
      throw error;
    }
  }

  const preparationMatch = /^\/api\/projects\/([^/]+)\/execution-preparation$/.exec(path);
  if (preparationMatch) {
    if (request.method !== "POST") return methodNotAllowed();
    if (!mutationAuthorized(request, deps.token)) return response(401, { error: "unauthorized" });
    const projectId = decodeId(preparationMatch[1] ?? "");
    if (!projectId || !request.body || typeof request.body !== "object") return response(400, { error: "invalid execution preparation" });
    const body = request.body as Record<string, unknown>;
    if (typeof body.runId !== "string" || typeof body.objective !== "string" || typeof body.targetRoot !== "string") {
      return response(400, { error: "runId, objective and targetRoot are required" });
    }
    try {
      return response(200, await prepareProjectWorkspaceRun(projectModelRoot, projectId, {
        runId: body.runId,
        objective: body.objective,
        targetRoot: body.targetRoot,
      }));
    } catch (error) {
      if (error instanceof Error && error.message.startsWith("Project workspace not found:")) return response(404, { error: "not found" });
      if (error instanceof Error && error.message.includes("purpose must be selected")) return response(409, { error: "project purpose must be selected" });
      throw error;
    }
  }

  const campaignDetailMatch = /^\/api\/idea-lab\/campaigns\/([^/]+)$/.exec(path);
  if (campaignDetailMatch) {
    if (request.method !== "GET") return methodNotAllowed();
    const campaignId = decodeId(campaignDetailMatch[1] ?? "");
    if (!campaignId) return response(404, { error: "not found" });
    const detail = await buildIdeaLabCampaignDetail(deps.modelRoot, deps.harnessRoot, campaignId);
    return detail ? response(200, detail) : response(404, { error: "not found" });
  }

  const startMatch = /^\/api\/projects\/([^/]+)\/execution-start$/.exec(path);
  if (startMatch) {
    if (request.method !== "POST") return methodNotAllowed();
    if (!mutationAuthorized(request, deps.token)) return response(401, { error: "unauthorized" });
    const projectId = decodeId(startMatch[1] ?? "");
    if (!projectId || !request.body || typeof request.body !== "object") return response(400, { error: "invalid execution start" });
    const body = request.body as Record<string, unknown>;
    if (typeof body.runId !== "string" || typeof body.objective !== "string" || typeof body.targetRoot !== "string") {
      return response(400, { error: "runId, objective and targetRoot are required" });
    }
    try {
      const started = await startProjectWorkspaceRun(projectModelRoot, projectId, {
        runId: body.runId,
        objective: body.objective,
        targetRoot: body.targetRoot,
      }, {
        iseolRoot: deps.iseolRoot ?? deps.modelRoot,
        storeRoot: projectHarnessRoot,
        ...(deps.policyRoot ? { policyRoot: deps.policyRoot } : {}),
        loadedAt: (deps.now ?? (() => new Date().toISOString()))(),
      });
      const execution = deps.ideaLabRuntime?.enqueueProjectRun
        ? await deps.ideaLabRuntime.enqueueProjectRun(started.run.request.runId)
        : undefined;
      if (typeof body.workRequestId === "string") {
        const workRequestPatch = execution === "accepted" || execution === "already-active"
          ? { status: "running" as const, runId: started.run.request.runId, blocker: undefined }
          : { status: "waiting" as const, runId: started.run.request.runId, blocker: "Project Runtime is not configured" };
        const linked = await updateProjectWorkRequest(projectModelRoot, projectId, body.workRequestId, workRequestPatch, (deps.now ?? (() => new Date().toISOString()))());
        if (!linked) return response(404, { error: "work request not found" });
        deps.eventBus?.publish({ type: "work-request.updated", scope: { projectId, runId: started.run.request.runId }, payload: { projectId, workRequestId: linked.id, runId: linked.runId, status: linked.status, blocker: linked.blocker } });
      }
      deps.eventBus?.publish({ type: "run.updated", scope: { projectId, runId: started.run.request.runId }, payload: { projectId, runId: started.run.request.runId, status: started.status } });
      return response(started.status === "created" ? 201 : 200, {
        ...started,
        ...(execution ? { execution } : {}),
      });
    } catch (error) {
      if (error instanceof Error && error.message.startsWith("Project workspace not found:")) return response(404, { error: "not found" });
      if (error instanceof Error && /purpose|root node|terminal|identity|request does not match/.test(error.message)) return response(409, { error: sanitizeCredentialText(error.message, 240) });
      throw error;
    }
  }

  const reconcileMatch = /^\/api\/projects\/([^/]+)\/runs\/([^/]+)\/operator-reconciliation$/.exec(path);
  if (reconcileMatch) {
    if (request.method !== "POST") return methodNotAllowed();
    if (!mutationAuthorized(request, deps.token) && !operatorAuthorized(request, deps.operatorToken)) return response(401, { error: "unauthorized" });
    const projectId = decodeId(reconcileMatch[1] ?? "");
    const runId = decodeId(reconcileMatch[2] ?? "");
    if (!projectId || !runId || !request.body || typeof request.body !== "object") return response(400, { error: "invalid reconciliation request" });
    const body = request.body as Record<string, unknown>;
    if (typeof body.expectedRevision !== "string") return response(400, { error: "expectedRevision is required" });
    const action = body.action === "inspect" ? "inspect" : body.action === "apply" ? "apply" : null;
    if (!action) return response(400, { error: "action must be inspect or apply" });
    try {
      if (action === "inspect") {
        if (!deps.ideaLabRuntime?.inspectProjectRunReconciliation) return response(503, { error: "project runtime unavailable" });
        return response(200, await deps.ideaLabRuntime.inspectProjectRunReconciliation({ projectId, runId, expectedRevision: body.expectedRevision }));
      }
      if (!operatorAuthorized(request, deps.operatorToken)) return response(403, { error: "operator approval is unavailable" });
      if (!deps.ideaLabRuntime?.reconcileProjectRun) return response(503, { error: "project runtime unavailable" });
      const approval = body.approval;
      if (!approval || typeof approval !== "object") return response(403, { error: "operator approval is required" });
      const approvalRecord = approval as Record<string, unknown>;
      if (approvalRecord.actor !== "operator" || typeof approvalRecord.approvalId !== "string") return response(403, { error: "operator approval is required" });
      if (typeof body.operationId !== "string" || !["stale-runtime-after-shutdown", "operator-confirmed-no-active-work"].includes(String(body.reason))) {
        return response(400, { error: "operationId and bounded reason are required" });
      }
      return response(200, await deps.ideaLabRuntime.reconcileProjectRun({
        projectId, runId, expectedRevision: body.expectedRevision, operationId: body.operationId,
        reason: body.reason as OperatorReconciliationReason, actor: "operator", approvalId: approvalRecord.approvalId,
        at: (deps.now ?? (() => new Date().toISOString()))(),
      }));
    } catch (error) {
      if (error instanceof Error && /not found|project mismatch/.test(error.message)) return response(404, { error: "not found" });
      throw error;
    }
  }

  const approvalMatch = /^\/api\/projects\/([^/]+)\/runs\/([^/]+)\/operator-approvals$/.exec(path);
  if (approvalMatch) {
    if (request.method !== "POST") return methodNotAllowed();
    if (!deps.operatorId) return response(401, { error: "operator identity is unavailable" });
    if (!operatorAuthorized(request, deps.operatorToken)) return response(403, { error: "operator approval is unavailable" });
    const projectId = decodeId(approvalMatch[1] ?? "");
    const runId = decodeId(approvalMatch[2] ?? "");
    if (!projectId || !runId || !request.body || typeof request.body !== "object") return response(400, { error: "invalid approval request" });
    const body = request.body as Record<string, unknown>;
    if (typeof body.requestId !== "string" || typeof body.expectedRevision !== "string" || !["stale-runtime-after-shutdown", "operator-confirmed-no-active-work"].includes(String(body.reason))) {
      return response(400, { error: "requestId, expectedRevision and bounded reason are required" });
    }
    if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(body.requestId)) return response(400, { error: "requestId is invalid" });
    if (!deps.ideaLabRuntime?.issueProjectRunOperatorApproval) return response(503, { error: "project runtime unavailable" });
    const now = (deps.now ?? (() => new Date().toISOString()))();
    const ttlMs = typeof body.ttlMs === "number" && Number.isInteger(body.ttlMs) ? body.ttlMs : 300_000;
    if (ttlMs <= 0 || ttlMs > 900_000) return response(400, { error: "ttlMs must be between 1 and 900000" });
    const issued = await deps.ideaLabRuntime.issueProjectRunOperatorApproval({
      projectId, runId, requestId: body.requestId, expectedRevision: body.expectedRevision,
      reason: body.reason as OperatorReconciliationReason, at: now,
      expiresAt: new Date(Date.parse(now) + ttlMs).toISOString(), issuedBy: deps.operatorId,
    });
    return response("status" in issued && issued.status === "rejected" ? 409 : 201, issued);
  }

  const desktopJobReconcileMatch = /^\/api\/projects\/([^/]+)\/desktop-jobs\/([A-Za-z0-9][A-Za-z0-9._-]{0,127})\/operator-reconciliation$/.exec(path);
  if (desktopJobReconcileMatch) {
    if (request.method !== "POST") return methodNotAllowed();
    if (!operatorAuthorized(request, deps.operatorToken)) return response(403, { error: "operator approval is unavailable" });
    const projectId = decodeId(desktopJobReconcileMatch[1] ?? "");
    const jobId = desktopJobReconcileMatch[2] ?? "";
    if (!projectId || !request.body || typeof request.body !== "object") return response(400, { error: "invalid desktop reconciliation request" });
    if (!deps.ideaLabRuntime?.inspectDesktopJobReconciliation) return response(503, { error: "project runtime unavailable" });
    const body = request.body as Record<string, unknown>;
    if (body.action === "inspect") {
      return response(200, await deps.ideaLabRuntime.inspectDesktopJobReconciliation({ projectId, jobId, now: (deps.now ?? (() => new Date().toISOString()))() }));
    }
    if (body.action !== "contain" || typeof body.expectedRevision !== "string" || typeof body.operationId !== "string" || typeof body.approvalId !== "string") {
      return response(400, { error: "contain action requires expectedRevision, operationId and approvalId" });
    }
    if (!deps.ideaLabRuntime.containDesktopJob) return response(503, { error: "project runtime unavailable" });
    return response(200, await deps.ideaLabRuntime.containDesktopJob({
      projectId, jobId, expectedRevision: body.expectedRevision, operationId: body.operationId,
      approvalId: body.approvalId, at: (deps.now ?? (() => new Date().toISOString()))(), actor: "operator",
    }));
  }

  const desktopJobApprovalMatch = /^\/api\/projects\/([^/]+)\/desktop-jobs\/([A-Za-z0-9][A-Za-z0-9._-]{0,127})\/operator-approvals$/.exec(path);
  if (desktopJobApprovalMatch) {
    if (request.method !== "POST") return methodNotAllowed();
    if (!deps.operatorId || !operatorAuthorized(request, deps.operatorToken)) return response(403, { error: "operator approval is unavailable" });
    const projectId = decodeId(desktopJobApprovalMatch[1] ?? "");
    const jobId = desktopJobApprovalMatch[2] ?? "";
    if (!projectId || !request.body || typeof request.body !== "object") return response(400, { error: "invalid desktop approval request" });
    const body = request.body as Record<string, unknown>;
    if (typeof body.requestId !== "string" || typeof body.expectedRevision !== "string") return response(400, { error: "requestId and expectedRevision are required" });
    if (!deps.ideaLabRuntime?.issueDesktopJobContainmentApproval) return response(503, { error: "project runtime unavailable" });
    const now = (deps.now ?? (() => new Date().toISOString()))();
    const ttlMs = typeof body.ttlMs === "number" && Number.isInteger(body.ttlMs) ? body.ttlMs : 300_000;
    if (ttlMs <= 0 || ttlMs > 900_000) return response(400, { error: "ttlMs must be between 1 and 900000" });
    const issued = await deps.ideaLabRuntime.issueDesktopJobContainmentApproval({
      projectId, jobId, requestId: body.requestId, expectedRevision: body.expectedRevision, at: now,
      expiresAt: new Date(Date.parse(now) + ttlMs).toISOString(), issuedBy: deps.operatorId,
    });
    return response("status" in (issued as Record<string, unknown>) && (issued as Record<string, unknown>).status === "rejected" ? 409 : 201, issued);
  }

  if (path === "/api/projects") {
    if (request.method !== "GET") return methodNotAllowed();
    if (!mutationAuthorized(request, deps.token)) return response(401, { error: "unauthorized" });
    return response(200, await buildProjectWorkspaceListView(projectModelRoot));
  }

  const projectMatch = /^\/api\/projects\/([^/]+)$/.exec(path);
  if (projectMatch) {
    if (request.method !== "GET") return methodNotAllowed();
    if (!mutationAuthorized(request, deps.token)) return response(401, { error: "unauthorized" });
    const projectId = decodeId(projectMatch[1] ?? "");
    if (!projectId) return response(404, { error: "not found" });
    const view = await buildProjectWorkspaceView(
      projectModelRoot,
      projectHarnessRoot,
      projectId,
    );
    return view ? response(200, view) : response(404, { error: "not found" });
  }

  const cancelCampaignMatch = /^\/api\/idea-lab\/campaigns\/([^/]+)\/cancel$/.exec(path);
  if (cancelCampaignMatch) {
    if (request.method !== "POST") return methodNotAllowed();
    if (!mutationAuthorized(request, deps.token)) return response(401, { error: "unauthorized" });
    const campaignId = decodeId(cancelCampaignMatch[1] ?? "");
    if (!campaignId) return response(404, { error: "not found" });
    try {
      const cancelled = await cancelWebIdeaLabCampaign(
        deps.modelRoot, campaignId, (deps.now ?? (() => new Date().toISOString()))(),
      );
      deps.eventBus?.publish({ type: "campaign.updated", scope: { campaignId }, payload: { campaignId, status: cancelled.status } });
      return response(200, cancelled);
    } catch (error) {
      if (error instanceof WebIdeaLabActionError) return response(error.status, { error: sanitizeCredentialText(error.message, 240) });
      throw error;
    }
  }

  const retryRunMatch = /^\/api\/idea-lab\/runs\/([^/]+)\/retry$/.exec(path);
  if (retryRunMatch) {
    if (request.method !== "POST") return methodNotAllowed();
    if (!mutationAuthorized(request, deps.token)) return response(401, { error: "unauthorized" });
    const runId = decodeId(retryRunMatch[1] ?? "");
    if (!runId) return response(404, { error: "not found" });
    if (deps.ideaLabRuntime?.state !== "ready" || !deps.ideaLabRuntime.retryRun) return response(503, { error: "idea lab runtime unavailable" });
    const result = await deps.ideaLabRuntime.retryRun(runId);
    if (result === "not-allowed") return response(409, { status: result, error: "Run is not terminal FAILED_FINAL or cannot be retried" });
    return response(202, { status: result, runId });
  }

  const archiveMatch = /^\/api\/prototypes\/([^/]+)\/archive$/.exec(path);
  if (archiveMatch) {
    if (request.method !== "POST") return methodNotAllowed();
    if (!mutationAuthorized(request, deps.token)) return response(401, { error: "unauthorized" });
    const prototypeId = decodeId(archiveMatch[1] ?? "");
    if (!prototypeId) return response(404, { error: "not found" });
    try {
      const archived = await archivePrototypeCandidate(
        deps.modelRoot, prototypeId, (deps.now ?? (() => new Date().toISOString()))(),
      );
      deps.eventBus?.publish({ type: "prototype.updated", scope: { prototypeId }, payload: { prototypeId, status: archived.status } });
      return response(200, archived);
    } catch (error) {
      if (error instanceof Error && error.message.startsWith("Prototype not found:")) return response(404, { error: "not found" });
      if (error instanceof Error && error.message.includes("cannot be archived")) return response(409, { error: sanitizeCredentialText(error.message, 240) });
      throw error;
    }
  }

  const prototypeDetailMatch = /^\/api\/prototypes\/([^/]+)$/.exec(path);
  if (prototypeDetailMatch) {
    if (request.method !== "GET") return methodNotAllowed();
    const prototypeId = decodeId(prototypeDetailMatch[1] ?? "");
    if (!prototypeId) return response(404, { error: "not found" });
    const detail = await buildPrototypeDetail(deps.modelRoot, deps.harnessRoot, prototypeId);
    return detail ? response(200, detail) : response(404, { error: "not found" });
  }

  const acceptanceMatch = /^\/api\/prototypes\/([^/]+)\/browser-acceptance$/.exec(path);
  if (acceptanceMatch) {
    if (request.method !== "POST") return methodNotAllowed();
    if (!mutationAuthorized(request, deps.token)) return response(401, { error: "unauthorized" });
    const prototypeId = decodeId(acceptanceMatch[1] ?? "");
    if (!prototypeId) return response(404, { error: "not found" });
    const body = request.body as { checks?: unknown } | undefined;
    const checks = body?.checks;
    if (!checks || typeof checks !== "object" || Array.isArray(checks)) return response(400, { error: "checks are required" });
    const normalized: Record<PrototypeBrowserAcceptanceCheck, "pass" | "fail" | "unverified"> = {} as Record<PrototypeBrowserAcceptanceCheck, "pass" | "fail" | "unverified">;
    for (const check of PROTOTYPE_BROWSER_ACCEPTANCE_CHECKS) {
      const value = (checks as Record<string, unknown>)[check];
      if (value !== "pass" && value !== "fail" && value !== "unverified") return response(400, { error: `invalid acceptance check: ${check}` });
      normalized[check] = value;
    }
    try {
      const updated = await recordPrototypeBrowserAcceptance(
        deps.modelRoot,
        prototypeId,
        normalized,
        (deps.now ?? (() => new Date().toISOString()))(),
      );
      deps.eventBus?.publish({ type: "prototype.updated", scope: { prototypeId }, payload: { prototypeId, status: updated.status, browserAcceptance: updated.browserAcceptance?.status } });
      return response(200, updated);
    } catch (error) {
      if (error instanceof Error && error.message.startsWith("Prototype not found:")) return response(404, { error: "not found" });
      if (error instanceof Error && error.message.includes("immutable")) return response(409, { error: sanitizeCredentialText(error.message, 240) });
      throw error;
    }
  }

  const promotionMatch = /^\/api\/prototypes\/([^/]+)\/promote$/.exec(path);
  if (promotionMatch) {
    if (request.method !== "POST") return methodNotAllowed();
    if (!mutationAuthorized(request, deps.token)) {
      return response(401, { error: "unauthorized" });
    }
    const prototypeId = decodeId(promotionMatch[1] ?? "");
    if (!prototypeId) return response(404, { error: "not found" });

    try {
      const workspace = await promotePrototype({
        modelRoot: deps.modelRoot,
        projectModelRoot,
        harnessRoot: deps.harnessRoot,
        prototypeId,
        promotedAt: (deps.now ?? (() => new Date().toISOString()))(),
      });
      deps.eventBus?.publish({ type: "project.promoted", scope: { projectId: workspace.id, prototypeId }, payload: { projectId: workspace.id, prototypeId } });
      return response(200, workspace);
    } catch (error) {
      if (error instanceof Error && error.message.startsWith("Prototype not found:")) {
        return response(404, { error: "not found" });
      }
      if (error instanceof Error && error.message.startsWith("Promoted prototype workspace is missing:")) {
        return response(409, { error: "promoted project workspace is missing" });
      }
      throw error;
    }
  }

  return response(404, { error: "not found" });
}
