import { resolve } from "node:path";
import type { PrototypeProduction } from "./contracts.js";
import { assertIdeaLabId, assertPrototypeProduction } from "./contracts.js";
import { withDurableIdeaLabProductionLock } from "./production-lock.js";
import { ideaLabDirectory, listIdeaLabJsonFiles, readIdeaLabJson, writeIdeaLabJsonAtomic } from "./store-utils.js";

function productionFile(root: string, id: string): string {
  assertIdeaLabId(id);
  return resolve(ideaLabDirectory(root, "productions"), `${id}.json`);
}

export async function savePrototypeProductionUnlocked(root: string, production: PrototypeProduction): Promise<void> {
  assertPrototypeProduction(production);
  await writeIdeaLabJsonAtomic(productionFile(root, production.id), production);
}

export async function savePrototypeProduction(root: string, production: PrototypeProduction): Promise<void> {
  return withDurableIdeaLabProductionLock(
    root,
    production.id,
    () => savePrototypeProductionUnlocked(root, production),
    { waitForMs: 2_000 },
  );
}

export async function loadPrototypeProductionUnlocked(root: string, id: string): Promise<PrototypeProduction | null> {
  const value = await readIdeaLabJson<PrototypeProduction>(productionFile(root, id));
  if (value) assertPrototypeProduction(value);
  return value;
}

export async function loadPrototypeProduction(root: string, id: string): Promise<PrototypeProduction | null> {
  return withDurableIdeaLabProductionLock(
    root,
    id,
    () => loadPrototypeProductionUnlocked(root, id),
    { waitForMs: 2_000 },
  );
}

export async function listPrototypeProductions(root: string): Promise<PrototypeProduction[]> {
  const directory = ideaLabDirectory(root, "productions");
  const productions: PrototypeProduction[] = [];
  for (const name of await listIdeaLabJsonFiles(directory)) {
    const id = name.slice(0, -5);
    assertIdeaLabId(id);
    const production = await withDurableIdeaLabProductionLock(
      root,
      id,
      () => loadPrototypeProductionUnlocked(root, id),
      { waitForMs: 2_000 },
    );
    if (production) productions.push(production);
  }
  return productions.sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
}
