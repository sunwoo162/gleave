import { createHash } from "node:crypto";
import { resolveBoundActionContext } from "./action-context.js";
import type { ProjectContext } from "../services/project-context.js";
import type {
  ProjectHistoryEvent,
  ProjectHistoryEventType,
  ProjectHistorySource,
  ProjectWorkContext,
} from "../project-model/contracts.js";
import { appendProjectHistoryEventOnce } from "../project-model/history-store.js";

export type DiscordProjectHistoryIdentity = {
  projectId: string;
  nodeId: string;
  runId?: string;
  source: ProjectHistorySource;
  action: string;
  reference: string;
};

export function discordProjectHistoryEventId(
  input: DiscordProjectHistoryIdentity,
): string {
  const key = [
    input.projectId,
    input.nodeId,
    input.runId ?? "",
    input.source,
    input.action,
    input.reference,
  ].join("\u001f");
  return `discord-${createHash("sha256").update(key).digest("hex").slice(0, 32)}`;
}

export type RecordDiscordProjectHistoryInput = {
  modelRoot: string;
  context: ProjectWorkContext & { nodeId: string };
  eventType: Extract<
    ProjectHistoryEventType,
    "discord-project-bound" | "discord-action-recorded" | "integration-action-recorded" | "review-recorded"
  >;
  source: ProjectHistorySource;
  action: string;
  reference: string;
  summary: string;
  at: string;
  occurredAt?: string;
  lifecycle?: ProjectHistoryEvent["lifecycle"];
};

export type RecordDiscordProjectHistoryDependencies = {
  appendOnce?: (root: string, event: ProjectHistoryEvent) => Promise<boolean>;
};

function assertSafeSummary(summary: string): void {
  if (!summary.trim()) throw new Error("Project history summary is required");
  if (/authorization\s*:|bearer\s+|(?:token|secret|password)\s*=/i.test(summary)) {
    throw new Error("Project history summary contains credential-like secret material");
  }
}

export async function recordDiscordProjectHistory(
  input: RecordDiscordProjectHistoryInput,
  deps: RecordDiscordProjectHistoryDependencies = {},
): Promise<boolean> {
  assertSafeSummary(input.summary);
  const identity: DiscordProjectHistoryIdentity = {
    projectId: input.context.projectId,
    nodeId: input.context.nodeId,
    ...(input.context.runId === undefined ? {} : { runId: input.context.runId }),
    source: input.source,
    action: input.action,
    reference: input.reference,
  };
  const event: ProjectHistoryEvent = {
    version: 1,
    id: discordProjectHistoryEventId(identity),
    projectId: input.context.projectId,
    type: input.eventType,
    at: input.at,
    ...(input.occurredAt === undefined ? {} : { occurredAt: input.occurredAt }),
    ...(input.lifecycle === undefined ? {} : { lifecycle: input.lifecycle }),
    summary: input.summary,
    nodeId: input.context.nodeId,
    ...(input.context.runId === undefined ? {} : { runId: input.context.runId }),
    source: input.source,
    action: input.action,
    reference: input.reference,
  };
  return (deps.appendOnce ?? appendProjectHistoryEventOnce)(input.modelRoot, event);
}

export type StoredProjectActionFact = {
  eventType: RecordDiscordProjectHistoryInput["eventType"];
  source: ProjectHistorySource;
  action: string;
  reference: string;
  summary: string;
  occurredAt?: string;
  lifecycle?: ProjectHistoryEvent["lifecycle"];
};

export type RecordStoredProjectActionInput = {
  modelRoot: string;
  bindingRoot: string;
  workspaceRoot?: string;
  guildId: string;
  storedProjectId: string;
  fact: StoredProjectActionFact;
  at: string;
  nodeId?: string;
  runId?: string;
  resolveLegacy?: (projectId: string, guildId: string) => Promise<ProjectContext | null>;
};

export async function recordStoredProjectAction(
  input: RecordStoredProjectActionInput,
): Promise<boolean> {
  const context = await resolveBoundActionContext({
    modelRoot: input.modelRoot,
    bindingRoot: input.bindingRoot,
    ...(input.workspaceRoot === undefined ? {} : { workspaceRoot: input.workspaceRoot }),
    guildId: input.guildId,
    storedProjectId: input.storedProjectId,
    ...(input.nodeId === undefined ? {} : { nodeId: input.nodeId }),
    ...(input.runId === undefined ? {} : { runId: input.runId }),
    ...(input.resolveLegacy === undefined ? {} : { resolveLegacy: input.resolveLegacy }),
  });
  if (!context?.nodeId) return false;
  return recordDiscordProjectHistory({
    modelRoot: input.modelRoot,
    context: { ...context, nodeId: context.nodeId },
    ...input.fact,
    at: input.at,
  });
}
