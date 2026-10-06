import { createHash, randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import type { ContestAttachment, ContestSource } from "./contests.js";
import { withDurableFileStateLock } from "./file-state-lock.js";

export type ContestVote = {
  id: string;
  guildId: string;
  channelId: string;
  messageId: string;
  deadlineReminderMessageId?: string;
  title: string;
  url: string;
  sources?: ContestSource[];
  field?: string;
  target?: string;
  host?: string;
  sponsor?: string;
  period?: string;
  initialDeadlineDays?: number;
  deadlineDate?: string;
  deadlineLastRenderedDate?: string;
  totalPrize?: string;
  firstPrize?: string;
  homepage?: string;
  attachments?: ContestAttachment[];
  status?: string;
  eligibleVoterIds?: string[];
  majority?: number;
  voterIds: string[];
  finalized: boolean;
  prepCategoryId?: string;
  createdAt: string;
};

const DATA_FILE = resolve(process.cwd(), "data", "contest-votes.json");

function normalizeTitle(value: string): string {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/제\s*\d+\s*회/g, "")
    .replace(/[\[\](){}<>「」『』【】'"“”‘’·•,:.!?~_\-–—/\\|]/g, "")
    .replace(/\s+/g, "")
    .trim();
}

export function createContestVoteId(): string {
  return randomBytes(6).toString("hex");
}

export class ContestVoteStore {
  constructor(private readonly file = DATA_FILE) {}

  async withVoteLock<T>(voteId: string, task: () => Promise<T>): Promise<T> {
    const digest = createHash("sha256").update(voteId).digest("hex");
    return withDurableFileStateLock(`${this.file}.finalize-${digest}`, task, { waitForMs: 60_000, pollIntervalMs: 25 });
  }

  private async readVotes(): Promise<ContestVote[]> {
    try {
      const content = await readFile(this.file, "utf8");
      return JSON.parse(content) as ContestVote[];
    } catch {
      return [];
    }
  }

  private async writeVotes(votes: ContestVote[]): Promise<void> {
    await mkdir(dirname(this.file), { recursive: true });
    await writeFile(this.file, JSON.stringify(votes, null, 2), "utf8");
  }

  async save(vote: Omit<ContestVote, "createdAt">): Promise<ContestVote> {
    return withDurableFileStateLock(this.file, async () => {
      const votes = await this.readVotes();
      const stored: ContestVote = {
        ...vote,
        createdAt: new Date().toISOString(),
      };
      votes.push(stored);
      await this.writeVotes(votes);
      return stored;
    }, { waitForMs: 2_000 });
  }

  async list(): Promise<ContestVote[]> {
    return withDurableFileStateLock(this.file, () => this.readVotes(), { waitForMs: 2_000 });
  }

  async find(id: string): Promise<ContestVote | null> {
    return withDurableFileStateLock(this.file, async () => {
      const votes = await this.readVotes();
      return votes.find((vote) => vote.id === id) ?? null;
    }, { waitForMs: 2_000 });
  }

  async findLatest(
    guildId: string,
    channelId: string,
    title: string,
    url: string,
  ): Promise<ContestVote | null> {
    return withDurableFileStateLock(this.file, async () => {
      const normalizedTitle = normalizeTitle(title);
      const votes = await this.readVotes();

      return votes
        .filter((vote) =>
          vote.guildId === guildId
          && vote.channelId === channelId
          && (vote.url === url || normalizeTitle(vote.title) === normalizedTitle),
        )
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] ?? null;
    }, { waitForMs: 2_000 });
  }

  async listForChannel(guildId: string, channelId: string): Promise<ContestVote[]> {
    return withDurableFileStateLock(this.file, async () => {
      const votes = await this.readVotes();
      return votes.filter((vote) => vote.guildId === guildId && vote.channelId === channelId);
    }, { waitForMs: 2_000 });
  }

  async listByUser(guildId: string, userId: string): Promise<ContestVote[]> {
    return withDurableFileStateLock(this.file, async () => {
      const votes = await this.readVotes();
      return votes
        .filter((vote) => vote.guildId === guildId && vote.voterIds.includes(userId))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .map((vote) => {
          const homepage = vote.homepage || vote.url;
          const messageUrl = `https://discord.com/channels/${vote.guildId}/${vote.channelId}/${vote.messageId}`;
          const periodParts = [vote.period, homepage ? `[🌐 홈페이지](${homepage})` : undefined]
            .filter((value): value is string => Boolean(value));

          return {
            ...vote,
            homepage: messageUrl,
            period: periodParts.length > 0 ? periodParts.join(" · ") : undefined,
          };
        });
    }, { waitForMs: 2_000 });
  }

  async update(
    id: string,
    updates: Partial<Omit<ContestVote, "id" | "createdAt">>,
  ): Promise<ContestVote | null> {
    return withDurableFileStateLock(this.file, async () => {
      const votes = await this.readVotes();
      const index = votes.findIndex((vote) => vote.id === id);
      if (index < 0) return null;

      const current = votes[index];
      if (!current) return null;

      const updated: ContestVote = { ...current, ...updates, id: current.id, createdAt: current.createdAt };
      votes[index] = updated;
      await this.writeVotes(votes);
      return updated;
    }, { waitForMs: 2_000 });
  }
}

const defaultContestVoteStore = new ContestVoteStore();

export function withContestVoteLock<T>(voteId: string, task: () => Promise<T>): Promise<T> {
  return defaultContestVoteStore.withVoteLock(voteId, task);
}

export function saveContestVote(vote: Omit<ContestVote, "createdAt">): Promise<ContestVote> {
  return defaultContestVoteStore.save(vote);
}

export function listContestVotes(): Promise<ContestVote[]> {
  return defaultContestVoteStore.list();
}

export function findContestVote(id: string): Promise<ContestVote | null> {
  return defaultContestVoteStore.find(id);
}

export function findLatestContestVote(
  guildId: string,
  channelId: string,
  title: string,
  url: string,
): Promise<ContestVote | null> {
  return defaultContestVoteStore.findLatest(guildId, channelId, title, url);
}

export function listContestVotesForChannel(guildId: string, channelId: string): Promise<ContestVote[]> {
  return defaultContestVoteStore.listForChannel(guildId, channelId);
}

export function listContestVotesByUser(guildId: string, userId: string): Promise<ContestVote[]> {
  return defaultContestVoteStore.listByUser(guildId, userId);
}

export function updateContestVote(
  id: string,
  updates: Partial<Omit<ContestVote, "id" | "createdAt">>,
): Promise<ContestVote | null> {
  return defaultContestVoteStore.update(id, updates);
}
