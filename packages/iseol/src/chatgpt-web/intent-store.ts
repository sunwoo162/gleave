import { randomBytes } from "node:crypto";
import { mkdir, readFile, readdir, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import type { DesktopIntent } from "./contracts.js";
import { assertDesktopIntent } from "./contracts.js";
import { withDurableDesktopIntentLock } from "./intent-lock.js";

export type DesktopIntentRecord = {
  version: 1;
  intent: DesktopIntent;
  status: "accepted" | "rejected";
  recordedAt: string;
  reason?: string;
};
export type RecordDesktopIntentInput = Omit<DesktopIntentRecord, "version">;

const writeQueues = new Map<string, Promise<unknown>>();
function safeId(value: string, field: string): string {
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,191}$/.test(value)) throw new Error(`${field} is invalid`);
  return value;
}
function intentFile(root: string, runId: string, intentId: string): string {
  return resolve(root, "web-workers", "runs", safeId(runId, "runId"), "intents", `${safeId(intentId, "intentId")}.json`);
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
function assertInput(value: unknown): asserts value is RecordDesktopIntentInput {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Desktop intent record input must be an object");
  const input = value as Record<string, unknown>;
  const allowed = new Set(["intent", "status", "recordedAt", "reason"]);
  const unexpected = Object.keys(input).find((key) => !allowed.has(key));
  if (unexpected) throw new Error(`Desktop intent record has unexpected field: ${unexpected}`);
  assertDesktopIntent(input.intent);
  if (input.status !== "accepted" && input.status !== "rejected") throw new Error("Desktop intent record status is invalid");
  if (typeof input.recordedAt !== "string" || Number.isNaN(Date.parse(input.recordedAt))) throw new Error("Desktop intent record recordedAt must be an ISO timestamp");
  if (input.status === "rejected" && (typeof input.reason !== "string" || !input.reason.trim())) throw new Error("Rejected Desktop intent requires reason");
  if (input.status === "accepted" && input.reason !== undefined) throw new Error("Accepted Desktop intent cannot carry reason");
}
function semanticRecord(record: DesktopIntentRecord): string {
  return JSON.stringify({ intent: record.intent, status: record.status, reason: record.reason ?? null });
}

export async function loadDesktopIntentUnlocked(root: string, runId: string, intentId: string): Promise<DesktopIntentRecord | null> {
  try {
    const value = JSON.parse(await readFile(intentFile(root, runId, intentId), "utf8")) as DesktopIntentRecord;
    assertDesktopIntent(value.intent);
    return value;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

export async function loadDesktopIntent(root: string, runId: string, intentId: string): Promise<DesktopIntentRecord | null> {
  return withDurableDesktopIntentLock(root, runId, intentId, () => loadDesktopIntentUnlocked(root, runId, intentId), { waitForMs: 2_000 });
}

export async function listDesktopIntentsUnlocked(root: string, runId: string): Promise<DesktopIntentRecord[]> {
  const directory = resolve(root, "web-workers", "runs", safeId(runId, "runId"), "intents");
  let names: string[];
  try {
    names = await readdir(directory);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
  const records: DesktopIntentRecord[] = [];
  for (const name of names.filter((item) => item.endsWith(".json"))) {
    const intentId = name.slice(0, -5);
    const record = await loadDesktopIntentUnlocked(root, runId, intentId);
    if (record) records.push(record);
  }
  return records.sort((a, b) => a.recordedAt.localeCompare(b.recordedAt));
}

export async function listDesktopIntents(root: string, runId: string): Promise<DesktopIntentRecord[]> {
  const candidates = await listDesktopIntentsUnlocked(root, runId);
  const records: DesktopIntentRecord[] = [];
  for (const candidate of candidates) {
    const intentId = candidate.intent.intentId;
    await withDurableDesktopIntentLock(root, runId, intentId, async () => {
      const current = await loadDesktopIntentUnlocked(root, runId, intentId);
      if (current?.intent.runId === runId && current.intent.intentId === intentId) records.push(current);
    }, { waitForMs: 2_000 });
  }
  return records.sort((a, b) => a.recordedAt.localeCompare(b.recordedAt));
}

export async function recordDesktopIntent(root: string, input: RecordDesktopIntentInput): Promise<DesktopIntentRecord> {
  assertInput(input);
  const path = intentFile(root, input.intent.runId, input.intent.intentId);
  return serialized(path, async () => {
    return withDurableDesktopIntentLock(root, input.intent.runId, input.intent.intentId, async () => {
      const next: DesktopIntentRecord = { version: 1, intent: structuredClone(input.intent), status: input.status, recordedAt: input.recordedAt, ...(input.reason === undefined ? {} : { reason: input.reason }) };
      const existing = await loadDesktopIntentUnlocked(root, input.intent.runId, input.intent.intentId);
      if (existing) {
        if (semanticRecord(existing) !== semanticRecord(next)) throw new Error(`Desktop intent identity conflict: ${input.intent.intentId}`);
        return existing;
      }
      await atomicJson(path, next);
      return next;
    }, { waitForMs: 2_000 });
  });
}
