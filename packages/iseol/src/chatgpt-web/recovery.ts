import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import type { HarnessRuntimeRunEnvelope } from "../harness/contracts.js";
import type { ReasoningTurn, ReasoningTurnResult, WebWorkerSession } from "./contracts.js";
import { assertReasoningTurnResult, persistedWebWorkerResultContract } from "./contracts.js";
import { compileWebPrompt, type WebPromptEvidence } from "./prompt-compiler.js";
import {
  getActiveWebWorkerSession,
  replaceLostWebWorkerSession,
} from "./session-store.js";

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function replacementSessionId(runId: string, stage: string, generation: number): string {
  const digest = sha256(`${runId}\n${stage}\n${generation}`).slice(0, 24);
  return `web-${digest}`;
}

export async function assertCurrentHarnessPolicy(run: HarnessRuntimeRunEnvelope): Promise<void> {
  const policy = run.preflight.policy;
  if (run.preflight.status !== "ready" || !policy) throw new Error("ChatGPT Web result requires ready Harness policy");
  const verified: Array<{ kind: string; path: string; sha256: string }> = [];
  for (const source of policy.sources) {
    const content = await readFile(source.path, "utf8");
    const actual = sha256(content);
    if (actual !== source.sha256) throw new Error(`ChatGPT Web policy source hash mismatch: ${source.path}`);
    verified.push({ kind: source.kind, path: source.path, sha256: actual });
  }
  const effective = sha256(verified.map((source) => `${source.kind}\n${source.path}\n${source.sha256}`).join("\n---\n"));
  if (effective !== policy.effectiveSha256) throw new Error("ChatGPT Web effective policy digest mismatch");
}
export async function assertActiveWebWorkerResult(
  workerRoot: string,
  run: HarnessRuntimeRunEnvelope,
  session: WebWorkerSession,
  result: unknown,
): Promise<ReasoningTurnResult> {
  assertReasoningTurnResult(result);
  if (result.runId !== run.request.runId) throw new Error("ChatGPT Web result Run mismatch");
  if (result.stage !== run.state.stage) throw new Error("ChatGPT Web result stage mismatch");
  if (result.generation !== session.generation) throw new Error("ChatGPT Web result generation is stale");
  const active = await getActiveWebWorkerSession(workerRoot, run.request.runId, run.state.stage);
  if (!active || active.sessionId !== session.sessionId || active.generation !== session.generation) {
    throw new Error("ChatGPT Web result belongs to a stale session generation");
  }
  const policy = run.preflight.policy;
  if (!policy || session.policySha256 !== policy.effectiveSha256) throw new Error("ChatGPT Web session policy is stale");
  await assertCurrentHarnessPolicy(run);
  return result;
}

export async function recoverWebWorkerSession(input: {
  workerRoot: string;
  run: HarnessRuntimeRunEnvelope;
  session: WebWorkerSession;
  priorTurns: ReasoningTurn[];
  desktopEvidence: WebPromptEvidence[];
  at: string;
}) {
  await assertCurrentHarnessPolicy(input.run);
  const policy = input.run.preflight.policy!;
  const generation = input.session.generation + 1;
  const replacement: WebWorkerSession = {
    version: 1,
    sessionId: replacementSessionId(input.run.request.runId, input.run.state.stage, generation),
    runId: input.run.request.runId,
    stage: input.run.state.stage,
    generation,
    recoveryCount: (input.session.recoveryCount ?? Math.max(0, input.session.generation - 1)) + 1,
    policySha256: policy.effectiveSha256,
    status: "ready",
    resultContract: persistedWebWorkerResultContract(input.session),
    createdAt: input.at,
  };
  const session = await replaceLostWebWorkerSession(input.workerRoot, input.session.sessionId, replacement, input.at);
  const prompt = compileWebPrompt({
    kind: "recovery",
    run: input.run,
    session,
    priorTurns: input.priorTurns,
    desktopEvidence: input.desktopEvidence,
  });
  return { session, prompt };
}
