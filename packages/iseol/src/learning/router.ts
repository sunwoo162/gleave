import type { PlatformUserService } from "../platform-user/contracts.js";
import type { UserRequest, UserResponse } from "../web-control-plane/user-router.js";
import type { LearningService } from "./contracts.js";
import type { UserProjectService } from "../project-model/user-project-service.js";
import { sanitizeCredentialText } from "../security/text-safety.js";

export type LearningRouteServices = {
  platformUserService: PlatformUserService;
  learningService?: LearningService;
  userProjectService?: UserProjectService;
};

const JSON_HEADERS = { "content-type": "application/json; charset=utf-8" };

function response(status: number, body: unknown): UserResponse {
  return { status, headers: JSON_HEADERS, body };
}

function bearer(headers: Record<string, string | undefined>): string | null {
  const value = headers.authorization;
  if (!value?.startsWith("Bearer ")) return null;
  return value.slice("Bearer ".length).trim() || null;
}

function objectBody(body: unknown): Record<string, unknown> | null {
  return body && typeof body === "object" && !Array.isArray(body) ? body as Record<string, unknown> : null;
}

function stringValue(body: Record<string, unknown>, key: string): string | null {
  return typeof body[key] === "string" && body[key].trim() ? body[key] as string : null;
}

function decodePathValue(value: string): string | null {
  if (/%(?:2f|5c)/i.test(value)) return null;
  try {
    const decoded = decodeURIComponent(value);
    return decoded || null;
  } catch {
    return null;
  }
}

function pathId(pathname: string, prefix: string): string | null {
  if (!pathname.startsWith(prefix)) return null;
  return decodePathValue(pathname.slice(prefix.length));
}

