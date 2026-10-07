import type { ProjectBriefV1 } from "../integrations/eeee-contracts.js";
import { composeAgentTeams, type ComposeAgentTeamsInput, type QualityMemoryReference } from "./team-composer.js";
import { validateWorkTask, type WorkTask } from "./contracts.js";
import type { AgentOrganizationPlan } from "./registry.js";

export type ExecutionPlanStatus = "planned" | "running" | "blocked" | "completed" | "failed" | "cancelled";

export type ExecutionEvent = {
  type: "plan.created" | "task.started" | "task.completed" | "task.failed" | "task.failure.routed";
  taskId?: string;
  message?: string;
  at: string;
};

export type ProjectExecutionPlan = {
  schemaVersion: 1;
  projectId: string;
  requestId: string;
  projectRevision: number;
  status: ExecutionPlanStatus;
  organization: AgentOrganizationPlan;
  tasks: WorkTask[];
  events: ExecutionEvent[];
};

export type IseolExecutionService = {
  createPlan(input: ComposeAgentTeamsInput): ProjectExecutionPlan;
  readyTasks(plan: ProjectExecutionPlan): WorkTask[];
  transition(plan: ProjectExecutionPlan, taskId: string, status: WorkTask["status"], expectedRevision?: number): ProjectExecutionPlan;
  routeFailure(plan: ProjectExecutionPlan, taskId: string, reason: string, expectedRevision?: number): ProjectExecutionPlan;
};

export function createIseolExecutionService(now: () => string = () => new Date().toISOString()): IseolExecutionService {
  function createPlan(input: ComposeAgentTeamsInput): ProjectExecutionPlan {
    const organization = composeAgentTeams(input);
    const tasks = decompose(input.brief, organization);
    return {
      schemaVersion: 1,
      projectId: input.brief.projectId,
      requestId: input.brief.requestId,
      projectRevision: 0,
      status: "planned",
      organization,
      tasks,
      events: [{ type: "plan.created", at: now(), message: "ISEOL created an executable project task DAG" }],
    };
  }

  function readyTasks(plan: ProjectExecutionPlan): WorkTask[] {
    const completed = new Set(plan.tasks.filter((task) => task.status === "completed").map((task) => task.id));
    return plan.tasks.filter((task) => task.status === "planned" && task.dependencies.every((dependency) => completed.has(dependency)));
  }

  function transition(
    plan: ProjectExecutionPlan,
    taskId: string,
    status: WorkTask["status"],
    expectedRevision = plan.projectRevision,
  ): ProjectExecutionPlan {
    assertRevision(plan, expectedRevision);
    const task = plan.tasks.find((candidate) => candidate.id === taskId);
    if (!task) throw new Error(`task not found: ${taskId}`);
    if (status === "running" && !readyTasks(plan).some((candidate) => candidate.id === taskId)) {
      throw new Error(`task is not ready: ${taskId}`);
    }
    if (status === "completed") validateWorkTask({ ...task, status, artifacts: task.artifacts });
    const tasks = plan.tasks.map((candidate) => candidate.id === taskId ? { ...candidate, status } : candidate);
    const eventType = status === "completed" ? "task.completed" : status === "failed" ? "task.failed" : status === "running" ? "task.started" : undefined;
    const events = eventType ? [...plan.events, { type: eventType, taskId, at: now() } satisfies ExecutionEvent] : plan.events;
    const allCompleted = tasks.length > 0 && tasks.every((candidate) => candidate.status === "completed");
    return { ...plan, status: allCompleted ? "completed" : status === "running" ? "running" : plan.status, tasks, events };
  }

  function routeFailure(plan: ProjectExecutionPlan, taskId: string, reason: string, expectedRevision = plan.projectRevision): ProjectExecutionPlan {
    assertRevision(plan, expectedRevision);
    const task = plan.tasks.find((candidate) => candidate.id === taskId);
    if (!task) throw new Error(`task not found: ${taskId}`);
    if (task.status !== "failed") throw new Error(`failed task required: ${taskId}`);
    return {
      ...plan,
      status: "running",
      tasks: plan.tasks.map((candidate) => candidate.id === taskId ? { ...candidate, status: "retrying" } : candidate),
      events: [...plan.events, { type: "task.failure.routed", taskId, message: reason, at: now() }],
    };
  }

  return { createPlan, readyTasks, transition, routeFailure };
}

function assertRevision(plan: ProjectExecutionPlan, expectedRevision: number): void {
  if (expectedRevision !== plan.projectRevision) throw new Error("stale project revision");
}

function decompose(brief: ProjectBriefV1, organization: AgentOrganizationPlan): WorkTask[] {
  const isTodo = /todo|할s*일|체크리스트/i.test(`${brief.userGoal} ${brief.scope.join(" ")}`);
  const ids = new Map(organization.workstreams.map((workstream) => [workstream.id, workstream]));
  const agent = (workstreamId: string, role: string): string => {
    const workstream = ids.get(workstreamId);
    return workstream?.agents.find((candidate) => candidate.role === role)?.id ?? `${brief.projectId}:${workstreamId}:${role}`;
  };
  const make = (suffix: string, objective: string, workstreamId: string, role: string, dependencies: string[], ownedPaths: string[], acceptanceCriteria: string[]): WorkTask => ({
    schemaVersion: 1,
    id: `${brief.projectId}:${suffix}`,
    projectId: brief.projectId,
    projectRevision: 0,
    objective,
    dependencies,
    assignedAgentId: agent(workstreamId, role),
    reviewerAgentId: agent(workstreamId, "reviewer"),
    ownedPaths,
    acceptanceCriteria,
    status: "planned",
    artifacts: [],
  });

  if (!isTodo) {
    const delivery = make("delivery", "Implement the requested product behavior", "delivery", "specialist", [], ["src/delivery"], ["requested behavior is implemented"]);
    const qa = make("independent-qa", "Independently verify the integrated result", "qa", "qa-owner", [delivery.id], ["tests"], ["independent checks pass"]);
    const release = make("release", "Prepare a verified release", "integration", "lead", [qa.id], ["docs"], ["release evidence is complete"]);
    return [delivery, qa, release];
  }

  const design = make("design-baseline", "Record the Stayfolio-derived design baseline", "design", "specialist", [], ["docs/design"], ["DESIGN.md defines tokens and responsive rules"]);
  const scaffold = make("scaffold", "Create the FSD project scaffold", "frontend", "specialist", [design.id], ["src", "tests"], ["FSD layers and runnable scripts exist"]);
  const behavior = make("todo-behavior", "Implement todo creation, completion, persistence, and deletion", "frontend", "specialist", [scaffold.id], ["src/features", "src/entities"], ["todo user flows work after reload"]);
  const e2e = make("user-e2e", "Verify todo flows as a real user across responsive viewports", "qa", "qa-owner", [behavior.id], ["tests/e2e", "artifacts/e2e"], ["user scenario and viewport matrix pass"]);
  const qa = make("independent-qa", "Run independent requirement, accessibility, visual, encoding, and regression QA", "qa", "qa-owner", [e2e.id], ["artifacts/qa"], ["QA report has evidence for every release check"]);
  const release = make("release", "Integrate and release the completed todo project", "integration", "lead", [qa.id], ["README.md", "docs", "release"], ["ClaimLatch receipt and release manifest are present"]);
  return [design, scaffold, behavior, e2e, qa, release];
}
