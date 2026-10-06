import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { withDurableFileStateLock } from "./file-state-lock.js";

const DATA_FILE = resolve(process.cwd(), "data", "voice-study-time.json");
const HEARTBEAT_MS = 60_000;
const DAY_CHUNK_MS = 60_000;

type ActiveStudySession = {
  guildId: string;
  userId: string;
  channelId: string;
  startedAt: string;
  lastAccountedAt: string;
};

type VoiceStudyData = {
  dailySeconds: Record<string, Record<string, number>>;
  activeSessions: ActiveStudySession[];
};

export type StoppedStudySession = {
  userId: string;
  seconds: number;
};

let heartbeatStarted = false;

function emptyData(): VoiceStudyData {
  return { dailySeconds: {}, activeSessions: [] };
}

function userKey(guildId: string, userId: string): string {
  return `${guildId}:${userId}`;
}

export function seoulDateKey(date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function addSeconds(data: VoiceStudyData, guildId: string, userId: string, dateKey: string, seconds: number): void {
  if (seconds <= 0) return;
  const key = userKey(guildId, userId);
  const days = data.dailySeconds[key] ?? {};
  days[dateKey] = (days[dateKey] ?? 0) + seconds;
  data.dailySeconds[key] = days;
}

function accountRange(
  data: VoiceStudyData,
  session: ActiveStudySession,
  from: Date,
  to: Date,
): number {
  let cursor = from.getTime();
  const end = to.getTime();
  let totalSeconds = 0;

  while (cursor < end) {
    const next = Math.min(cursor + DAY_CHUNK_MS, end);
    const seconds = Math.max(0, (next - cursor) / 1000);
    addSeconds(data, session.guildId, session.userId, seoulDateKey(new Date(cursor)), seconds);
    totalSeconds += seconds;
    cursor = next;
  }

  return totalSeconds;
}

function appendStudySession(data: VoiceStudyData, guildId: string, userId: string, channelId: string): void {
  const now = new Date().toISOString();
  data.activeSessions.push({
    guildId,
    userId,
    channelId,
    startedAt: now,
    lastAccountedAt: now,
  });
}

export class VoiceStudyStore {
  constructor(private readonly file = DATA_FILE) {}

  private async readData(): Promise<VoiceStudyData> {
    try {
      const parsed = JSON.parse(await readFile(this.file, "utf8")) as Partial<VoiceStudyData>;
      return {
        dailySeconds: parsed.dailySeconds ?? {},
        activeSessions: parsed.activeSessions ?? [],
      };
    } catch {
      return emptyData();
    }
  }

  private async writeData(data: VoiceStudyData): Promise<void> {
    await mkdir(dirname(this.file), { recursive: true });
    await writeFile(this.file, JSON.stringify(data, null, 2), "utf8");
  }

  private updateData<T>(updater: (data: VoiceStudyData) => T | Promise<T>): Promise<T> {
    return withDurableFileStateLock(this.file, async () => {
      const data = await this.readData();
      const result = await updater(data);
      await this.writeData(data);
      return result;
    }, { waitForMs: 2_000 });
  }

  startSession(guildId: string, userId: string, channelId: string): Promise<void> {
    return this.updateData((data) => {
      const existing = data.activeSessions.find((session) => session.guildId === guildId && session.userId === userId);
      if (existing) throw new Error("이미 음성 공부 시간이 측정 중입니다.");
      appendStudySession(data, guildId, userId, channelId);
    });
  }

  ensureSession(guildId: string, userId: string, channelId: string): Promise<boolean> {
    return this.updateData((data) => {
      const existing = data.activeSessions.find((session) => session.guildId === guildId && session.userId === userId);
      if (existing) return false;
      appendStudySession(data, guildId, userId, channelId);
      return true;
    });
  }

  stopSessionsForGuild(guildId: string): Promise<StoppedStudySession[]> {
    return this.updateData((data) => {
      const now = new Date();
      const stopped: StoppedStudySession[] = [];
      const remaining: ActiveStudySession[] = [];

      for (const session of data.activeSessions) {
        if (session.guildId !== guildId) {
          remaining.push(session);
          continue;
        }

        const seconds = accountRange(data, session, new Date(session.lastAccountedAt), now);
        stopped.push({ userId: session.userId, seconds });
      }

      data.activeSessions = remaining;
      return stopped;
    });
  }

  stopSession(guildId: string, userId: string): Promise<StoppedStudySession | null> {
    return this.updateData((data) => {
      const index = data.activeSessions.findIndex((session) => session.guildId === guildId && session.userId === userId);
      if (index < 0) return null;

      const session = data.activeSessions[index];
      if (!session) return null;
      const seconds = accountRange(data, session, new Date(session.lastAccountedAt), new Date());
      data.activeSessions.splice(index, 1);
      return { userId, seconds };
    });
  }

  async getDailyStudySeconds(guildId: string, userId: string): Promise<Record<string, number>> {
    return withDurableFileStateLock(this.file, async () => {
      const data = await this.readData();
      return { ...(data.dailySeconds[userKey(guildId, userId)] ?? {}) };
    }, { waitForMs: 2_000 });
  }

  async getTotalStudySeconds(guildId: string, userId: string): Promise<number> {
    return withDurableFileStateLock(this.file, async () => {
      const data = await this.readData();
      const savedSeconds = Object.values(data.dailySeconds[userKey(guildId, userId)] ?? {})
        .reduce((total, seconds) => total + seconds, 0);
      const active = data.activeSessions.find((session) => session.guildId === guildId && session.userId === userId);
      if (!active) return savedSeconds;

      const lastAccountedAt = new Date(active.lastAccountedAt).getTime();
      const pendingSeconds = Number.isFinite(lastAccountedAt)
        ? Math.max(0, (Date.now() - lastAccountedAt) / 1000)
        : 0;
      return savedSeconds + pendingSeconds;
    }, { waitForMs: 2_000 });
  }

  async getActiveStudySession(guildId: string, userId: string): Promise<ActiveStudySession | null> {
    return withDurableFileStateLock(this.file, async () => {
      const data = await this.readData();
      return data.activeSessions.find((session) => session.guildId === guildId && session.userId === userId) ?? null;
    }, { waitForMs: 2_000 });
  }

  heartbeat(): Promise<void> {
    return this.updateData((data) => {
      const now = new Date();
      for (const session of data.activeSessions) {
        accountRange(data, session, new Date(session.lastAccountedAt), now);
        session.lastAccountedAt = now.toISOString();
      }
    });
  }

  recoverInterruptedStudySessions(): Promise<number> {
    return this.updateData((data) => {
      const count = data.activeSessions.length;
      data.activeSessions = [];
      return count;
    });
  }
}

const defaultVoiceStudyStore = new VoiceStudyStore();

export function startStudySession(guildId: string, userId: string, channelId: string): Promise<void> {
  return defaultVoiceStudyStore.startSession(guildId, userId, channelId);
}

export function ensureStudySession(guildId: string, userId: string, channelId: string): Promise<boolean> {
  return defaultVoiceStudyStore.ensureSession(guildId, userId, channelId);
}

export function stopStudySessionsForGuild(guildId: string): Promise<StoppedStudySession[]> {
  return defaultVoiceStudyStore.stopSessionsForGuild(guildId);
}

export function stopStudySession(guildId: string, userId: string): Promise<StoppedStudySession | null> {
  return defaultVoiceStudyStore.stopSession(guildId, userId);
}

export function getDailyStudySeconds(guildId: string, userId: string): Promise<Record<string, number>> {
  return defaultVoiceStudyStore.getDailyStudySeconds(guildId, userId);
}

export function getTotalStudySeconds(guildId: string, userId: string): Promise<number> {
  return defaultVoiceStudyStore.getTotalStudySeconds(guildId, userId);
}

export function getActiveStudySession(guildId: string, userId: string): Promise<ActiveStudySession | null> {
  return defaultVoiceStudyStore.getActiveStudySession(guildId, userId);
}

async function heartbeat(): Promise<void> {
  await defaultVoiceStudyStore.heartbeat();
}

export function recoverInterruptedStudySessions(): Promise<number> {
  return defaultVoiceStudyStore.recoverInterruptedStudySessions();
}

export function startVoiceStudyHeartbeat(): void {
  if (heartbeatStarted) return;
  heartbeatStarted = true;
  setInterval(() => void heartbeat().catch((error) => console.error("음성 공부 시간 저장 실패", error)), HEARTBEAT_MS);
}