export async function routeLearningRequest(request: UserRequest, services: LearningRouteServices): Promise<UserResponse> {
  const rawPathname = (request.rawPath ?? request.path).split("?", 1)[0] ?? "";
  const url = new URL(request.path, "http://iseol.local");
  const isLearningPath = url.pathname === "/api/user/learning" || url.pathname.startsWith("/api/user/learning/");
  if (isLearningPath && rawPathname.includes("\\")) {
    return response(404, { error: "learning route not found" });
  }
  const token = bearer(request.headers);
  const resolvedPrincipal = token ? await services.platformUserService.resolveAuthenticatedPrincipal(token) : null;
  if (!resolvedPrincipal) return response(401, { error: "authentication required" });
  const authenticatedUser = await services.platformUserService.getUser(resolvedPrincipal.userId);
  const principal = authenticatedUser ? { ...resolvedPrincipal, timezone: authenticatedUser.timezone } : resolvedPrincipal;
  if (!services.learningService) return response(503, { error: "learning unavailable" });
  const learning = services.learningService;

  try {
    if (url.pathname === "/api/user/learning/goals") {
      if (request.method === "GET") return response(200, { goals: await learning.listLearningGoals(principal) });
      if (request.method !== "POST") return response(405, { error: "method not allowed" });
      const body = objectBody(request.body);
      const subjectText = body ? stringValue(body, "subjectText") : null;
      const duration = body?.duration && typeof body.duration === "object" && !Array.isArray(body.duration) ? body.duration as Record<string, unknown> : null;
      const parsedDuration = duration && Number.isInteger(duration.days) ? { days: duration.days as number }
        : duration && typeof duration.targetDate === "string" ? { targetDate: duration.targetDate }
          : null;
      const dailyMinutes = body?.dailyMinutes;
      if (!subjectText || !parsedDuration || typeof dailyMinutes !== "number") return response(400, { error: "subjectText, duration, and dailyMinutes are required" });
      const optionalSettings = body?.optionalSettings && typeof body.optionalSettings === "object" && !Array.isArray(body.optionalSettings)
        ? body.optionalSettings as { level?: "unknown" | "beginner" | "intermediate" | "advanced"; goalText?: string; explanationPreference?: string }
        : undefined;
      return response(201, { goal: await learning.createLearningGoal(principal, { subjectText, duration: parsedDuration, dailyMinutes, ...(optionalSettings ? { optionalSettings } : {}) }) });
    }

    const projectProposalMatch = /^\/api\/user\/learning\/goals\/([^/]+)\/project-proposals(?:\/([^/]+)\/accept)?$/.exec(url.pathname);
    if (projectProposalMatch) {
      const goalId = decodePathValue(projectProposalMatch[1] ?? "");
      const rawProposalId = projectProposalMatch[2] ?? null;
      const proposalId = rawProposalId ? decodePathValue(rawProposalId) : null;
      if (!goalId || (rawProposalId && !proposalId)) return response(404, { error: "learning goal or project proposal not found" });
      if (proposalId) {
        if (request.method !== "POST") return response(405, { error: "method not allowed" });
        return response(200, await learning.acceptLearningProjectApplication(principal, goalId, proposalId));
      }
      if (request.method === "GET") return response(200, { proposals: await learning.listLearningProjectApplications(principal, goalId) });
      if (request.method !== "POST") return response(405, { error: "method not allowed" });
      const body = objectBody(request.body);
      const projectId = body ? stringValue(body, "projectId") : null;
      const proposal = body?.proposal && typeof body.proposal === "object" && !Array.isArray(body.proposal) ? body.proposal as Record<string, unknown> : null;
      const title = proposal ? stringValue(proposal, "title") : null;
      const objective = proposal ? stringValue(proposal, "objective") : null;
      const acceptanceCriteria = proposal && Array.isArray(proposal.acceptanceCriteria) && proposal.acceptanceCriteria.every((item) => typeof item === "string") ? proposal.acceptanceCriteria as string[] : null;
      const tests = proposal && Array.isArray(proposal.tests) && proposal.tests.every((item) => typeof item === "string") ? proposal.tests as string[] : null;
      const learningEvidenceRefs = body && Array.isArray(body.learningEvidenceRefs) && body.learningEvidenceRefs.every((item) => typeof item === "string") ? body.learningEvidenceRefs as string[] : null;
      const requiredPermissions = body && Array.isArray(body.requiredPermissions) && body.requiredPermissions.every((item) => typeof item === "string") ? body.requiredPermissions as string[] : null;
      const assignments = body?.actorAssignments && typeof body.actorAssignments === "object" && !Array.isArray(body.actorAssignments) ? body.actorAssignments as Record<string, unknown> : null;
      const human = assignments ? stringValue(assignments, "human") : null;
      const estimatedEffort = proposal?.estimatedEffort;
      if (!projectId || !title || !objective || !acceptanceCriteria || !tests || !learningEvidenceRefs || !requiredPermissions || !human || typeof estimatedEffort !== "number") return response(400, { error: "projectId, proposal, evidence refs, permissions, and actor assignments are required" });
      const result = await learning.createLearningProjectApplication(principal, goalId, { projectId, proposal: { title, objective, ...(typeof proposal?.nodeRef === "string" ? { nodeRef: proposal.nodeRef } : {}), acceptanceCriteria, tests, estimatedEffort }, learningEvidenceRefs, requiredPermissions, actorAssignments: { human, ...(typeof assignments?.ai === "string" ? { ai: assignments.ai } : {}) } });
      return response(result.created ? 201 : 200, result);
    }

    const reportMatch = /^\/api\/user\/learning\/goals\/([^/]+)\/reports$/.exec(url.pathname);
    if (reportMatch) {
      const goalId = decodePathValue(reportMatch[1] ?? "");
      if (!goalId) return response(404, { error: "learning goal not found" });
      if (request.method === "GET") return response(200, { reports: await learning.listLearningReports(principal, goalId) });
      if (request.method !== "POST") return response(405, { error: "method not allowed" });
      const body = objectBody(request.body);
      const period = body?.period && typeof body.period === "object" && !Array.isArray(body.period) ? body.period as Record<string, unknown> : null;
      const from = period ? stringValue(period, "from") : null;
      const to = period ? stringValue(period, "to") : null;
      const kind = period ? stringValue(period, "kind") : null;
      if (!from || !to || !kind || !["weekly", "final", "custom"].includes(kind)) return response(400, { error: "period.from, period.to, and period.kind are required" });
      const result = await learning.createLearningReport(principal, goalId, { period: { from, to, kind: kind as "weekly" | "final" | "custom" } });
      return response(result.created ? 201 : 200, result);
    }

    const goalPath = pathId(url.pathname, "/api/user/learning/goals/");
    if (goalPath && goalPath.endsWith("/start")) {
      if (request.method !== "POST") return response(405, { error: "method not allowed" });
      const goalId = goalPath.slice(0, -"/start".length);
      const body = objectBody(request.body);
      const planVersionId = body ? stringValue(body, "planVersionId") : null;
      const dayId = body ? stringValue(body, "dayId") : null;
      const expectedRevision = body && typeof body.expectedRevision === "number" ? body.expectedRevision : undefined;
      if (!planVersionId || !dayId) return response(400, { error: "planVersionId and dayId are required" });
      const session = await learning.startLearningGoalSession(principal, goalId, { planVersionId, dayId, ...(expectedRevision === undefined ? {} : { expectedRevision }) });
      return response(201, { session });
    }
    if (goalPath && goalPath.endsWith("/plan-preview")) {
      if (request.method !== "POST") return response(405, { error: "method not allowed" });
      const goalId = goalPath.slice(0, -"/plan-preview".length);
      const body = objectBody(request.body);
      const expectedRevision = body && typeof body.expectedRevision === "number" ? body.expectedRevision : undefined;
      const preview = await learning.createLearningPlanPreview(principal, goalId, expectedRevision);
      return response(preview.created ? 201 : 200, preview);
    }
    if (goalPath && goalPath.endsWith("/adjustment-preview")) {
      if (request.method !== "POST") return response(405, { error: "method not allowed" });
      const goalId = goalPath.slice(0, -"/adjustment-preview".length);
      const body = objectBody(request.body);
      const basePlanVersionId = body ? stringValue(body, "basePlanVersionId") : null;
      const reason = body ? stringValue(body, "reason") : null;
      if (!basePlanVersionId || !reason) return response(400, { error: "basePlanVersionId and reason are required" });
      const adjustment = await learning.createLearningPlanAdjustment(principal, goalId, {
        basePlanVersionId, reason: reason as "missed-days" | "blocked" | "changed-time" | "changed-duration" | "changed-goal",
        ...(typeof body?.expectedGoalRevision === "number" ? { expectedGoalRevision: body.expectedGoalRevision } : {}),
        ...(typeof body?.dailyMinutes === "number" ? { dailyMinutes: body.dailyMinutes } : {}),
        ...(typeof body?.durationDays === "number" ? { durationDays: body.durationDays } : {}),
        ...(typeof body?.note === "string" ? { note: body.note } : {}),
      });
      return response(201, { adjustment });
    }
    if (goalPath && goalPath.includes("/adjustments/") && goalPath.endsWith("/accept")) {
      if (request.method !== "POST") return response(405, { error: "method not allowed" });
      const [goalId, adjustmentId] = goalPath.slice(0, -"/accept".length).split("/adjustments/");
      const result = await learning.acceptLearningPlanAdjustment(principal, goalId!, adjustmentId!);
      return response(200, result);
    }
    if (goalPath && goalPath.endsWith("/adjustments")) {
      if (request.method !== "GET") return response(405, { error: "method not allowed" });
      const goalId = goalPath.slice(0, -"/adjustments".length);
      return response(200, { adjustments: await learning.listLearningPlanAdjustments(principal, goalId) });
    }
    if (goalPath && goalPath.endsWith("/plans")) {
      if (request.method !== "GET") return response(405, { error: "method not allowed" });
      const goalId = goalPath.slice(0, -"/plans".length);
      return response(200, { plans: await learning.listLearningPlanVersions(principal, goalId) });
    }
    if (goalPath && goalPath.includes("/plans/")) {
      if (request.method !== "GET") return response(405, { error: "method not allowed" });
      const [goalId, versionId] = goalPath.split("/plans/");
      const plan = await learning.getLearningPlanVersion(principal, goalId!, versionId!);
      return plan ? response(200, { plan }) : response(404, { error: "learning plan version not found" });
    }
    if (goalPath && goalPath.endsWith("/progress")) {
      if (request.method !== "GET") return response(405, { error: "method not allowed" });
      const goalId = goalPath.slice(0, -"/progress".length);
      const progress = await learning.getLearningGoalProgress(principal, goalId);
      return progress ? response(200, { progress }) : response(404, { error: "learning goal not found" });
    }
    if (goalPath && goalPath.endsWith("/today")) {
      if (request.method !== "GET") return response(405, { error: "method not allowed" });
      const goalId = goalPath.slice(0, -"/today".length);
      const today = await learning.getLearningGoalToday(principal, goalId);
      return today ? response(200, { today }) : response(404, { error: "learning goal not found" });
    }
    if (goalPath) {
      const goalId = goalPath;
      if (request.method !== "GET") return response(405, { error: "method not allowed" });
      const goal = await learning.getLearningGoal(principal, goalId);
      return goal ? response(200, { goal }) : response(404, { error: "learning goal not found" });
    }

    if (url.pathname === "/api/user/learning/plans") {
      if (request.method === "GET") return response(200, { plans: await learning.listLearningPlans(principal) });
      if (request.method !== "POST") return response(405, { error: "method not allowed" });
      const body = objectBody(request.body);
      if (!body) return response(400, { error: "json object body required" });
      const title = stringValue(body, "title");
      const description = stringValue(body, "description");
      const goals = Array.isArray(body.goals) && body.goals.every((goal) => typeof goal === "string")
        ? body.goals as string[]
        : null;
      if (!title || !description || !goals) return response(400, { error: "title, description, and goals are required" });
      return response(201, { plan: await learning.createLearningPlan(principal, { title, description, goals }) });
    }

    const planId = pathId(url.pathname, "/api/user/learning/plans/");
    if (planId) {
      if (request.method !== "GET") return response(405, { error: "method not allowed" });
      const plan = await learning.getLearningPlan(principal, planId);
      return plan ? response(200, { plan }) : response(404, { error: "learning plan not found" });
    }

    if (url.pathname === "/api/user/learning/sessions") {
      if (request.method === "GET") return response(200, { sessions: await learning.listLearningSessions(principal) });
      if (request.method !== "POST") return response(405, { error: "method not allowed" });
      const body = objectBody(request.body);
      const planIdValue = body ? stringValue(body, "planId") : null;
      if (!planIdValue) return response(400, { error: "planId is required" });
      return response(201, { session: await learning.startLearningSession(principal, planIdValue) });
    }

    const sessionPath = pathId(url.pathname, "/api/user/learning/sessions/");
    if (sessionPath && sessionPath.endsWith("/content")) {
      if (request.method === "POST") return response(201, { request: await learning.requestLearningSessionContent(principal, sessionPath.slice(0, -"/content".length)) });
      if (request.method === "GET") {
        const content = await learning.getLearningSessionContent(principal, sessionPath.slice(0, -"/content".length));
        return content ? response(200, { request: content }) : response(404, { error: "learning content request not found" });
      }
      return response(405, { error: "method not allowed" });
    }
    if (sessionPath && sessionPath.endsWith("/actions")) {
      const actionSessionId = sessionPath.slice(0, -"/actions".length);
      if (request.method === "GET") return response(200, { actions: await learning.listLearningSessionActions(principal, actionSessionId) });
      if (request.method !== "POST") return response(405, { error: "method not allowed" });
      const body = objectBody(request.body);
      const actionId = body ? stringValue(body, "actionId") : null;
      const actionType = body ? stringValue(body, "type") : null;
      if (!actionId || !actionType) return response(400, { error: "actionId and type are required" });
      return response(201, { action: await learning.recordLearningSessionAction(principal, actionSessionId, {
        actionId, type: actionType as "explanation" | "example" | "hint" | "self-report",
        ...(typeof body?.contentRef === "string" ? { contentRef: body.contentRef } : {}),
        ...(typeof body?.question === "string" ? { question: body.question } : {}),
      }) });
    }
    if (sessionPath && sessionPath.endsWith("/answers")) {
      const answerSessionId = sessionPath.slice(0, -"/answers".length);
      if (request.method === "GET") return response(200, { answers: await learning.listLearningAnswers(principal, answerSessionId) });
      if (request.method !== "POST") return response(405, { error: "method not allowed" });
      const body = objectBody(request.body);
      const exerciseId = body ? stringValue(body, "exerciseId") : null;
      const attemptId = body ? stringValue(body, "attemptId") : null;
      const answerResponse = body ? stringValue(body, "response") : null;
      if (!exerciseId || !attemptId || !answerResponse) return response(400, { error: "exerciseId, attemptId, and response are required" });
      if (typeof body?.artifactRefs !== "undefined" && (!Array.isArray(body.artifactRefs) || body.artifactRefs.some((ref) => typeof ref !== "string"))) return response(400, { error: "artifactRefs must be a string array" });
      return response(201, { answer: await learning.submitLearningAnswer(principal, answerSessionId, {
        exerciseId, attemptId, response: answerResponse, ...(Array.isArray(body?.artifactRefs) ? { artifactRefs: body.artifactRefs as string[] } : {}),
      }) });
    }
    if (sessionPath && sessionPath.endsWith("/complete")) {
      if (request.method !== "POST") return response(405, { error: "method not allowed" });
      const sessionId = sessionPath.slice(0, -"/complete".length);
      const body = objectBody(request.body);
      const expectedRevision = typeof body?.expectedRevision === "number" ? body.expectedRevision : undefined;
      const session = await learning.completeLearningSession(principal, sessionId, expectedRevision);
      return session ? response(200, { session }) : response(404, { error: "learning session not found" });
    }
    if (sessionPath && !sessionPath.endsWith("/attempts")) {
      if (request.method !== "GET") return response(405, { error: "method not allowed" });
      const expectedRevisionValue = url.searchParams.get("expectedRevision");
      const expectedRevision = expectedRevisionValue === null ? undefined : Number(expectedRevisionValue);
      if (expectedRevisionValue !== null && !Number.isInteger(expectedRevision)) return response(400, { error: "expectedRevision must be an integer" });
      const session = await learning.resumeLearningSession(principal, sessionPath, expectedRevision);
      return session ? response(200, { session }) : response(404, { error: "learning session not found" });
    }

    if (sessionPath && sessionPath.endsWith("/attempts")) {
      const attemptsSessionId = sessionPath.slice(0, -"/attempts".length);
      if (request.method !== "GET") return response(405, { error: "method not allowed" });
      return response(200, { attempts: await learning.listStudyAttempts(principal, attemptsSessionId) });
    }

    const feedbackPath = pathId(url.pathname, "/api/user/learning/answers/");
    if (feedbackPath && feedbackPath.endsWith("/feedback")) {
      if (request.method !== "GET") return response(405, { error: "method not allowed" });
      const answerId = feedbackPath.slice(0, -"/feedback".length);
      const feedback = await learning.getLearningAnswerFeedback(principal, answerId);
      return feedback ? response(200, { feedback }) : response(404, { error: "learning answer feedback not found" });
    }

    const disputePath = pathId(url.pathname, "/api/user/learning/feedback/");
    if (disputePath && disputePath.endsWith("/disputes")) {
      if (request.method !== "POST") return response(405, { error: "method not allowed" });
      const feedbackId = disputePath.slice(0, -"/disputes".length);
      const body = objectBody(request.body);
      const reason = body ? stringValue(body, "reason") : null;
      if (!reason) return response(400, { error: "reason is required" });
      return response(201, { ...await learning.disputeLearningFeedback(principal, feedbackId, { reason }) });
    }

    if (url.pathname === "/api/user/learning/attempts") {
      if (request.method !== "POST") return response(405, { error: "method not allowed" });
      const body = objectBody(request.body);
      const sessionIdValue = body ? stringValue(body, "sessionId") : null;
      const questionId = body ? stringValue(body, "questionId") : null;
      const answer = body ? stringValue(body, "answer") : null;
      if (!sessionIdValue || !questionId || !answer) return response(400, { error: "sessionId, questionId, and answer are required" });
      return response(201, { attempt: await learning.recordStudyAttempt(principal, {
        sessionId: sessionIdValue,
        questionId,
        answer,
        ...(typeof body?.correct === "boolean" ? { correct: body.correct } : {}),
      }) });
    }

    if (url.pathname === "/api/user/learning/coding-exercises") {
      if (request.method === "GET") {
        const sessionId = url.searchParams.get("sessionId") ?? undefined;
        return response(200, { exercises: await learning.listCodingExercises(principal, sessionId) });
      }
      if (request.method !== "POST") return response(405, { error: "method not allowed" });
      const body = objectBody(request.body);
      const title = body ? stringValue(body, "title") : null;
      const prompt = body ? stringValue(body, "prompt") : null;
      const language = body ? stringValue(body, "language") : null;
      const sessionId = body ? stringValue(body, "sessionId") : null;
      const estimatedMinutes = body?.estimatedMinutes;
      if (!title || !prompt || !language || (sessionId === null && body && typeof body.sessionId !== "undefined") || typeof estimatedMinutes !== "number") {
        return response(400, { error: "title, prompt, language, and estimatedMinutes are required" });
      }
      return response(201, { exercise: await learning.createCodingExercise(principal, {
        title, prompt, language, estimatedMinutes,
        ...(sessionId ? { sessionId } : {}),
      }) });
    }

    const codingExercisePath = pathId(url.pathname, "/api/user/learning/coding-exercises/");
    if (codingExercisePath && codingExercisePath.endsWith("/attempts")) {
      const exerciseId = codingExercisePath.slice(0, -"/attempts".length);
      if (request.method === "GET") return response(200, { attempts: await learning.listCodingAttempts(principal, exerciseId) });
      if (request.method !== "POST") return response(405, { error: "method not allowed" });
      const body = objectBody(request.body);
      const clientRequestId = body ? stringValue(body, "clientRequestId") : null;
      const submittedResponse = body ? stringValue(body, "response") : null;
      if (!clientRequestId || !submittedResponse) return response(400, { error: "clientRequestId and response are required" });
      const result = await learning.submitCodingAttempt(principal, { exerciseId, clientRequestId, response: submittedResponse });
      return response(result.created ? 201 : 200, result);
    }
    if (codingExercisePath) {
      if (request.method !== "GET") return response(405, { error: "method not allowed" });
      const exercise = await learning.getCodingExercise(principal, codingExercisePath);
      return exercise ? response(200, { exercise }) : response(404, { error: "coding exercise not found" });
    }

    if (url.pathname === "/api/user/learning/reviews") {
      if (request.method === "GET") {
        const at = url.searchParams.get("at") ?? new Date().toISOString();
        return response(200, { items: await learning.listDueReviewItems(principal, at) });
      }
      if (request.method !== "POST") return response(405, { error: "method not allowed" });
      const body = objectBody(request.body);
      const sourceType = body ? stringValue(body, "sourceType") : null;
      const sourceId = body ? stringValue(body, "sourceId") : null;
      const prompt = body ? stringValue(body, "prompt") : null;
      const answer = body ? stringValue(body, "answer") : null;
      if (!sourceType || !sourceId || !prompt || !answer) return response(400, { error: "sourceType, sourceId, prompt, and answer are required" });
      return response(201, { item: await learning.createReviewItem(principal, {
        sourceType, sourceId, prompt, answer,
        ...(typeof body?.dueAt === "string" ? { dueAt: body.dueAt } : {}),
      }) });
    }

    const reviewId = pathId(url.pathname, "/api/user/learning/reviews/");
    if (reviewId) {
      if (request.method !== "POST") return response(405, { error: "method not allowed" });
      const body = objectBody(request.body);
      if (!body || typeof body.quality !== "number") return response(400, { error: "quality is required" });
      return response(200, { item: await learning.reviewItem(principal, reviewId, { quality: body.quality }) });
    }

    if (url.pathname === "/api/user/learning/analyze") {
      if (request.method !== "POST") return response(405, { error: "method not allowed" });
      const body = objectBody(request.body);
      const sourceType = body ? stringValue(body, "sourceType") : null;
      const sourceId = body ? stringValue(body, "sourceId") : null;
      const language = body ? stringValue(body, "language") : null;
      const code = body ? stringValue(body, "code") : null;
      if (!sourceType || !sourceId || !language || !code) return response(400, { error: "sourceType, sourceId, language, and code are required" });
      return response(201, { result: await learning.analyzeCodeForLearning(principal, { sourceType, sourceId, language, code }) });
    }

    const analysisId = pathId(url.pathname, "/api/user/learning/analyses/");
    if (analysisId) {
      if (request.method !== "GET") return response(405, { error: "method not allowed" });
      const result = await learning.getCodeAnalysis(principal, analysisId);
      return result ? response(200, { result }) : response(404, { error: "code analysis not found" });
    }
    return response(404, { error: "not found" });
  } catch (error) {
    const rawMessage = error instanceof Error ? error.message : "learning request failed";
    const message = sanitizeCredentialText(rawMessage, 240);
    if (/not found/i.test(rawMessage)) return response(404, { error: message });
    if (/conflict/i.test(rawMessage)) return response(409, { error: message });
    return response(400, { error: message });
  }
}
