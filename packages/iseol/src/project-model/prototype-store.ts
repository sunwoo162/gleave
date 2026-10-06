import { randomBytes } from "node:crypto";
import { mkdir, readFile, readdir, rename, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { PrototypeBrowserAcceptanceCheck, PrototypeCandidate } from "./contracts.js";
import { assertProjectModelId, PROTOTYPE_BROWSER_ACCEPTANCE_CHECKS } from "./contracts.js";
import { withDurablePrototypeLock } from "./prototype-lock.js";

function prototypeFile(root: string, id: string): string {
  assertProjectModelId(id);
  return resolve(root, "prototypes", `${id}.json`);
}

async function writeAtomic(path: string, value: unknown): Promise<void> {
  await mkdir(resolve(path, ".."), { recursive: true });
  const temp = `${path}.${process.pid}.${randomBytes(4).toString("hex")}.tmp`;
  await writeFile(temp, JSON.stringify(value, null, 2), "utf8");
  await rename(temp, path);
}

export async function savePrototypeCandidateUnlocked(
  root: string,
  candidate: PrototypeCandidate,
): Promise<void> {
  assertProjectModelId(candidate.id);
  await writeAtomic(prototypeFile(root, candidate.id), candidate);
}

export async function savePrototypeCandidate(
  root: string,
  candidate: PrototypeCandidate,
): Promise<void> {
  return withDurablePrototypeLock(
    root,
    candidate.id,
    () => savePrototypeCandidateUnlocked(root, candidate),
    { waitForMs: 2_000 },
  );
}

export async function loadPrototypeCandidateUnlocked(
  root: string,
  id: string,
): Promise<PrototypeCandidate | null> {
  const path = prototypeFile(root, id);
  try {
    return JSON.parse(await readFile(path, "utf8")) as PrototypeCandidate;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

export async function loadPrototypeCandidate(
  root: string,
  id: string,
): Promise<PrototypeCandidate | null> {
  return withDurablePrototypeLock(root, id, () => loadPrototypeCandidateUnlocked(root, id), { waitForMs: 2_000 });
}

export async function updatePrototypeCandidate(
  root: string,
  id: string,
  updates: Partial<Omit<PrototypeCandidate, "id" | "version">>,
  options: { rejectPromoted?: boolean; promotedError?: string; returnIfStatus?: PrototypeCandidate["status"] } = {},
): Promise<PrototypeCandidate | null> {
  return withDurablePrototypeLock(root, id, async () => {
    const current = await loadPrototypeCandidateUnlocked(root, id);
    if (!current) return null;
    if (options.rejectPromoted && current.status === "promoted") {
      throw new Error(options.promotedError ?? `Promoted prototype acceptance is immutable: ${id}`);
    }
    if (options.returnIfStatus && current.status === options.returnIfStatus) return current;
    const updated: PrototypeCandidate = { ...current, ...updates, id, version: 1 };
    await savePrototypeCandidateUnlocked(root, updated);
    return updated;
  }, { waitForMs: 2_000 });
}

export async function recordPrototypeBrowserAcceptance(
  root: string,
  id: string,
  checks: Record<PrototypeBrowserAcceptanceCheck, "pass" | "fail" | "unverified">,
  checkedAt: string,
): Promise<PrototypeCandidate> {
  for (const check of PROTOTYPE_BROWSER_ACCEPTANCE_CHECKS) {
    if (checks[check] !== "pass" && checks[check] !== "fail" && checks[check] !== "unverified") {
      throw new Error(`Invalid browser acceptance check: ${check}`);
    }
  }
  const status = PROTOTYPE_BROWSER_ACCEPTANCE_CHECKS.every((check) => checks[check] === "pass") ? "verified" : "unverified";
  const updated = await updatePrototypeCandidate(root, id, {
    browserAcceptance: { status, checkedAt, checks },
    updatedAt: checkedAt,
  }, { rejectPromoted: true });
  if (!updated) throw new Error(`Prototype not found: ${id}`);
  return updated;
}

export async function listPrototypeCandidates(
  root: string,
): Promise<PrototypeCandidate[]> {
  const directory = resolve(root, "prototypes");
  let names: string[];
  try {
    names = await readdir(directory);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }

  const candidates: PrototypeCandidate[] = [];
  for (const name of names.filter((entry) => entry.endsWith(".json")).sort()) {
    const id = name.slice(0, -".json".length);
    assertProjectModelId(id);
    const candidate = await withDurablePrototypeLock(
      root,
      id,
      () => loadPrototypeCandidateUnlocked(root, id),
      { waitForMs: 2_000 },
    );
    if (candidate) candidates.push(candidate);
  }
  return candidates.sort((a, b) =>
    a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id),
  );
}
