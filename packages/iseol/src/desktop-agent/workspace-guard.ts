import { createHash } from "node:crypto";
import { readFile, realpath } from "node:fs/promises";
import { basename, dirname, isAbsolute, relative, resolve, sep } from "node:path";
import type { DesktopTaskPack } from "./contracts.js";

function digest(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

function isInside(base: string, target: string): boolean {
  const rel = relative(base, target);
  return rel === "" || (!rel.startsWith(`..${sep}`) && rel !== ".." && !isAbsolute(rel));
}

async function canonicalizePotentialPath(input: string): Promise<string> {
  let current = resolve(input);
  const missing: string[] = [];
  while (true) {
    try {
      const actual = await realpath(current);
      return resolve(actual, ...missing.reverse());
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      const parent = dirname(current);
      if (parent === current) throw error;
      missing.push(basename(current));
      current = parent;
    }
  }
}

async function canonicalAllowedRoots(allowedRoots: string[]): Promise<string[]> {
  if (allowedRoots.length === 0) throw new Error("Desktop Agent has no allowed workspace roots");
  return Promise.all(allowedRoots.map((root) => realpath(resolve(root))));
}

async function assertUnderAllowedRoots(
  allowedRoots: string[],
  target: string,
): Promise<string> {
  const roots = await canonicalAllowedRoots(allowedRoots);
  const actual = await canonicalizePotentialPath(target);
  if (!roots.some((root) => isInside(root, actual))) {
    throw new Error(`Path is outside Desktop Agent allowed roots: ${target}`);
  }
  return actual;
}

export async function assertWorkspaceAccess(
  allowedRoots: string[],
  workspaceRoot: string,
  requestedPath: string,
): Promise<string> {
  const workspace = await assertUnderAllowedRoots(allowedRoots, workspaceRoot);
  const requested = isAbsolute(requestedPath)
    ? requestedPath
    : resolve(workspace, requestedPath);
  const actual = await canonicalizePotentialPath(requested);
  if (!isInside(workspace, actual)) {
    throw new Error(`Path is outside Desktop workspace: ${requestedPath}`);
  }
  return actual;
}

export async function verifyDesktopTaskPolicy(
  pack: DesktopTaskPack,
  allowedRoots: string[],
): Promise<void> {
  if (!pack.policyDigest || !pack.policySources?.length) {
    throw new Error("Desktop Task Pack policy provenance is required");
  }
  const verified = [] as Array<{ kind: string; path: string; sha256: string }>;
  for (const source of pack.policySources) {
    await assertUnderAllowedRoots(allowedRoots, source.path);
    let content: string;
    try {
      content = await readFile(source.path, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT" && source.required) {
        throw new Error(`Required policy source is unavailable: ${source.path}`);
      }
      throw error;
    }
    const actualSha = digest(content);
    if (actualSha !== source.sha256) {
      throw new Error(`Desktop policy source hash mismatch: ${source.path}`);
    }
    verified.push({ kind: source.kind, path: source.path, sha256: actualSha });
  }
  const effectiveSha = digest(
    verified
      .map((source) => `${source.kind}\n${source.path}\n${source.sha256}`)
      .join("\n---\n"),
  );
  if (effectiveSha !== pack.policyDigest) {
    throw new Error("Desktop effective policy digest mismatch");
  }
}
