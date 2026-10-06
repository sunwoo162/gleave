import { randomUUID } from "node:crypto";
import { assertIdentityId, assertTimestamp, type Principal } from "../identity/contracts.js";
import type { AiChatAgentProfile, AiChatAttachment, AiChatContextLearning, AiChatContextSelection, AiChatContextSnapshot, AiChatContextTeamDoc, AiChatExecutionPlan, AiChatExecutionPlanInput, AiChatSendOptions, AiChatService, AiChatServiceOptions, AiChatConversation, AiChatMessage } from "./contracts.js";
import { listConversationsUnlocked, loadConversationUnlocked, saveConversation, saveConversationUnlocked } from "./store.js";
import { withDurableAiChatConversationLock } from "./conversation-lock.js";
import { createUserRuntimeDispatchGate } from "../runtime/user-runtime-dispatch-gate.js";

function ensurePrincipal(principal: Principal): void { assertIdentityId(principal.userId); }
function text(value: string, label: string, max: number): string { const trimmed = value.trim(); if (!trimmed || trimmed.length > max) throw new Error(`${label} is required`); return trimmed; }
const MAX_CONTEXT_MEMORIES = 20;
const MAX_CONTEXT_CHARS = 16_000;
const MAX_CONTEXT_SESSIONS = 12;
const MAX_CONTEXT_ATTEMPTS = 24;
const MAX_CONTEXT_PROJECTS = 8;
const MAX_CONTEXT_ACTIVITY = 24;
const MAX_CONTEXT_TEAM_DOCS = 24;
const MAX_CONTEXT_PROJECT_OBJECTIVE_CHARS = 800;
const MAX_CONTEXT_TEAM_DOC_CHARS = 2_000;
const MAX_ATTACHMENTS_PER_MESSAGE = 3;
// Keep the aggregate payload below the shared 64KB HTTP request limit after
// JSON metadata is included. The browser and API use the same bounded contract.
const MAX_ATTACHMENT_BYTES = 24 * 1024;
const MAX_ATTACHMENT_TOTAL_BYTES = 48 * 1024;
const DEFAULT_CONTEXT_SELECTION: AiChatContextSelection = { memory: true, projectFiles: true, learningHistory: true, activityTimeline: true, teamDocs: true };
const MAX_EXECUTION_PLAN_STEPS = 8;
const ALLOWED_ATTACHMENT_MIME_TYPES = new Set([
  "application/json",
  "application/javascript",
  "application/typescript",
  "application/xml",
  "text/css",
  "text/csv",
  "text/html",
  "text/javascript",
  "text/markdown",
  "text/plain",
  "text/typescript",
  "text/xml",
]);
const ALLOWED_ATTACHMENT_EXTENSIONS = new Set([".cjs", ".css", ".csv", ".html", ".js", ".jsx", ".json", ".md", ".mjs", ".ts", ".tsx", ".txt", ".xml"]);

async function validateProjectSelection(principal: Principal, options: AiChatServiceOptions, projectId: string | undefined): Promise<void> {
  if (!projectId) return;
  if (!options.userProjectService) throw new Error("Project context unavailable");
  if (options.settingsService) {
    try {
      const settings = await options.settingsService.getSettings(principal);
      if (!settings.aiAccess.projectFiles) throw new Error("Project context unavailable");
    } catch {
      throw new Error("Project context unavailable");
    }
  }
  try {
    const projects = await options.userProjectService.listProjects(principal);
    if (!projects.some((project) => project.id === projectId)) throw new Error("Project context unavailable");
  } catch {
    throw new Error("Project context unavailable");
  }
}

function normalizeContextSelection(input: unknown): AiChatContextSelection {
  if (input === undefined) return { ...DEFAULT_CONTEXT_SELECTION };
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Context selection is invalid");
  const candidate = input as Record<string, unknown>;
  const selection = { ...DEFAULT_CONTEXT_SELECTION };
  for (const key of Object.keys(DEFAULT_CONTEXT_SELECTION) as Array<keyof AiChatContextSelection>) {
    if (candidate[key] !== undefined) {
      if (typeof candidate[key] !== "boolean") throw new Error("Context selection is invalid");
      selection[key] = candidate[key] as boolean;
    }
  }
  return selection;
}

function normalizeAttachmentName(value: string): string {
  const name = value.trim().split(/[\\/]/).pop()?.trim() ?? "";
  if (!name || name.length > 160 || name === "." || name === "..") throw new Error("Attachment name is required");
  return name;
}

