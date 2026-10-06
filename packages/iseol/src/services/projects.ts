import { createHash, randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { withDurableFileStateLock } from "./file-state-lock.js";
import type { RepositoryRef } from "./github.js";

export type StoredProject = {
  id: string;
  name: string;
  guildId: string;
  categoryId: string;
  organization: string;
  frontend: RepositoryRef;
  backend: RepositoryRef;
  frontendHookId?: number;
  backendHookId?: number;
  frontendAutomationHookId?: number;
  backendAutomationHookId?: number;
  frontendLogChannelId?: string;
  backendLogChannelId?: string;
  calendarId?: string;
  calendarUrl?: string;
  calendarChannelId?: string;
  calendarPanelMessageId?: string;
  figmaUrl?: string;
  figmaFileKey?: string;
  figmaChannelId?: string;
  figmaWebhookId?: string;
  figmaLastVersionId?: string;
  figmaKnownCommentIds?: string[];
  notionUrl?: string;
  notionPageId?: string;
  notionChannelId?: string;
  notionLastEditedTime?: string;
};

const DATA_FILE = resolve(process.cwd(), "data", "projects.json");

export class ProjectStore {
  constructor(private readonly file = DATA_FILE) {}

  async withPollingLock<T>(task: () => Promise<T>): Promise<T> {
    const digest = createHash("sha256")
      .update(`${this.file}:integration-polling`)
      .digest("hex");
    return withDurableFileStateLock(
      `${this.file}.polling.${digest}`,
      task,
      { waitForMs: 5 * 60 * 1_000 },
    );
  }

  async withCreateLock<T>(guildId: string, name: string, task: () => Promise<T>): Promise<T> {
    const normalizedName = name.trim().normalize("NFKC").toLowerCase();
    const digest = createHash("sha256")
      .update(`${this.file}:project-create:${guildId}:${normalizedName}`)
      .digest("hex");
    return this.withGuildProjectLifecycleLock(guildId, () => withDurableFileStateLock(
      `${this.file}.create.${digest}`,
      task,
      { waitForMs: 5 * 60 * 1_000 },
    ));
  }

  async withDeleteLock<T>(guildId: string, projectId: string, task: () => Promise<T>): Promise<T> {
    const digest = createHash("sha256")
      .update(`${this.file}:project-delete:${guildId}:${projectId}`)
      .digest("hex");
    return this.withGuildProjectLifecycleLock(guildId, () => withDurableFileStateLock(
      `${this.file}.delete.${digest}`,
      task,
      { waitForMs: 5 * 60 * 1_000 },
    ));
  }

  async withGuildProjectLifecycleLock<T>(guildId: string, task: () => Promise<T>): Promise<T> {
    const digest = createHash("sha256")
      .update(`${this.file}:guild-project-lifecycle:${guildId}`)
      .digest("hex");
    return withDurableFileStateLock(
      `${this.file}.guild.${digest}`,
      task,
      { waitForMs: 5 * 60 * 1_000 },
    );
  }

  private async readProjects(): Promise<StoredProject[]> {
    try {
      const content = await readFile(this.file, "utf8");
      return JSON.parse(content) as StoredProject[];
    } catch {
      return [];
    }
  }

  private async writeProjects(projects: StoredProject[]): Promise<void> {
    await mkdir(dirname(this.file), { recursive: true });
    await writeFile(this.file, JSON.stringify(projects, null, 2), "utf8");
  }

  async list(): Promise<StoredProject[]> {
    return withDurableFileStateLock(this.file, () => this.readProjects(), { waitForMs: 2_000 });
  }

  async save(project: Omit<StoredProject, "id">): Promise<StoredProject> {
    return withDurableFileStateLock(this.file, async () => {
      const projects = await this.readProjects();
      const normalizedName = project.name.trim().normalize("NFKC").toLowerCase();
      const duplicate = projects.some((current) =>
        current.guildId === project.guildId
        && current.name.trim().normalize("NFKC").toLowerCase() === normalizedName,
      );
      if (duplicate) throw new Error("A project with this name already exists in this guild");

      const stored: StoredProject = { ...project, id: randomBytes(6).toString("hex") };
      projects.push(stored);
      await this.writeProjects(projects);
      return stored;
    }, { waitForMs: 2_000 });
  }

  async update(id: string, updates: Partial<Omit<StoredProject, "id">>): Promise<StoredProject | null> {
    return withDurableFileStateLock(this.file, async () => {
      const projects = await this.readProjects();
      const index = projects.findIndex((project) => project.id === id);
      if (index < 0) return null;

      const current = projects[index];
      if (!current) return null;

      const updated: StoredProject = { ...current, ...updates, id };
      projects[index] = updated;
      await this.writeProjects(projects);
      return updated;
    }, { waitForMs: 2_000 });
  }

  async find(id: string): Promise<StoredProject | null> {
    return withDurableFileStateLock(this.file, async () => {
      const projects = await this.readProjects();
      return projects.find((project) => project.id === id) ?? null;
    }, { waitForMs: 2_000 });
  }

  async findByName(guildId: string, name: string): Promise<StoredProject | null> {
    return withDurableFileStateLock(this.file, async () => {
      const normalized = name.trim().toLowerCase();
      const projects = await this.readProjects();
      return projects.find((project) => project.guildId === guildId && project.name.trim().toLowerCase() === normalized) ?? null;
    }, { waitForMs: 2_000 });
  }

  async findByFigmaWebhook(webhookId: string, fileKey: string): Promise<StoredProject | null> {
    return withDurableFileStateLock(this.file, async () => {
      const projects = await this.readProjects();
      const exact = projects.find((project) => project.figmaWebhookId === webhookId);
      if (exact) return exact;

      return projects.find((project) => project.figmaFileKey === fileKey && !!project.figmaChannelId) ?? null;
    }, { waitForMs: 2_000 });
  }

  async delete(id: string): Promise<boolean> {
    return withDurableFileStateLock(this.file, async () => {
      const projects = await this.readProjects();
      const next = projects.filter((project) => project.id !== id);
      if (next.length === projects.length) return false;

      await this.writeProjects(next);
      return true;
    }, { waitForMs: 2_000 });
  }
}

const defaultProjectStore = new ProjectStore();

export function listProjects(): Promise<StoredProject[]> {
  return defaultProjectStore.list();
}

export function saveProject(project: Omit<StoredProject, "id">): Promise<StoredProject> {
  return defaultProjectStore.save(project);
}

export function updateProject(id: string, updates: Partial<Omit<StoredProject, "id">>): Promise<StoredProject | null> {
  return defaultProjectStore.update(id, updates);
}

export function findProject(id: string): Promise<StoredProject | null> {
  return defaultProjectStore.find(id);
}

export function findProjectByName(guildId: string, name: string): Promise<StoredProject | null> {
  return defaultProjectStore.findByName(guildId, name);
}

export function findProjectByFigmaWebhook(webhookId: string, fileKey: string): Promise<StoredProject | null> {
  return defaultProjectStore.findByFigmaWebhook(webhookId, fileKey);
}

export function deleteProject(id: string): Promise<boolean> {
  return defaultProjectStore.delete(id);
}

export function withProjectPollingLock<T>(task: () => Promise<T>): Promise<T> {
  return defaultProjectStore.withPollingLock(task);
}

export function withProjectCreateLock<T>(guildId: string, name: string, task: () => Promise<T>): Promise<T> {
  return defaultProjectStore.withCreateLock(guildId, name, task);
}

export function withProjectDeleteLock<T>(guildId: string, projectId: string, task: () => Promise<T>): Promise<T> {
  return defaultProjectStore.withDeleteLock(guildId, projectId, task);
}

export function withProjectGuildLifecycleLock<T>(guildId: string, task: () => Promise<T>): Promise<T> {
  return defaultProjectStore.withGuildProjectLifecycleLock(guildId, task);
}
