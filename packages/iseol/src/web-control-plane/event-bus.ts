import { randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { mkdirSync as mkdirSyncBlocking, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

export type WebProductEvent = {
  id: string;
  type: string;
  occurredAt: string;
  scope?: { projectId?: string; campaignId?: string; prototypeId?: string; runId?: string };
  payload: Record<string, unknown>;
};

export type WebProductEventInput = Omit<WebProductEvent, "id" | "occurredAt"> & { occurredAt?: string };
export type WebProductEventListener = (event: WebProductEvent) => void;

const EVENT_ID_PATTERN = /^[A-Za-z0-9._:-]{1,256}$/;
const EVENT_TYPE_MAX_LENGTH = 128;
const EVENT_RECORD_MAX_BYTES = 128 * 1024;

export type WebProductEventBusOptions = {
  /** Explicit local journal root. When omitted the bus stays live-only. */
  journalRoot?: string;
};

function eventDirectory(root: string): string { return join(resolve(root), "events"); }

function eventPath(root: string, id: string): string {
  if (!EVENT_ID_PATTERN.test(id)) throw new Error("invalid web event id");
  return join(eventDirectory(root), `${id}.json`);
}

function validStoredEvent(value: unknown): value is WebProductEvent {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const event = value as Record<string, unknown>;
  if (typeof event.id !== "string" || !EVENT_ID_PATTERN.test(event.id)) return false;
  if (typeof event.type !== "string" || event.type.length === 0 || event.type.length > EVENT_TYPE_MAX_LENGTH) return false;
  if (typeof event.occurredAt !== "string" || Number.isNaN(Date.parse(event.occurredAt))) return false;
  if (!event.payload || typeof event.payload !== "object" || Array.isArray(event.payload)) return false;
  if (event.scope !== undefined && (!event.scope || typeof event.scope !== "object" || Array.isArray(event.scope))) return false;
  return Buffer.byteLength(JSON.stringify(event), "utf8") <= EVENT_RECORD_MAX_BYTES;
}

function persistEvent(root: string, event: WebProductEvent): void {
  const directory = eventDirectory(root);
  mkdirSyncBlocking(directory, { recursive: true });
  const target = eventPath(root, event.id);
  const temporary = `${target}.${randomUUID()}.tmp`;
  try {
    writeFileSync(temporary, JSON.stringify(event), { encoding: "utf8", flag: "wx" });
    renameSync(temporary, target);
  } catch (error) {
    try { unlinkSync(temporary); } catch { /* preserve the original journal error */ }
    // A journal write failure must not turn a successful domain mutation into
    // an unknown result. The stream remains live-only until the next restart.
    void error;
  }
}

/**
 * Process-local refresh signal bus with an optional durable replay journal.
 * Existing callers that omit a journal root retain the live-only behavior.
 */
export class WebProductEventBus {
  private readonly listeners = new Set<WebProductEventListener>();
  private sequence = 0;
  private readonly journalRoot?: string;

  constructor(options: WebProductEventBusOptions = {}) {
    this.journalRoot = options.journalRoot?.trim() ? resolve(options.journalRoot) : undefined;
  }

  publish(input: WebProductEventInput): WebProductEvent {
    const event: WebProductEvent = {
      id: `${Date.now().toString(36)}-${(++this.sequence).toString(36)}-${randomUUID()}`,
      type: input.type,
      occurredAt: input.occurredAt ?? new Date().toISOString(),
      ...(input.scope ? { scope: { ...input.scope } } : {}),
      payload: { ...input.payload },
    };
    if (this.journalRoot) persistEvent(this.journalRoot, event);
    for (const listener of [...this.listeners]) {
      try { listener(event); } catch { /* observers must not break domain actions */ }
    }
    return event;
  }

  private async loadJournalEvents(): Promise<WebProductEvent[]> {
    if (!this.journalRoot) return [];
    let entries;
    try {
      entries = await readdir(eventDirectory(this.journalRoot), { withFileTypes: true });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw error;
    }
    const events: WebProductEvent[] = [];
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
      try {
        const raw = await readFile(join(eventDirectory(this.journalRoot), entry.name), "utf8");
        const parsed: unknown = JSON.parse(raw);
        if (validStoredEvent(parsed)) events.push(parsed);
      } catch {
        // A malformed record cannot be replayed as if it were authoritative.
      }
    }
    events.sort((left, right) => left.occurredAt.localeCompare(right.occurredAt) || left.id.localeCompare(right.id));
    return events;
  }

  async replayAll(): Promise<WebProductEvent[]> {
    return this.loadJournalEvents();
  }

  async replayAfter(afterEventId?: string): Promise<WebProductEvent[]> {
    if (!afterEventId || !EVENT_ID_PATTERN.test(afterEventId)) return [];
    const events = await this.loadJournalEvents();
    const cursor = events.findIndex((event) => event.id === afterEventId);
    return cursor < 0 ? [] : events.slice(cursor + 1);
  }

  subscribe(listener: WebProductEventListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  get size(): number { return this.listeners.size; }
}
