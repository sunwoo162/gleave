import { appendFile, mkdir, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import type { ReasoningTurn } from "./contracts.js";
import { assertReasoningTurn } from "./contracts.js";
import { withDurableReasoningTurnLock } from "./turn-lock.js";

const writeQueues = new Map<string, Promise<unknown>>();
function safeId(value: string, field: string): string {
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,191}$/.test(value)) throw new Error(`${field} is invalid`);
  return value;
}
function turnsFile(root: string, runId: string): string {
  return resolve(root, "web-workers", "runs", safeId(runId, "runId"), "turns.jsonl");
}
async function serialized<T>(key: string, action: () => Promise<T>): Promise<T> {
  const previous = writeQueues.get(key) ?? Promise.resolve();
  const run = previous.catch(() => undefined).then(action);
  writeQueues.set(key, run);
  try { return await run; }
  finally { if (writeQueues.get(key) === run) writeQueues.delete(key); }
}
function semanticTurn(turn: ReasoningTurn): string {
  return JSON.stringify({
    turnId: turn.turnId,
    sessionId: turn.sessionId,
    runId: turn.runId,
    stage: turn.stage,
    generation: turn.generation,
    promptSha256: turn.promptSha256,
    responseSha256: turn.responseSha256,
    summary: turn.summary,
    decisions: turn.decisions,
    desktopIntentIds: turn.desktopIntentIds,
    outcome: turn.outcome,
  });
}

export async function listReasoningTurnsUnlocked(root: string, runId: string): Promise<ReasoningTurn[]> {
  const path = turnsFile(root, runId);
  try {
    const content = await readFile(path, "utf8");
    return content.split(/\r?\n/).filter(Boolean).map((line) => {
      const value = JSON.parse(line);
      assertReasoningTurn(value);
      return value;
    });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

export async function listReasoningTurns(root: string, runId: string): Promise<ReasoningTurn[]> {
  return withDurableReasoningTurnLock(root, runId, () => listReasoningTurnsUnlocked(root, runId), { waitForMs: 2_000 });
}

export async function appendReasoningTurn(root: string, turn: ReasoningTurn): Promise<boolean> {
  assertReasoningTurn(turn);
  const path = turnsFile(root, turn.runId);
  return serialized(path, async () => {
    return withDurableReasoningTurnLock(root, turn.runId, async () => {
      const existing = (await listReasoningTurnsUnlocked(root, turn.runId)).find((item) => item.turnId === turn.turnId);
      if (existing) {
        if (semanticTurn(existing) !== semanticTurn(turn)) throw new Error(`Reasoning turn identity mismatch: ${turn.turnId}`);
        return false;
      }
      await mkdir(dirname(path), { recursive: true });
      await appendFile(path, `${JSON.stringify(turn)}\n`, "utf8");
      return true;
    }, { waitForMs: 2_000 });
  });
}
