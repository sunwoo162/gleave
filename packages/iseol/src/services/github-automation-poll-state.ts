import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { withDurableFileStateLock } from "./file-state-lock.js";

export type GitHubAutomationPollState = {
  repositories: Record<string, { milestones: Record<string, string> }>;
};

function repositoryStateKey(projectId: string, repository: string): string {
  return `${projectId}:${repository.toLowerCase()}`;
}

export class GitHubAutomationPollStateStore {
  constructor(private readonly file = resolve(process.cwd(), "data", "github-automation-polling.json")) {}

  async withSyncLock<T>(task: () => Promise<T>): Promise<T> {
    const digest = createHash("sha256")
      .update(`${this.file}:github-automation-sync`)
      .digest("hex");
    return withDurableFileStateLock(
      `${this.file}.sync.${digest}`,
      task,
      { waitForMs: 60_000 },
    );
  }

  private async read(): Promise<GitHubAutomationPollState> {
    try {
      const parsed = JSON.parse(await readFile(this.file, "utf8")) as GitHubAutomationPollState;
      return parsed?.repositories ? parsed : { repositories: {} };
    } catch {
      return { repositories: {} };
    }
  }

  private async write(state: GitHubAutomationPollState): Promise<void> {
    await mkdir(dirname(this.file), { recursive: true });
    const temp = `${this.file}.tmp`;
    await writeFile(temp, JSON.stringify(state, null, 2), "utf8");
    await rename(temp, this.file);
  }

  async getMilestones(projectId: string, repository: string): Promise<Record<string, string>> {
    return withDurableFileStateLock(this.file, async () => {
      const state = await this.read();
      return { ...(state.repositories[repositoryStateKey(projectId, repository)]?.milestones ?? {}) };
    }, { waitForMs: 2_000 });
  }

  async setMilestones(projectId: string, repository: string, milestones: Record<string, string>): Promise<void> {
    await withDurableFileStateLock(this.file, async () => {
      const state = await this.read();
      state.repositories[repositoryStateKey(projectId, repository)] = { milestones };
      await this.write(state);
    }, { waitForMs: 2_000 });
  }

  async retainRepositories(activeKeys: Set<string>): Promise<void> {
    await withDurableFileStateLock(this.file, async () => {
      const state = await this.read();
      let changed = false;
      for (const key of Object.keys(state.repositories)) {
        if (activeKeys.has(key)) continue;
        delete state.repositories[key];
        changed = true;
      }
      if (changed) await this.write(state);
    }, { waitForMs: 2_000 });
  }

  async removeProject(projectId: string): Promise<number> {
    const prefix = `${projectId}:`;
    return withDurableFileStateLock(this.file, async () => {
      const state = await this.read();
      const nextRepositories = Object.fromEntries(
        Object.entries(state.repositories).filter(([key]) => !key.startsWith(prefix)),
      );
      const removed = Object.keys(state.repositories).length - Object.keys(nextRepositories).length;
      if (removed > 0) await this.write({ repositories: nextRepositories });
      return removed;
    }, { waitForMs: 2_000 });
  }

  static key(projectId: string, repository: string): string {
    return repositoryStateKey(projectId, repository);
  }
}

export function clearGitHubAutomationPollingProject(projectId: string): Promise<number> {
  const store = new GitHubAutomationPollStateStore();
  return store.withSyncLock(() => store.removeProject(projectId));
}