function normalizeAttachments(input: unknown, at: string): AiChatAttachment[] {
  if (input === undefined) return [];
  if (!Array.isArray(input)) throw new Error("Attachments must be an array");
  if (input.length > MAX_ATTACHMENTS_PER_MESSAGE) throw new Error("Too many attachments");
  let totalBytes = 0;
  const attachments = input.map((candidate) => {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) throw new Error("Attachment is invalid");
    const value = candidate as { name?: unknown; mimeType?: unknown; content?: unknown };
    if (typeof value.name !== "string" || typeof value.content !== "string") throw new Error("Attachment name and content are required");
    const name = normalizeAttachmentName(value.name);
    const mimeType = typeof value.mimeType === "string" && value.mimeType.trim() ? (value.mimeType.trim().toLowerCase().split(";", 1)[0] ?? "text/plain") : "text/plain";
    const extensionPart = name.includes(".") ? name.split(".").pop() : undefined;
    const extension = extensionPart ? `.${extensionPart.toLowerCase()}` : "";
    if (!ALLOWED_ATTACHMENT_MIME_TYPES.has(mimeType) && !ALLOWED_ATTACHMENT_EXTENSIONS.has(extension)) throw new Error("Only text files can be attached");
    if (!value.content) throw new Error("Attachment content is required");
    const size = Buffer.byteLength(value.content, "utf8");
    if (size > MAX_ATTACHMENT_BYTES) throw new Error("Attachment is too large");
    totalBytes += size;
    if (totalBytes > MAX_ATTACHMENT_TOTAL_BYTES) throw new Error("Attachments are too large");
    return { version: 1 as const, id: `attachment-${randomUUID()}`, name, mimeType, size, content: value.content, createdAt: at };
  });
  return attachments;
}

function normalizeExecutionPlan(input: unknown, at: string): AiChatExecutionPlan | undefined {
  if (input === undefined) return undefined;
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Execution plan is invalid");
  const value = input as Partial<AiChatExecutionPlanInput>;
  if (typeof value.title !== "string" || typeof value.summary !== "string" || !Array.isArray(value.steps) || value.steps.length === 0 || value.steps.length > MAX_EXECUTION_PLAN_STEPS) throw new Error("Execution plan is invalid");
  const steps = value.steps.map((candidate, index) => {
    if (!candidate || typeof candidate !== "object") throw new Error("Execution plan step is invalid");
    const step = candidate as Partial<AiChatExecutionPlanInput["steps"][number]>;
    if (typeof step.title !== "string" || typeof step.description !== "string" || !["read", "write", "run", "external"].includes(step.operation ?? "") || typeof step.approvalRequired !== "boolean") throw new Error("Execution plan step is invalid");
    return { id: `plan-step-${index + 1}`, title: text(step.title, "Execution plan step title", 200), description: text(step.description, "Execution plan step description", 800), operation: step.operation!, approvalRequired: step.approvalRequired };
  });
  return { version: 1, id: `execution-plan-${randomUUID()}`, title: text(value.title, "Execution plan title", 240), summary: text(value.summary, "Execution plan summary", 2_000), steps, status: "proposed", createdAt: at, updatedAt: at };
}

