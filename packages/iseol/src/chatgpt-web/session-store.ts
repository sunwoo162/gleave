import { randomBytes } from "node:crypto";
import { mkdir, readdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import type { HarnessRunStage } from "../harness/contracts.js";
import type { WebWorkerSession } from "./contracts.js";
import { assertWebWorkerSession, persistedWebWorkerResultContract } from "./contracts.js";
import { withDurableWebWorkerSessionLock } from "./session-lock.js";

const writeQueues = new Map<string, Promise<unknown>>();

function safeId(value: string, field: string): string {
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,191}$/.test(value)) throw new Error(`${field} is invalid`);
  return value;
}
function sessionFile(root: string, sessionId: string): string {
  return resolve(root, "web-workers", "sessions", `${safeId(sessionId, "sessionId")}.json`);
}
function activeFile(root: string, runId: string, stage: HarnessRunStage): string {
  return resolve(root, "web-workers", "runs", safeId(runId, "runId"), "stages", stage, "active-session.json");
}
async function atomicJson(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temp = `${path}.${process.pid}.${randomBytes(4).toString("hex")}.tmp`;
  await writeFile(temp, JSON.stringify(value, null, 2), "utf8");
  await rename(temp, path);
}
async function serialized<T>(key: string, action: () => Promise<T>): Promise<T> {
  const previous = writeQueues.get(key) ?? Promise.resolve();
  const run = previous.catch(() => undefined).then(action);
  writeQueues.set(key, run);
  try { return await run; }
  finally { if (writeQueues.get(key) === run) writeQueues.delete(key); }
}

