import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { withDurableFileStateLock } from "../file-state-lock.js";

export type CalendarMapping = {
  externalKey: string;
  projectId: string;
  calendarId: string;
  eventId: string;
  source: "issue" | "milestone" | "discord";
  repository?: string;
  number?: number;
};

export function calendarExternalKey(projectId: string, repository: string, source: string, number: number): string {
  return `${projectId}:${repository.toLowerCase()}:${source}:${number}`;
}

export class CalendarStateStore {
  constructor(private readonly file = resolve(process.cwd(), "data", "calendar-state.json")) {}

  async withMappingLock<T>(externalKey: string, task: () => Promise<T>): Promise<T> {
    const digest = createHash("sha256").update(externalKey).digest("hex");
    return withDurableFileStateLock(`${this.file}.mapping-${digest}`, task, { waitForMs: 60_000, pollIntervalMs: 25 });
  }

  private async read(): Promise<CalendarMapping[]> {
    try {
      return JSON.parse(await readFile(this.file, "utf8")) as CalendarMapping[];
    } catch {
      return [];
    }
  }

  private async write(items: CalendarMapping[]): Promise<void> {
    await mkdir(dirname(this.file), { recursive: true });
    const temp = `${this.file}.tmp`;
    await writeFile(temp, JSON.stringify(items, null, 2), "utf8");
    await rename(temp, this.file);
  }

  async find(externalKey: string): Promise<CalendarMapping | null> {
    return withDurableFileStateLock(this.file, async () => (await this.read()).find((item) => item.externalKey === externalKey) ?? null, { waitForMs: 2_000 });
  }

  async upsert(mapping: CalendarMapping): Promise<void> {
    await withDurableFileStateLock(this.file, async () => {
      const items = await this.read();
      const index = items.findIndex((item) => item.externalKey === mapping.externalKey);
      if (index >= 0) items[index] = mapping;
      else items.push(mapping);
      await this.write(items);
    }, { waitForMs: 2_000 });
  }

  async removeProject(projectId: string): Promise<number> {
    return withDurableFileStateLock(this.file, async () => {
      const items = await this.read();
      const next = items.filter((item) => item.projectId !== projectId);
      const removed = items.length - next.length;
      if (removed > 0) await this.write(next);
      return removed;
    }, { waitForMs: 2_000 });
  }

  async removeEvent(projectId: string, calendarId: string, eventId: string): Promise<number> {
    return withDurableFileStateLock(this.file, async () => {
      const items = await this.read();
      const next = items.filter((item) =>
        item.projectId !== projectId
        || item.calendarId !== calendarId
        || item.eventId !== eventId,
      );
      const removed = items.length - next.length;
      if (removed > 0) await this.write(next);
      return removed;
    }, { waitForMs: 2_000 });
  }

  async remove(externalKey: string): Promise<boolean> {
    return withDurableFileStateLock(this.file, async () => {
      const items = await this.read();
      const next = items.filter((item) => item.externalKey !== externalKey);
      if (next.length === items.length) return false;
      await this.write(next);
      return true;
    }, { waitForMs: 2_000 });
  }
}

const defaultCalendarStateStore = new CalendarStateStore();

export function clearCalendarProjectState(projectId: string): Promise<number> {
  return defaultCalendarStateStore.removeProject(projectId);
}
