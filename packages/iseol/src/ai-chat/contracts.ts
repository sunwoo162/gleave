import type { MemoryService } from "../memory/contracts.js";
import type { Principal } from "../identity/contracts.js";
import type { LearningService } from "../learning/contracts.js";
import type { SettingsService } from "../settings/contracts.js";
import type { ActivityPayload, ActivityService, ActivityVerificationStatus, ActivityActorType, ActivityStatus } from "../activity/contracts.js";
import type { UserProjectService } from "../project-model/user-project-service.js";
import type { ProjectWorkRequest } from "../project-model/work-request.js";
import type { StudyService } from "../study/contracts.js";
import type { TeamService } from "../teams/contracts.js";
import type { NotificationService } from "../notifications/contracts.js";
import type { AiAgentProfileService } from "../ai-agent/contracts.js";
import type { UserRuntimeDispatchGate } from "../runtime/user-runtime-dispatch-gate.js";

export type AiChatAttachment = { version: 1; id: string; name: string; mimeType: string; size: number; content: string; createdAt: string };
export type AiChatAttachmentInput = { name: string; mimeType?: string; content: string };
export type AiChatContextSelection = { memory: boolean; projectFiles: boolean; learningHistory: boolean; activityTimeline: boolean; teamDocs: boolean };
export type AiChatExecutionPlanOperation = "read" | "write" | "run" | "external";
export type AiChatExecutionPlanStep = { id: string; title: string; description: string; operation: AiChatExecutionPlanOperation; approvalRequired: boolean };
export type AiChatExecutionPlanInput = { title: string; summary: string; steps: AiChatExecutionPlanStep[] };
export type AiChatExecutionPlan = AiChatExecutionPlanInput & { version: 1; id: string; status: "proposed" | "approved" | "rejected"; createdAt: string; updatedAt: string; approvedAt?: string; rejectedAt?: string; workRequestId?: string };
export type AiChatMessage = { id: string; role: "user" | "assistant" | "system"; content: string; status: "persisted" | "waiting_runtime"; createdAt: string; projectId?: string; contextSelection?: AiChatContextSelection; attachments?: AiChatAttachment[]; executionPlan?: AiChatExecutionPlan };
export type AiChatConversation = { version: 1; id: string; userId: string; title: string; messages: AiChatMessage[]; createdAt: string; updatedAt: string };
export type AiChatContextMemory = { id: string; kind: string; content: string; source?: string; createdAt: string };
export type AiChatContextLearning = {
  sessions: Array<{ id: string; planId: string; status: "active" | "completed"; startedAt: string; completedAt?: string }>;
  attempts: Array<{ id: string; sessionId: string; questionId: string; answer: string; correct?: boolean; submittedAt: string }>;
};
export type AiChatContextProject = { id: string; name: string; objective: string; purpose: string; teamMode: string; status: string; updatedAt: string };
export type AiChatContextActivity = { id: string; sourceType: string; sourceId: string; eventType: string; actorType: ActivityActorType; verificationStatus: ActivityVerificationStatus; status: ActivityStatus; payload: ActivityPayload; occurredAt: string };
export type AiChatContextTeamDoc = { id: string; teamId: string; teamName: string; kind: "study-space" | "curriculum-link" | "study-task" | "shared-memory"; title: string; content: string; createdAt: string; dueLocalDate?: string; sourceMemoryId?: string };
export type AiChatAgentProfile = { name: string; personality: string; tone: string; role: string };
export type AiChatContextSnapshot = { scope: "private"; memories: AiChatContextMemory[]; agentProfile?: AiChatAgentProfile; learning?: AiChatContextLearning; projects?: AiChatContextProject[]; activityTimeline?: AiChatContextActivity[]; teamDocs?: AiChatContextTeamDoc[] };
export type AiChatRuntimeDispatchRequest = { principal: Principal; conversationId: string; messageId: string; content: string; attachments?: AiChatAttachment[]; context: AiChatContextSnapshot; complete: (assistantContent: string) => Promise<AiChatConversation> };
export type AiChatRuntimeDispatchResult =
  | { status: "completed"; assistantContent: string; executionPlan?: AiChatExecutionPlanInput }
  | { status: "accepted" | "waiting"; blocker?: string };
export type AiChatRuntimeDispatcher = (request: AiChatRuntimeDispatchRequest) => Promise<AiChatRuntimeDispatchResult>;
export type AiChatSendOptions = { projectId?: string; contextSelection?: AiChatContextSelection; attachments?: AiChatAttachmentInput[] };
export type AiChatService = {
  listConversations(principal: Principal): Promise<AiChatConversation[]>;
  createConversation(principal: Principal, title?: string): Promise<AiChatConversation>;
  getConversation(principal: Principal, conversationId: string): Promise<AiChatConversation | null>;
  completeMessage(principal: Principal, conversationId: string, messageId: string, assistantContent: string): Promise<AiChatConversation>;
  approveExecutionPlan(principal: Principal, conversationId: string, messageId: string): Promise<AiChatConversation>;
  rejectExecutionPlan(principal: Principal, conversationId: string, messageId: string): Promise<AiChatConversation>;
  createExecutionPlanWorkRequest(principal: Principal, conversationId: string, messageId: string): Promise<{ conversation: AiChatConversation; workRequest: ProjectWorkRequest; created: boolean }>;
  sendMessage(principal: Principal, conversationId: string, content: string, options?: AiChatSendOptions): Promise<{ conversation: AiChatConversation; runtimeStatus: "waiting_runtime" | "completed" }>;
};
export type AiChatServiceOptions = { memoryService?: MemoryService; learningService?: LearningService; activityService?: ActivityService; userProjectService?: UserProjectService; teamService?: TeamService; studyService?: StudyService; settingsService?: SettingsService; notificationService?: NotificationService; aiAgentProfileService?: AiAgentProfileService; now?: () => string; runtimeDispatcher?: AiChatRuntimeDispatcher; dispatchForUser?: UserRuntimeDispatchGate };