async function privateContext(principal: Principal, options: AiChatServiceOptions, selectedProjectId: string | undefined, selection: AiChatContextSelection): Promise<AiChatContextSnapshot> {
  let settings: Awaited<ReturnType<NonNullable<AiChatServiceOptions["settingsService"]>["getSettings"]>> | undefined;
  let memoryAllowed = !options.settingsService;
  if (options.settingsService) {
    try {
      settings = await options.settingsService.getSettings(principal);
      memoryAllowed = settings.aiAccess.memory;
    } catch {
      // Fail closed when an explicit settings service cannot establish the user's memory permission.
      memoryAllowed = false;
    }
  }
  const records = options.memoryService && selection.memory && memoryAllowed
    ? await options.memoryService.listPrivateMemories(principal, { limit: MAX_CONTEXT_MEMORIES })
    : [];
  let remaining = MAX_CONTEXT_CHARS;
  const memories = records.flatMap((record) => {
    if (remaining <= 0) return [];
    const content = record.content.slice(0, remaining);
    remaining -= content.length;
    return [{ id: record.id, kind: record.kind, content, ...(record.source ? { source: record.source } : {}), createdAt: record.createdAt }];
  });
  let agentProfile: AiChatAgentProfile | undefined;
  if (options.aiAgentProfileService) {
    try {
      const profile = await options.aiAgentProfileService.getProfile(principal);
      agentProfile = {
        name: profile.name.slice(0, 40),
        personality: profile.personality.slice(0, 500),
        tone: profile.tone.slice(0, 200),
        role: profile.role.slice(0, 200),
      };
    } catch {
      // A profile read failure omits only optional style metadata; it never widens data access.
    }
  }
  const context: AiChatContextSnapshot = { scope: "private", memories, ...(agentProfile ? { agentProfile } : {}) };
  if (!settings) {
    if (selectedProjectId && selection.projectFiles && options.userProjectService) {
      const selected = (await options.userProjectService.listProjects(principal)).find((project) => project.id === selectedProjectId);
      if (!selected) throw new Error("Project context unavailable");
      return { ...context, projects: [{ id: selected.id, name: selected.name.slice(0, 200), objective: selected.objective.slice(0, MAX_CONTEXT_PROJECT_OBJECTIVE_CHARS), purpose: selected.purpose, teamMode: selected.teamMode, status: selected.status, updatedAt: selected.updatedAt }] };
    }
    return context;
  }
  const next: AiChatContextSnapshot = { ...context };
  if (options.learningService && selection.learningHistory && settings.aiAccess.learningHistory) {
    try {
      const sessions = (await options.learningService.listLearningSessions(principal)).slice(0, MAX_CONTEXT_SESSIONS).map((session) => ({
        id: session.id,
        planId: session.planId,
        status: session.status,
        startedAt: session.startedAt,
        ...(session.completedAt ? { completedAt: session.completedAt } : {}),
      }));
      const attempts = (await Promise.all(sessions.map((session) => options.learningService!.listStudyAttempts(principal, session.id))))
        .flat()
        .sort((a, b) => b.submittedAt.localeCompare(a.submittedAt))
        .slice(0, MAX_CONTEXT_ATTEMPTS)
        .map((attempt) => ({
          id: attempt.id,
          sessionId: attempt.sessionId,
          questionId: attempt.questionId,
          answer: attempt.answer.slice(0, 4_000),
          ...(attempt.correct === undefined ? {} : { correct: attempt.correct }),
          submittedAt: attempt.submittedAt,
        }));
      const learning: AiChatContextLearning = { sessions, attempts };
      next.learning = learning;
    } catch {
      // A failed learning read must not block private memory context or expose partial data.
    }
  }
  if (options.userProjectService && selection.projectFiles && settings.aiAccess.projectFiles) {
    try {
      const projects = await options.userProjectService.listProjects(principal);
      const selectedProjects = selectedProjectId
        ? projects.filter((project) => project.id === selectedProjectId)
        : projects.slice(0, MAX_CONTEXT_PROJECTS);
      if (selectedProjectId && selectedProjects.length === 0) throw new Error("Project context unavailable");
      next.projects = selectedProjects.map((project) => ({
        id: project.id,
        name: project.name.slice(0, 200),
        objective: project.objective.slice(0, MAX_CONTEXT_PROJECT_OBJECTIVE_CHARS),
        purpose: project.purpose,
        teamMode: project.teamMode,
        status: project.status,
        updatedAt: project.updatedAt,
      }));
    } catch (error) {
      if (selectedProjectId) throw error;
      // Project reads are optional context and fail closed independently.
    }
  }
  if (options.activityService && selection.activityTimeline && settings.aiAccess.activityTimeline) {
    try {
      next.activityTimeline = (await options.activityService.listActivityEvents(principal))
        .filter((event) => event.status === "active" && event.verificationStatus === "verified")
        .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))
        .slice(0, MAX_CONTEXT_ACTIVITY)
        .map((event) => ({
          id: event.id,
          sourceType: event.sourceType,
          sourceId: event.sourceId,
          eventType: event.eventType,
          actorType: event.actorType,
          verificationStatus: event.verificationStatus,
          status: event.status,
          payload: { ...event.payload },
          occurredAt: event.occurredAt,
        }));
    } catch {
      // Activity reads are optional context and fail closed independently.
    }
  }
  if ((options.studyService || options.teamService) && selection.teamDocs && settings.aiAccess.teamDocs) {
    try {
      const docs: AiChatContextTeamDoc[] = [];
      if (options.studyService) {
        const spaces = await options.studyService.listStudySpaces(principal);
        for (const space of spaces.slice(0, 8)) {
          if (docs.length >= MAX_CONTEXT_TEAM_DOCS) break;
          const view = await options.studyService.getStudySpace(principal, space.id);
          if (!view) continue;
          const team = options.teamService ? await options.teamService.getTeam(principal, space.teamId) : null;
          const teamName = team?.team.name ?? "공유 스터디 팀";
          docs.push({ id: space.id, teamId: space.teamId, teamName, kind: "study-space", title: space.title.slice(0, 240), content: space.description.slice(0, MAX_CONTEXT_TEAM_DOC_CHARS), createdAt: space.createdAt });
          for (const link of view.curriculumLinks) {
            if (docs.length >= MAX_CONTEXT_TEAM_DOCS) break;
            docs.push({ id: link.id, teamId: space.teamId, teamName, kind: "curriculum-link", title: link.label.slice(0, 240), content: link.label.slice(0, MAX_CONTEXT_TEAM_DOC_CHARS), createdAt: link.createdAt });
          }
          for (const task of view.tasks) {
            if (docs.length >= MAX_CONTEXT_TEAM_DOCS) break;
            docs.push({ id: task.id, teamId: space.teamId, teamName, kind: "study-task", title: task.title.slice(0, 240), content: task.instructions.slice(0, MAX_CONTEXT_TEAM_DOC_CHARS), createdAt: task.createdAt, ...(task.dueLocalDate ? { dueLocalDate: task.dueLocalDate } : {}) });
          }
        }
      }
      if (options.teamService && options.memoryService && docs.length < MAX_CONTEXT_TEAM_DOCS) {
        const sharedMemoryIds = new Set<string>();
        const teams = (await options.teamService.listTeams(principal)).filter((team) => Boolean(team.viewerRole)).slice(0, 8);
        for (const team of teams) {
          if (docs.length >= MAX_CONTEXT_TEAM_DOCS) break;
          const shared = await options.memoryService.listSharedMemories(principal, team.id);
          for (const memory of shared) {
            if (docs.length >= MAX_CONTEXT_TEAM_DOCS || sharedMemoryIds.has(memory.id)) break;
            sharedMemoryIds.add(memory.id);
            docs.push({ id: memory.id, teamId: team.id, teamName: team.name, kind: "shared-memory", title: memory.kind.slice(0, 240), content: memory.content.slice(0, MAX_CONTEXT_TEAM_DOC_CHARS), createdAt: memory.createdAt, sourceMemoryId: memory.id });
          }
        }
      }
      next.teamDocs = docs;
    } catch {
      // Shared-team context is optional and fails closed as one bounded section.
    }
  }
  return next;
}

