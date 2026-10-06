import { randomBytes } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { withDurableRequestBudgetLock } from "./request-budget-lock.js";

export type ExternalRequestState = "reserved" | "consumed" | "unknown";
export type ExternalRequestBudgetRecord = {
  version: 1;
  runId: string;
  limit: number;
  reserved: number;
  consumed: number;
  unknown: number;
  requests: Record<string, {
    state: ExternalRequestState;
    stage: string;
    reservedAt: string;
    completedAt?: string;
  }>;
};

type PersistedBudget = {
  version: 1;
  limit: number;
  reserved: number;
  consumed: number;
  unknown: number;
  requests: Record<string, {
    runId: string;
    state: ExternalRequestState;
    stage: string;
    reservedAt: string;
    completedAt?: string;
  }>;
};

export type RequestBudgetStore = {
  reserve(runId: string, requestId: string, metadata: { stage: string }): Promise<"reserved" | "already-reserved" | "exhausted">;
  complete(runId: string, requestId: string, state: "consumed" | "unknown"): Promise<ExternalRequestBudgetRecord>;
  release(runId: string, requestId: string): Promise<void>;
  inspect(runId: string): Promise<ExternalRequestBudgetRecord | null>;
};

export class ExternalRequestBudgetExhaustedError extends Error {
  constructor() {
    super("external request budget exhausted");
    this.name = "ExternalRequestBudgetExhaustedError";
  }
}

export class ExternalRequestOutcomeUnknownError extends Error {
  constructor() {
    super("external request outcome is UNKNOWN; automatic resubmission is blocked");
    this.name = "ExternalRequestOutcomeUnknownError";
  }
}

const queues = new Map<string, Promise<unknown>>();

function safe(value: string, label: string): string {
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,191}$/.test(value)) throw new Error(`${label} is invalid`);
  return value;
}

function fileFor(root: string): string {
  return resolve(root, "web-workers", "request-budget.json");
}

async function atomicWrite(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temp = `${path}.${process.pid}.${randomBytes(4).toString("hex")}.tmp`;
  await writeFile(temp, JSON.stringify(value, null, 2), "utf8");
  await rename(temp, path);
}

async function load(path: string): Promise<PersistedBudget | null> {
  try { return JSON.parse(await readFile(path, "utf8")) as PersistedBudget; }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

async function serialized<T>(key: string, action: () => Promise<T>): Promise<T> {
  const previous = queues.get(key) ?? Promise.resolve();
  const current = previous.catch(() => undefined).then(action);
  queues.set(key, current);
  try { return await current; }
  finally { if (queues.get(key) === current) queues.delete(key); }
}

export function createRequestBudgetStore(root: string, limit: number, now: () => string = () => new Date().toISOString()): RequestBudgetStore {
  if (!Number.isInteger(limit) || limit <= 0) throw new Error("external request budget limit must be positive");
  const path = fileFor(root);
  async function ensure(): Promise<PersistedBudget> {
    const existing = await load(path);
    if (existing) {
      if (existing.limit !== limit) throw new Error("external request budget limit mismatch");
      return existing;
    }
    return { version: 1, limit, reserved: 0, consumed: 0, unknown: 0, requests: {} };
  }
  function scoped(record: PersistedBudget, runId: string): ExternalRequestBudgetRecord {
    const requests: ExternalRequestBudgetRecord["requests"] = {};
    for (const [requestId, request] of Object.entries(record.requests)) {
      if (request.runId === runId) {
        requests[requestId] = { state: request.state, stage: request.stage, reservedAt: request.reservedAt, ...(request.completedAt ? { completedAt: request.completedAt } : {}) };
      }
    }
    const values = Object.values(requests);
    return {
      version: 1,
      runId,
      limit: record.limit,
      reserved: values.filter((request) => request.state === "reserved").length,
      consumed: values.filter((request) => request.state === "consumed").length,
      unknown: values.filter((request) => request.state === "unknown").length,
      requests,
    };
  }
  return {
    reserve(runId, requestId, metadata) {
      safe(runId, "runId"); safe(requestId, "requestId");
      if (!metadata.stage.trim()) throw new Error("request stage is required");
      return serialized(path, async () => {
        return withDurableRequestBudgetLock(root, async () => {
          const record = await ensure();
          const existing = record.requests[requestId];
          if (existing) {
            if (existing.runId !== runId) throw new Error("external request identity belongs to another Run");
            return "already-reserved";
          }
          if (record.reserved + record.consumed + record.unknown >= record.limit) return "exhausted";
          record.requests[requestId] = { runId, state: "reserved", stage: metadata.stage, reservedAt: now() };
          record.reserved += 1;
          await atomicWrite(path, record);
          return "reserved";
        }, { waitForMs: 2_000 });
      });
    },
    complete(runId, requestId, state) {
      safe(runId, "runId"); safe(requestId, "requestId");
      return serialized(path, async () => {
        return withDurableRequestBudgetLock(root, async () => {
          const record = await ensure();
          const request = record.requests[requestId];
          if (!request) throw new Error(`external request reservation not found: ${requestId}`);
          if (request.runId !== runId) throw new Error("external request identity belongs to another Run");
          if (request.state === "reserved") {
            request.state = state;
            request.completedAt = now();
            record.reserved -= 1;
            record[state] += 1;
            await atomicWrite(path, record);
          }
          return scoped(record, runId);
        }, { waitForMs: 2_000 });
      });
    },
    release(runId, requestId) {
      safe(runId, "runId"); safe(requestId, "requestId");
      return serialized(path, async () => {
        return withDurableRequestBudgetLock(root, async () => {
          const record = await ensure();
          const request = record.requests[requestId];
          if (!request) return;
          if (request.runId !== runId) throw new Error("external request identity belongs to another Run");
          if (request.state === "reserved") {
            record.reserved -= 1;
            delete record.requests[requestId];
            await atomicWrite(path, record);
          }
        }, { waitForMs: 2_000 });
      });
    },
    inspect(runId) {
      safe(runId, "runId");
      return load(path).then((record) => record ? scoped(record, runId) : null);
    },
  };
}
