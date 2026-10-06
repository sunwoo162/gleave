import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { ChannelType, Client, Guild, TextChannel } from "discord.js";
import { withDurableFileStateLock } from "./file-state-lock.js";
import { findProject, listProjects, withProjectDeleteLock, type StoredProject } from "./projects.js";
import { seoulDateKey } from "./voice-time.js";

const DATA_FILE = resolve(process.cwd(), "data", "daily-scrum.json");
const DAY_MS = 86_400_000;
const SEOUL_OFFSET_HOURS = 9;
const REMINDER_HOUR = 8;

export const DAILY_SCRUM_CHANNEL_NAME = "🗓・데일리스크럼";

export type DailyScrumRecord = {
  guildId: string;
  projectId: string;
  userId: string;
  date: string;
  todo: string;
  did: string;
  channelId: string;
  messageId: string;
  updatedAt: string;
};

type DailyScrumData = {
  records: DailyScrumRecord[];
  reminderDates: Record<string, string>;
};

function emptyData(): DailyScrumData {
  return { records: [], reminderDates: {} };
}

export class DailyScrumStore {
  constructor(private readonly file = DATA_FILE) {}

  async withReminderDeliveryLock<T>(
    projectId: string,
    date: string,
    task: () => Promise<T>,
  ): Promise<T> {
    const digest = createHash("sha256")
      .update(`${projectId}:${date}:daily-scrum-reminder`)
      .digest("hex");
    return withDurableFileStateLock(
      `${this.file}.reminder.${digest}`,
      task,
      { waitForMs: 2_000 },
    );
  }

  private async readData(): Promise<DailyScrumData> {
    try {
      const parsed = JSON.parse(await readFile(this.file, "utf8")) as Partial<DailyScrumData>;
      return {
        records: parsed.records ?? [],
        reminderDates: parsed.reminderDates ?? {},
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return emptyData();
      throw error;
    }
  }

  private async writeData(data: DailyScrumData): Promise<void> {
    await mkdir(dirname(this.file), { recursive: true });
    await writeFile(this.file, JSON.stringify(data, null, 2), "utf8");
  }

  private updateData<T>(updater: (data: DailyScrumData) => T | Promise<T>): Promise<T> {
    return withDurableFileStateLock(this.file, async () => {
      const data = await this.readData();
      const result = await updater(data);
      await this.writeData(data);
      return result;
    }, { waitForMs: 2_000 });
  }

  async getRecord(projectId: string, userId: string, date: string): Promise<DailyScrumRecord | null> {
    return withDurableFileStateLock(this.file, async () => {
      const data = await this.readData();
      return data.records.find((record) =>
        record.projectId === projectId
        && record.userId === userId
        && record.date === date,
      ) ?? null;
    }, { waitForMs: 2_000 });
  }

  saveRecord(record: DailyScrumRecord): Promise<void> {
    return this.updateData((data) => {
      const index = data.records.findIndex((item) =>
        item.projectId === record.projectId
        && item.userId === record.userId
        && item.date === record.date,
      );

      if (index >= 0) data.records[index] = record;
      else data.records.push(record);
    });
  }

  clearProject(projectId: string): Promise<number> {
    return this.updateData((data) => {
      const before = data.records.length;
      data.records = data.records.filter((record) => record.projectId !== projectId);
      delete data.reminderDates[projectId];
      return before - data.records.length;
    });
  }

  async isReminderSent(projectId: string, date: string): Promise<boolean> {
    return withDurableFileStateLock(this.file, async () => {
      const data = await this.readData();
      return data.reminderDates[projectId] === date;
    }, { waitForMs: 2_000 });
  }

  markReminderSent(projectId: string, date: string): Promise<void> {
    return this.updateData((data) => {
      data.reminderDates[projectId] = date;
    });
  }
}

const defaultDailyScrumStore = new DailyScrumStore();

export function previousSeoulDateKey(date = new Date()): string {
  return seoulDateKey(new Date(date.getTime() - DAY_MS));
}

export function getDailyScrumRecord(
  projectId: string,
  userId: string,
  date: string,
): Promise<DailyScrumRecord | null> {
  return defaultDailyScrumStore.getRecord(projectId, userId, date);
}

export function saveDailyScrumRecord(record: DailyScrumRecord): Promise<void> {
  return defaultDailyScrumStore.saveRecord(record);
}

export function clearDailyScrumProject(projectId: string): Promise<number> {
  return defaultDailyScrumStore.clearProject(projectId);
}

export async function findDailyScrumChannel(
  guild: Guild,
  project: StoredProject,
): Promise<TextChannel | null> {
  const channels = await guild.channels.fetch();
  const channel = channels.find((item) =>
    item?.type === ChannelType.GuildText
    && item.parentId === project.categoryId
    && item.name === DAILY_SCRUM_CHANNEL_NAME,
  );
  return channel instanceof TextChannel ? channel : null;
}

type DailyScrumReminderDependencies = {
  store?: DailyScrumStore;
  listProjects?: () => Promise<StoredProject[]>;
  findProject?: (projectId: string) => Promise<StoredProject | null>;
  findChannel?: (guild: Guild, project: StoredProject) => Promise<TextChannel | null>;
};

export async function sendDailyScrumReminders(
  client: Client,
  now = new Date(),
  dependencies: DailyScrumReminderDependencies = {},
): Promise<void> {
  const date = seoulDateKey(now);
  const store = dependencies.store ?? defaultDailyScrumStore;
  const projects = await (dependencies.listProjects ?? listProjects)();

  for (const project of projects) {
    try {
      await store.withReminderDeliveryLock(project.id, date, async () => {
        if (await store.isReminderSent(project.id, date)) return;

        await withProjectDeleteLock(project.guildId, project.id, async () => {
          const current = await (dependencies.findProject ?? findProject)(project.id);
          if (!current) return;

          const guild = client.guilds.cache.get(current.guildId)
            ?? await client.guilds.fetch(current.guildId).catch(() => null);
          if (!guild) return;

          const channel = await (dependencies.findChannel ?? findDailyScrumChannel)(guild, current);
          if (!channel) return;

          await channel.send({
            content:
              "@everyone\n" +
              "🌅 **데일리 스크럼 작성 시간입니다.**\n" +
              "오늘 할 일은 `/scrum write todo:...`로 작성해주세요.\n" +
              "여러 할 일은 쉼표(`,`)로 구분하면 번호 목록으로 표시됩니다.\n" +
              "`did`는 선택값이며, 입력할 때 전날 TODO 목록에서 선택할 수 있습니다.",
            allowedMentions: { parse: ["everyone"] },
          });
          await store.markReminderSent(current.id, date);
        });
      });
    } catch (error) {
      console.error(`데일리 스크럼 알림 전송 실패 (${project.name})`, error);
    }
  }
}

function millisecondsUntilNextSeoulEight(now = new Date()): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const year = Number(values.year);
  const month = Number(values.month);
  const day = Number(values.day);

  let target = Date.UTC(
    year,
    month - 1,
    day,
    REMINDER_HOUR - SEOUL_OFFSET_HOURS,
    0,
    0,
    0,
  );

  if (target <= now.getTime()) target += DAY_MS;
  return Math.max(1_000, target - now.getTime());
}

export function startDailyScrumReminderScheduler(client: Client): void {
  const scheduleNext = () => {
    const delay = millisecondsUntilNextSeoulEight();
    setTimeout(async () => {
      try {
        await sendDailyScrumReminders(client);
      } finally {
        scheduleNext();
      }
    }, delay);
  };

  scheduleNext();
  console.log("데일리 스크럼 알림 예약: 매일 08:00 (Asia/Seoul)");
}