export function createAiChatService(root: string, options: AiChatServiceOptions = {}): AiChatService {
  const now = options.now ?? (() => new Date().toISOString());
  const dispatchForUser = options.dispatchForUser ?? createUserRuntimeDispatchGate();
  async function completeMessage(principal: Principal, conversationId: string, messageId: string, assistantContent: string, executionPlanInput?: AiChatExecutionPlanInput): Promise<AiChatConversation> {
    ensurePrincipal(principal); assertIdentityId(conversationId); assertIdentityId(messageId);
    let completed = false;
    let completedAt: string | undefined;
    const next = await withDurableAiChatConversationLock(root, principal.userId, conversationId, async () => {
      const current = await loadConversationUnlocked(root, principal.userId, conversationId);
      if (!current || current.userId !== principal.userId) throw new Error("AI chat conversation not found");
      const index = current.messages.findIndex((message) => message.id === messageId);
      const pending = index >= 0 ? current.messages[index] : undefined;
      if (!pending || pending.role !== "user") throw new Error("AI chat message not found");
      if (pending.status === "persisted") return current;
      const at = now(); assertTimestamp(at, "AI chat timestamp");
      const completedMessage: AiChatMessage = { ...pending, status: "persisted" };
      const executionPlan = normalizeExecutionPlan(executionPlanInput, at);
      const assistantMessage: AiChatMessage = { id: `message-${randomUUID()}`, role: "assistant", content: text(assistantContent, "Assistant response", 20_000), status: "persisted", createdAt: at, ...(pending.projectId ? { projectId: pending.projectId } : {}), ...(executionPlan ? { executionPlan } : {}) };
      const updated: AiChatConversation = { ...current, messages: [...current.messages.slice(0, index), completedMessage, assistantMessage, ...current.messages.slice(index + 1)], updatedAt: at };
      await saveConversationUnlocked(root, updated);
      completed = true;
      completedAt = at;
      return updated;
    }, { waitForMs: 2_000 });
    if (!completed) return next;
    if (options.notificationService) {
      let enabled = !options.settingsService;
      if (options.settingsService) {
        try {
          enabled = (await options.settingsService.getSettings(principal)).notifications.aiDone;
        } catch {
          enabled = false;
        }
      }
      if (enabled) {
        await options.notificationService.createAiCompletionNotification({ userId: principal.userId, conversationId, messageId, createdAt: completedAt! });
      }
    }
    return next;
  }
  async function updateExecutionPlan(principal: Principal, conversationId: string, messageId: string, status: "approved" | "rejected"): Promise<AiChatConversation> {
    ensurePrincipal(principal); assertIdentityId(conversationId); assertIdentityId(messageId);
    return withDurableAiChatConversationLock(root, principal.userId, conversationId, async () => {
      const current = await loadConversationUnlocked(root, principal.userId, conversationId);
      if (!current || current.userId !== principal.userId) throw new Error("AI chat conversation not found");
      const index = current.messages.findIndex((message) => message.id === messageId);
      const message = index >= 0 ? current.messages[index] : undefined;
      if (!message?.executionPlan) throw new Error("Execution plan not found");
      if (message.executionPlan.status === status) return current;
      if (message.executionPlan.status !== "proposed") throw new Error("Execution plan is no longer pending");
      const at = now(); assertTimestamp(at, "AI chat timestamp");
      const executionPlan: AiChatExecutionPlan = { ...message.executionPlan, status, updatedAt: at, ...(status === "approved" ? { approvedAt: at } : { rejectedAt: at }) };
      const nextMessage: AiChatMessage = { ...message, executionPlan };
      const next: AiChatConversation = { ...current, messages: [...current.messages.slice(0, index), nextMessage, ...current.messages.slice(index + 1)], updatedAt: at };
      await saveConversationUnlocked(root, next);
      return next;
    }, { waitForMs: 2_000 });
  }
  async function createExecutionPlanWorkRequest(principal: Principal, conversationId: string, messageId: string): Promise<{ conversation: AiChatConversation; workRequest: Awaited<ReturnType<NonNullable<AiChatServiceOptions["userProjectService"]>["createWorkRequest"]>>["request"]; created: boolean }> {
    ensurePrincipal(principal); assertIdentityId(conversationId); assertIdentityId(messageId);
    if (!options.userProjectService) throw new Error("Project work request unavailable");
    const userProjectService = options.userProjectService;
    return withDurableAiChatConversationLock(root, principal.userId, conversationId, async () => {
      const current = await loadConversationUnlocked(root, principal.userId, conversationId);
      if (!current || current.userId !== principal.userId) throw new Error("AI chat conversation not found");
      const index = current.messages.findIndex((message) => message.id === messageId);
      const message = index >= 0 ? current.messages[index] : undefined;
      if (!message?.executionPlan) throw new Error("Execution plan not found");
      if (message.executionPlan.status !== "approved") throw new Error("Execution plan must be approved before creating a work request");
      if (!message.projectId) throw new Error("Execution plan requires a project context");
      const plan = message.executionPlan;
      const title = text(`AI 계획 · ${plan.title}`, "Work title", 160);
      const objective = text(`${plan.summary}\n\n실행 단계:\n${plan.steps.map((step, stepIndex) => `${stepIndex + 1}. [${step.operation}] ${step.title}: ${step.description}`).join("\n")}`, "Work objective", 4_000);
      const result = await userProjectService.createWorkRequest(principal, message.projectId, { title, objective, idempotencyKey: `ai-chat-execution-plan:${plan.id}` });
      const at = now(); assertTimestamp(at, "AI chat timestamp");
      const updatedPlan: AiChatExecutionPlan = { ...plan, workRequestId: result.request.id, updatedAt: at };
      const nextMessage: AiChatMessage = { ...message, executionPlan: updatedPlan };
      const next: AiChatConversation = { ...current, messages: [...current.messages.slice(0, index), nextMessage, ...current.messages.slice(index + 1)], updatedAt: at };
      await saveConversationUnlocked(root, next);
      return { conversation: next, workRequest: result.request, created: result.created };
    }, { waitForMs: 2_000 });
  }
  return {
    async listConversations(principal) {
      ensurePrincipal(principal);
      const candidates = (await listConversationsUnlocked(root, principal.userId)).filter((item) => item.userId === principal.userId);
      const current: AiChatConversation[] = [];
      for (const candidate of candidates) {
        await withDurableAiChatConversationLock(root, principal.userId, candidate.id, async () => {
          const conversation = await loadConversationUnlocked(root, principal.userId, candidate.id);
          if (conversation?.userId === principal.userId) current.push(conversation);
        }, { waitForMs: 2_000 });
      }
      return current.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    },
    async createConversation(principal, title) { ensurePrincipal(principal); const at = now(); assertTimestamp(at, "AI chat timestamp"); const conversation: AiChatConversation = { version: 1, id: `conversation-${randomUUID()}`, userId: principal.userId, title: text(title ?? "새 대화", "Conversation title", 200), messages: [], createdAt: at, updatedAt: at }; await saveConversation(root, conversation); return conversation; },
    async getConversation(principal, conversationId) {
      ensurePrincipal(principal);
      assertIdentityId(conversationId);
      return withDurableAiChatConversationLock(root, principal.userId, conversationId, async () => {
        const conversation = await loadConversationUnlocked(root, principal.userId, conversationId);
        return conversation?.userId === principal.userId ? conversation : null;
      }, { waitForMs: 2_000 });
    },
    async completeMessage(principal, conversationId, messageId, assistantContent) { return completeMessage(principal, conversationId, messageId, assistantContent); },
    async approveExecutionPlan(principal, conversationId, messageId) { return updateExecutionPlan(principal, conversationId, messageId, "approved"); },
    async rejectExecutionPlan(principal, conversationId, messageId) { return updateExecutionPlan(principal, conversationId, messageId, "rejected"); },
    async createExecutionPlanWorkRequest(principal, conversationId, messageId) { return createExecutionPlanWorkRequest(principal, conversationId, messageId); },
    async sendMessage(principal, conversationId, content, sendOptions?: AiChatSendOptions) {
      ensurePrincipal(principal);
      assertIdentityId(conversationId);
      const projectId = sendOptions?.projectId?.trim() || undefined;
      if (projectId) assertIdentityId(projectId);
      const contextSelection = normalizeContextSelection(sendOptions?.contextSelection);
      if (projectId && !contextSelection.projectFiles) throw new Error("Project context unavailable");
      await validateProjectSelection(principal, options, projectId);
      const at = now(); assertTimestamp(at, "AI chat timestamp");
      const attachments = normalizeAttachments(sendOptions?.attachments, at);
      const message = { id: `message-${randomUUID()}`, role: "user" as const, content: text(content, "Message", 20_000), status: "waiting_runtime" as const, createdAt: at, contextSelection, ...(projectId ? { projectId } : {}), ...(attachments.length > 0 ? { attachments } : {}) };
      const next = await withDurableAiChatConversationLock(root, principal.userId, conversationId, async () => {
        const current = await loadConversationUnlocked(root, principal.userId, conversationId);
        if (!current || current.userId !== principal.userId) throw new Error("AI chat conversation not found");
        const updated: AiChatConversation = { ...current, messages: [...current.messages, message], updatedAt: at };
        if (options.memoryService) await options.memoryService.appendPrivateMemory(principal, { kind: "ai-chat-context", content: message.content, source: `ai-chat:${conversationId}` });
        await saveConversationUnlocked(root, updated);
        return updated;
      }, { waitForMs: 2_000 });
      if (!options.runtimeDispatcher) return { conversation: next, runtimeStatus: "waiting_runtime" as const };
      const context = await privateContext(principal, options, projectId, contextSelection);

      let dispatchResult: Awaited<ReturnType<NonNullable<AiChatServiceOptions["runtimeDispatcher"]>>>;
      try {
        dispatchResult = await dispatchForUser(principal.userId, () => options.runtimeDispatcher!({ principal, conversationId, messageId: message.id, content: message.content, ...(attachments.length > 0 ? { attachments } : {}), context, complete: (assistantContent) => completeMessage(principal, conversationId, message.id, assistantContent) }));
      } catch {
        return { conversation: next, runtimeStatus: "waiting_runtime" as const };
      }
      if (dispatchResult.status !== "completed") return { conversation: next, runtimeStatus: "waiting_runtime" as const };
      return { conversation: await completeMessage(principal, conversationId, message.id, dispatchResult.assistantContent, dispatchResult.executionPlan), runtimeStatus: "completed" as const };
    },
  };
}
