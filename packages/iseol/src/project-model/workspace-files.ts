import { lstat, readdir, readFile, realpath, stat } from "node:fs/promises";
import { isAbsolute, join, relative, resolve, sep } from "node:path";

export type UserProjectWorkspaceFile = { path: string; size: number };
export type UserProjectWorkspaceDiffLine = { kind: "context" | "addition" | "deletion"; text: string; oldLine?: number; newLine?: number };
export type UserProjectWorkspaceDiffHunk = { header: string; lines: UserProjectWorkspaceDiffLine[] };
export type UserProjectWorkspaceFilePreview =
  | { status: "ready"; path: string; size: number; content: string }
  | { status: "ready"; path: string; size: number; content: string; format: "unified-diff"; stats: { additions: number; deletions: number }; hunks: UserProjectWorkspaceDiffHunk[] }
  | { status: "not-available"; path: string; blocker: string };
export type UserProjectWorkspaceFiles =
  | { status: "ready"; items: UserProjectWorkspaceFile[]; truncated?: boolean }
  | { status: "not-available"; items: []; blocker: string };

const MAX_FILES = 500;
const MAX_DEPTH = 8;
const MAX_PREVIEW_BYTES = 128 * 1024;
const IGNORED_DIRECTORIES = new Set([".git", ".iseol", "node_modules", "dist", "coverage", ".next", "__pycache__"]);
const SECRET_LIKE_NAME = /(^|[._-])(env|secret|credential|credentials|token|password|id_rsa)([._-]|$)/i;

function inside(root: string, target: string): boolean {
  const relation = relative(resolve(root), resolve(target));
  return relation === "" || (relation !== ".." && !relation.startsWith(`..${sep}`) && !isAbsolute(relation));
}

function unavailable(path: string, blocker: string): UserProjectWorkspaceFilePreview {
  return { status: "not-available", path, blocker };
}

type ParsedDiff = { stats: { additions: number; deletions: number }; hunks: UserProjectWorkspaceDiffHunk[] };

function parseHunkHeader(line: string): { oldLine: number; newLine: number } | null {
  const match = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/.exec(line);
  if (!match) return null;
  return { oldLine: Number(match[1]), newLine: Number(match[3]) };
}

export function parseUnifiedDiff(content: string): ParsedDiff | null {
  const lines = content.replaceAll("\r\n", "\n").split("\n");
  const hasFileHeaders = lines.some((line) => line.startsWith("diff --git ")) && lines.some((line) => line.startsWith("--- ")) && lines.some((line) => line.startsWith("+++ "));
  if (!hasFileHeaders) return null;

  const hunks: UserProjectWorkspaceDiffHunk[] = [];
  let current: { hunk: UserProjectWorkspaceDiffHunk; oldLine: number; newLine: number } | null = null;
  let additions = 0;
  let deletions = 0;
  for (const line of lines) {
    const header = parseHunkHeader(line);
    if (header) {
      current = { hunk: { header: line, lines: [] }, ...header };
      hunks.push(current.hunk);
      continue;
    }
    if (!current || line.startsWith("diff --git ") || line.startsWith("--- ") || line.startsWith("+++ ") || line.startsWith("index ") || line.startsWith("new file mode ") || line.startsWith("deleted file mode ")) continue;
    if (line === "" || line === "\\ No newline at end of file") continue;
    const prefix = line[0];
    if (prefix === " ") {
      current.hunk.lines.push({ kind: "context", text: line.slice(1), oldLine: current.oldLine, newLine: current.newLine });
      current.oldLine += 1;
      current.newLine += 1;
    } else if (prefix === "-") {
      current.hunk.lines.push({ kind: "deletion", text: line.slice(1), oldLine: current.oldLine });
      current.oldLine += 1;
      deletions += 1;
    } else if (prefix === "+") {
      current.hunk.lines.push({ kind: "addition", text: line.slice(1), newLine: current.newLine });
      current.newLine += 1;
      additions += 1;
    } else {
      return null;
    }
  }
  return hunks.length > 0 ? { stats: { additions, deletions }, hunks } : null;
}

export async function readUserProjectWorkspaceFile(workspaceRoot: string, requestedPath: string): Promise<UserProjectWorkspaceFilePreview> {
  const path = requestedPath.replaceAll("\\", "/");
  const parts = path.split("/");
  if (!path || isAbsolute(path) || path.startsWith("/") || parts.some((part) => !part || part === "." || part === ".." || SECRET_LIKE_NAME.test(part))) {
    return unavailable(path, "Project file is not available for preview.");
  }

  const root = resolve(workspaceRoot);
  const target = resolve(root, ...parts);
  if (!inside(root, target)) return unavailable(path, "Project file is outside the workspace.");
  try {
    const [rootReal, targetInfo] = await Promise.all([realpath(root), lstat(target)]);
    if (!targetInfo.isFile() || targetInfo.isSymbolicLink()) return unavailable(path, "Only regular text files can be previewed.");
    const targetReal = await realpath(target);
    if (!inside(rootReal, targetReal)) return unavailable(path, "Project file is outside the workspace.");
    if (targetInfo.size > MAX_PREVIEW_BYTES) return unavailable(path, "Project file is too large to preview.");
    const bytes = await readFile(target);
    if (bytes.length > MAX_PREVIEW_BYTES) return unavailable(path, "Only bounded text files can be previewed.");
    if (bytes.includes(0)) return unavailable(path, "Binary files cannot be previewed.");
    let content: string;
    try { content = new TextDecoder("utf-8", { fatal: true }).decode(bytes); }
    catch { return unavailable(path, "Project file is not valid UTF-8 text."); }
    const canonicalPath = relative(rootReal, targetReal).split(sep).join("/");
    const diff = parseUnifiedDiff(content);
    return diff
      ? { status: "ready", path: canonicalPath, size: bytes.length, content, format: "unified-diff", ...diff }
      : { status: "ready", path: canonicalPath, size: bytes.length, content };
  } catch {
    return unavailable(path, "Project file is not available for preview.");
  }
}

export async function listUserProjectWorkspaceFiles(workspaceRoot: string): Promise<UserProjectWorkspaceFiles> {
  const root = resolve(workspaceRoot);
  try {
    const rootInfo = await stat(root);
    if (!rootInfo.isDirectory()) return { status: "not-available", items: [], blocker: "Project workspace directory is not available." };
  } catch {
    return { status: "not-available", items: [], blocker: "Project workspace directory is not available." };
  }

  const items: UserProjectWorkspaceFile[] = [];
  let truncated = false;
  const visit = async (directory: string, depth: number): Promise<void> => {
    if (depth > MAX_DEPTH || truncated) return;
    let entries;
    try { entries = await readdir(directory, { withFileTypes: true }); }
    catch { return; }
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      if (truncated || entry.name === "." || entry.name === ".." || entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) {
        if (!IGNORED_DIRECTORIES.has(entry.name)) await visit(join(directory, entry.name), depth + 1);
        continue;
      }
      if (!entry.isFile() || SECRET_LIKE_NAME.test(entry.name)) continue;
      const filePath = join(directory, entry.name);
      if (!inside(root, filePath)) continue;
      let info;
      try { info = await stat(filePath); } catch { continue; }
      const relativePath = relative(root, filePath).split(sep).join("/");
      items.push({ path: relativePath, size: info.size });
      if (items.length >= MAX_FILES) truncated = true;
    }
  };
  await visit(root, 0);
  items.sort((a, b) => a.path.localeCompare(b.path));
  return { status: "ready", items, ...(truncated ? { truncated: true } : {}) };
}
