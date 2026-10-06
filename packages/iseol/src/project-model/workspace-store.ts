import { randomBytes } from "node:crypto";
import type { Dirent } from "node:fs";
import { mkdir, readFile, readdir, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import type { ProjectWorkspace } from "./contracts.js";
import { assertProjectModelId } from "./contracts.js";
import type { ExecutionProfile } from "./execution-profile.js";
import { appendProjectHistoryEventOnce } from "./history-store.js";
import { withDurableProjectWorkspaceLock } from "./workspace-lock.js";

function workspaceFile(root: string, id: string): string {
  assertProjectModelId(id);
  return resolve(root, "projects", id, "project.json");
}

export async function saveProjectWorkspaceUnlocked(
  root: string,
  workspace: ProjectWorkspace,
): Promise<void> {
  assertProjectModelId(workspace.id);
  const path = workspaceFile(root, workspace.id);
  await mkdir(dirname(path), { recursive: true });
  const temp = `${path}.${process.pid}.${randomBytes(4).toString("hex")}.tmp`;
  await writeFile(temp, JSON.stringify(workspace, null, 2), "utf8");
  await rename(temp, path);
}

export async function saveProjectWorkspace(
  root: string,
  workspace: ProjectWorkspace,
): Promise<void> {
  return withDurableProjectWorkspaceLock(
    root,
    workspace.id,
    () => saveProjectWorkspaceUnlocked(root, workspace),
    { waitForMs: 2_000 },
  );
}

export async function loadProjectWorkspaceUnlocked(
  root: string,
  id: string,
): Promise<ProjectWorkspace | null> {
  const path = workspaceFile(root, id);
  try {
    return JSON.parse(await readFile(path, "utf8")) as ProjectWorkspace;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

export async function loadProjectWorkspace(
  root: string,
  id: string,
): Promise<ProjectWorkspace | null> {
  return withDurableProjectWorkspaceLock(
    root,
    id,
    () => loadProjectWorkspaceUnlocked(root, id),
    { waitForMs: 2_000 },
  );
}

export async function listProjectWorkspaces(
  root: string,
): Promise<ProjectWorkspace[]> {
  const directory = resolve(root, "projects");
  let entries: Dirent<string>[];
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }

  const workspaces: ProjectWorkspace[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const id = entry.name;
    try { assertProjectModelId(id); } catch { continue; }
    const workspace = await withDurableProjectWorkspaceLock(
      root,
      id,
      () => loadProjectWorkspaceUnlocked(root, id),
      { waitForMs: 2_000 },
    );
    if (workspace) workspaces.push(workspace);
  }
  return workspaces.sort((a, b) =>
    a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id),
  );
}

export async function setProjectPurpose(
  root: string,
  projectId: string,
  profile: ExecutionProfile,
  selectedAt: string,
  source: "user" | "default" = "user",
): Promise<ProjectWorkspace> {
  return withDurableProjectWorkspaceLock(root, projectId, async () => {
    const workspace = await loadProjectWorkspaceUnlocked(root, projectId);
    if (!workspace) throw new Error(`Project workspace not found: ${projectId}`);
    const next: ProjectWorkspace = {
      ...workspace,
      purposeSelection: { version: 1, purpose: profile.purpose, selectedAt, source, profile },
      updatedAt: selectedAt,
    };
    await saveProjectWorkspaceUnlocked(root, next);
    await appendProjectHistoryEventOnce(root, {
      version: 1,
      id: `purpose-${projectId}-${profile.purpose}-${selectedAt}`,
      projectId,
      type: "purpose-selected",
      at: selectedAt,
      summary: `Project purpose selected: ${profile.purpose}`,
      action: "purpose-selection",
    });
    return next;
  }, { waitForMs: 2_000 });
}
