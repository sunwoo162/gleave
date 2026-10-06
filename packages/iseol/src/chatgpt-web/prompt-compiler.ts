import { IMPLEMENT_DONE_PAYLOAD } from "./patch-frame-contract.js";
import { createHash } from "node:crypto";
import type { HarnessEvidenceKind, HarnessRuntimeRunEnvelope } from "../harness/contracts.js";
import type { ReasoningTurn, WebWorkerSession } from "./contracts.js";
import { sanitizeCredentialText } from "../security/text-safety.js";

export type WebPromptKind = "initial" | "feedback" | "recovery";
export type WebPromptEvidence = {
  kind: HarnessEvidenceKind | string;
  summary: string;
  reference?: string;
};
export type CompileWebPromptInput = {
  kind: WebPromptKind;
  run: HarnessRuntimeRunEnvelope;
  session: WebWorkerSession;
  priorTurns: ReasoningTurn[];
  desktopEvidence?: WebPromptEvidence[];
};
export type CompiledWebPrompt = {
  version: 1;
  kind: WebPromptKind;
  runId: string;
  stage: HarnessRuntimeRunEnvelope["state"]["stage"];
  generation: number;
  policySha256: string;
  body: string;
  sha256: string;
};
const STRUCTURED_JSON_ALLOWED_INTENTS = [
  "READ_CONTEXT", "RUN_TEST", "RUN_BUILD",
  "GIT_INSPECT", "REQUEST_COMMIT", "CHECK_HTTP",
] as const;

const COMPLETION_TARGETS: Partial<Record<HarnessRuntimeRunEnvelope["state"]["stage"], string>> = {
  ANALYZE: "Complete analysis with decisions and no unresolved reasoning gap.",
  PLAN: "Complete a bounded implementation plan with executable next actions.",
  IMPLEMENT: "Complete the requested implementation through validated Desktop intents and verified feedback.",
  SELF_REVIEW: "Complete self-review with material issues resolved or explicitly blocked.",
};

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function redact(value: string): string {
  return sanitizeCredentialText(value, Math.max(value.length, 1));
}

function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => [key, stable(item)]));
  }
  return value;
}
export function compileWebPrompt(input: CompileWebPromptInput): CompiledWebPrompt {
  const policy = input.run.preflight.policy;
  if (input.run.preflight.status !== "ready" || !policy) throw new Error("ChatGPT Web prompt requires ready Harness policy");
  if (input.session.runId !== input.run.request.runId) throw new Error("ChatGPT Web session runId mismatch");
  if (input.session.stage !== input.run.state.stage) throw new Error("ChatGPT Web session stage mismatch");
  if (input.session.policySha256 !== policy.effectiveSha256) throw new Error("ChatGPT Web session policy mismatch");

  const priorDecisions = input.priorTurns.flatMap((turn) => turn.decisions.map(redact));
  const evidence = (input.desktopEvidence ?? []).map((item) => ({
    kind: item.kind,
    summary: redact(item.summary),
    ...(item.reference === undefined ? {} : { reference: redact(item.reference) }),
  }));
  const structuredJsonOutputContract = {
    responseFormat: "exactly one JSON object only, with no markdown or prose",
    jsonStringEncodingRule: "All output must be valid JSON. Never place an unescaped double quote character inside any JSON string value. In summary and decisions, use single quotes or plain wording for identifiers, action keys, commands, and commit messages. Use standard JSON escaping whenever a backslash, newline, or double quote is unavoidable.",
    cwdRule: "For RUN_TEST, RUN_BUILD, GIT_INSPECT, and REQUEST_COMMIT, cwd must be workspace-relative. Use '.' for the workspace root; never copy the absolute workspaceRoot into cwd.",
    reasoningTurnResult: {
      version: 1,
      runId: input.run.request.runId,
      stage: input.run.state.stage,
      generation: input.session.generation,
      summary: "non-empty string",
      decisions: ["string"],
      intents: [],
      outcome: "continue|stage-complete|blocked-user|retryable",
    },
    desktopIntentCommonRule: "Every Desktop intent MUST include every field in desktopIntentCommonRequired, especially workspaceRoot and policySha256, in addition to its kind-specific required fields.",
    desktopIntentCommonRequired: {
      version: 1,
      intentId: "unique non-empty id",
      runId: input.run.request.runId,
      stage: input.run.state.stage,
      workspaceRoot: input.run.request.targetRoot.replaceAll("\\", "/"),
      policySha256: policy.effectiveSha256,
    },
    requiredFieldsByIntentKind: {
      READ_CONTEXT: ["path"],
      RUN_TEST: ["cwd", "executable", "args", "timeoutMs"],
      RUN_BUILD: ["cwd", "executable", "args", "timeoutMs"],
      GIT_INSPECT: ["cwd"],
      REQUEST_COMMIT: ["cwd", "message", "expectedHead?"],
      CHECK_HTTP: ["url", "timeoutMs"],
    },
    blockerReasonRule: "Include blockerReason only when outcome is blocked-user; otherwise omit it.",
  };
  const patchFrameOutputContract = {
    contract: "patch-frame-v1",
    header: "ISEOL_PATCH_V1",
    completionSignal: IMPLEMENT_DONE_PAYLOAD,
    responseFormat: "The exact first line must be ISEOL_PATCH_V1, with no leading markdown or prose.",
    payloadRule: `After the first newline, return exactly one of two payloads. For implementation work, return exactly one git-apply-compatible single-file raw unified diff through EOF for exactly one file. Do not include Markdown fences, a closing marker, prose, JSON, or additional file patches. If more files remain, return only the next single-file patch in this turn. Only after every intended implementation change has already been applied in prior accepted patch turns, return exactly ${IMPLEMENT_DONE_PAYLOAD}. Do not add a structured control envelope.`,
  };
  const implement = input.run.state.stage === "IMPLEMENT";
  const payload = {
    protocolVersion: 1,
    promptKind: input.kind,
    run: {
      id: input.run.request.runId,
      objective: redact(input.run.request.objective),
      stage: input.run.state.stage,
      ...(input.run.request.projectId ? { projectId: input.run.request.projectId } : {}),
      ...(input.run.request.purposeProfile ? {
        purposeProfile: stable(input.run.request.purposeProfile),
      } : {}),
      ...(input.run.request.projectContext ? {
        projectContext: {
          name: redact(input.run.request.projectContext.name),
          purposeSummary: redact(input.run.request.projectContext.purposeSummary),
          requirements: redact(input.run.request.projectContext.requirements),
        },
      } : {}),
    },
    worker: { generation: input.session.generation },
    policy: {
      effectiveSha256: policy.effectiveSha256,
      sources: policy.sources.map((source) => ({ kind: source.kind, path: source.path, sha256: source.sha256 })),
    },
    completion: COMPLETION_TARGETS[input.run.state.stage] ?? `Complete ${input.run.state.stage} according to Harness evidence requirements.`,
    ...(implement ? {} : { allowedDesktopIntents: STRUCTURED_JSON_ALLOWED_INTENTS }),
    priorDecisions,
    desktopEvidence: evidence,
    recovery: input.kind === "recovery" ? "Resume from the first unfinished verified step; do not repeat verified side effects." : null,
    outputContract: implement ? patchFrameOutputContract : structuredJsonOutputContract,
  };
  const body = JSON.stringify(stable(payload), null, 2);
  return {
    version: 1,
    kind: input.kind,
    runId: input.run.request.runId,
    stage: input.run.state.stage,
    generation: input.session.generation,
    policySha256: policy.effectiveSha256,
    body,
    sha256: sha256(body),
  };
}