export async function loadWebWorkerSessionUnlocked(root: string, sessionId: string): Promise<WebWorkerSession | null> {
  try {
    const value = JSON.parse(await readFile(sessionFile(root, sessionId), "utf8"));
    assertWebWorkerSession(value);
    return value;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

export async function loadWebWorkerSession(root: string, sessionId: string): Promise<WebWorkerSession | null> {
  const candidate = await loadWebWorkerSessionUnlocked(root, sessionId);
  if (!candidate) return null;
  return withDurableWebWorkerSessionLock(root, candidate.runId, candidate.stage, () => loadWebWorkerSessionUnlocked(root, sessionId), { waitForMs: 2_000 });
}

export async function getPointedWebWorkerSessionUnlocked(root: string, runId: string, stage: HarnessRunStage): Promise<WebWorkerSession | null> {
  try {
    const pointer = JSON.parse(await readFile(activeFile(root, runId, stage), "utf8")) as { sessionId?: string };
    if (!pointer.sessionId) throw new Error("Active Web worker session pointer is invalid");
    return await loadWebWorkerSessionUnlocked(root, pointer.sessionId);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

export async function getPointedWebWorkerSession(root: string, runId: string, stage: HarnessRunStage): Promise<WebWorkerSession | null> {
  return withDurableWebWorkerSessionLock(root, runId, stage, () => getPointedWebWorkerSessionUnlocked(root, runId, stage), { waitForMs: 2_000 });
}

export async function getActiveWebWorkerSessionUnlocked(root: string, runId: string, stage: HarnessRunStage): Promise<WebWorkerSession | null> {
  const session = await getPointedWebWorkerSessionUnlocked(root, runId, stage);
  return session && session.status !== "lost" && session.status !== "closed" ? session : null;
}

export async function getActiveWebWorkerSession(root: string, runId: string, stage: HarnessRunStage): Promise<WebWorkerSession | null> {
  const session = await getPointedWebWorkerSession(root, runId, stage);
  return session && session.status !== "lost" && session.status !== "closed" ? session : null;
}
export async function createWebWorkerSession(root: string, session: WebWorkerSession): Promise<WebWorkerSession> {
  assertWebWorkerSession(session);
  if (!session.resultContract) throw new Error("Web worker session result contract is required");
  const key = activeFile(root, session.runId, session.stage);
  return serialized(key, async () => {
    return withDurableWebWorkerSessionLock(root, session.runId, session.stage, async () => {
      const existingById = await loadWebWorkerSessionUnlocked(root, session.sessionId);
      if (existingById) {
        if (JSON.stringify(existingById) !== JSON.stringify(session)) throw new Error(`Web worker session identity conflict: ${session.sessionId}`);
        return existingById;
      }
      const active = await getActiveWebWorkerSessionUnlocked(root, session.runId, session.stage);
      if (active) throw new Error(`Web worker active session already exists: ${active.sessionId}`);
      await atomicJson(sessionFile(root, session.sessionId), session);
      await atomicJson(key, { version: 1, sessionId: session.sessionId, generation: session.generation });
      return structuredClone(session);
    }, { waitForMs: 2_000 });
  });
}

export async function replaceLostWebWorkerSession(
  root: string,
  currentSessionId: string,
  replacement: WebWorkerSession,
  at: string,
  deps: { beforeReplacementWrite?: () => Promise<void>; beforePointerUpdate?: () => Promise<void> } = {},
): Promise<WebWorkerSession> {
  assertWebWorkerSession(replacement);
  if (!replacement.resultContract) throw new Error("Replacement session result contract is required");
  const current = await loadWebWorkerSession(root, currentSessionId);
  if (!current) throw new Error(`Web worker session not found: ${currentSessionId}`);
  const key = activeFile(root, current.runId, current.stage);
  return serialized(key, async () => {
    return withDurableWebWorkerSessionLock(root, current.runId, current.stage, async () => {
      const latest = await loadWebWorkerSessionUnlocked(root, currentSessionId);
      if (!latest) throw new Error(`Web worker session not found: ${currentSessionId}`);
      if (replacement.runId !== latest.runId || replacement.stage !== latest.stage) throw new Error("Replacement session run/stage mismatch");
      if (replacement.generation !== latest.generation + 1) throw new Error("Replacement session generation must increment by one");
      if (replacement.policySha256 !== latest.policySha256) throw new Error("Replacement session policySha256 mismatch");
      if (replacement.resultContract !== persistedWebWorkerResultContract(latest)) throw new Error("Replacement session result contract mismatch");
      const lost: WebWorkerSession = { ...latest, status: "lost", closedAt: at };
      await atomicJson(sessionFile(root, latest.sessionId), lost);
      await deps.beforeReplacementWrite?.();
      await atomicJson(sessionFile(root, replacement.sessionId), replacement);
      await deps.beforePointerUpdate?.();
      await atomicJson(key, { version: 1, sessionId: replacement.sessionId, generation: replacement.generation });
      return structuredClone(replacement);
    }, { waitForMs: 2_000 });
  });
}

export async function repairActiveWebWorkerSession(
  root: string,
  runId: string,
  stage: HarnessRunStage,
): Promise<WebWorkerSession | null> {
  const key = activeFile(root, runId, stage);
  return serialized(key, async () => {
    return withDurableWebWorkerSessionLock(root, runId, stage, async () => {
      const directory = resolve(root, "web-workers", "sessions");
      let names: string[];
      try { names = await readdir(directory); }
      catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
        throw error;
      }
      const ready: WebWorkerSession[] = [];
      for (const name of names.filter((item) => item.endsWith(".json"))) {
        const id = name.slice(0, -5);
        try {
          const session = await loadWebWorkerSessionUnlocked(root, id);
          if (session && session.runId === runId && session.stage === stage && session.status === "ready") ready.push(session);
        } catch {
          // Invalid historical records are not candidates for activation.
        }
      }
      if (ready.length > 1) throw new Error(`Conflicting active Web worker replacement generations for ${runId}/${stage}`);
      const candidate = ready[0];
      if (!candidate) return null;
      const pointed = await getPointedWebWorkerSessionUnlocked(root, runId, stage);
      if (pointed?.status === "lost") {
        if (candidate.generation !== pointed.generation + 1) {
          throw new Error(`Web worker replacement generation does not follow lost session: ${candidate.sessionId}`);
        }
        if (candidate.resultContract !== persistedWebWorkerResultContract(pointed)) {
          throw new Error(`Web worker replacement result contract mismatch: ${candidate.sessionId}`);
        }
      }
      if (!pointed || pointed.sessionId !== candidate.sessionId || pointed.generation !== candidate.generation) {
        await atomicJson(key, { version: 1, sessionId: candidate.sessionId, generation: candidate.generation });
      }
      return structuredClone(candidate);
    }, { waitForMs: 2_000 });
  });
}

export async function updateWebWorkerSession(
  root: string,
  session: WebWorkerSession,
): Promise<WebWorkerSession> {
  assertWebWorkerSession(session);
  const key = activeFile(root, session.runId, session.stage);
  return serialized(key, async () => {
    return withDurableWebWorkerSessionLock(root, session.runId, session.stage, async () => {
      const current = await loadWebWorkerSessionUnlocked(root, session.sessionId);
      if (!current) throw new Error(`Web worker session not found: ${session.sessionId}`);
      if (current.runId !== session.runId || current.stage !== session.stage || current.generation !== session.generation) {
        throw new Error(`Web worker session identity mismatch: ${session.sessionId}`);
      }
      if (persistedWebWorkerResultContract(current) !== persistedWebWorkerResultContract(session)) {
        throw new Error(`Web worker session result contract mismatch: ${session.sessionId}`);
      }
      const active = await getActiveWebWorkerSessionUnlocked(root, session.runId, session.stage);
      if (!active || active.sessionId !== session.sessionId || active.generation !== session.generation) {
        throw new Error(`Web worker session is not active: ${session.sessionId}`);
      }
      await atomicJson(sessionFile(root, session.sessionId), session);
      return structuredClone(session);
    }, { waitForMs: 2_000 });
  });
}
