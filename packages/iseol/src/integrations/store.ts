import { randomBytes } from "node:crypto";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { assertIdentityId } from "../identity/contracts.js";
import { renameWithTransientRetry } from "../desktop-agent/atomic-file.js";
import type { IntegrationDelivery } from "./contracts.js";
import { withDurableIntegrationDeliveryLock } from "./delivery-lock.js";

function deliveryDirectory(root: string, userId: string): string {
  assertIdentityId(userId);
  return resolve(root, "users", userId, "integrations", "deliveries");
}

function deliveryPath(root: string, userId: string, deliveryId: string): string {
  assertIdentityId(deliveryId);
  return resolve(deliveryDirectory(root, userId), `${deliveryId}.json`);
}

async function saveJson(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.${randomBytes(4).toString("hex")}.tmp`;
  await writeFile(temporary, JSON.stringify(value, null, 2), "utf8");
  await renameWithTransientRetry(temporary, path);
}

export async function saveIntegrationDeliveryUnlocked(root: string, value: IntegrationDelivery): Promise<void> {
  await saveJson(deliveryPath(root, value.userId, value.id), value);
}

export async function saveIntegrationDelivery(root: string, value: IntegrationDelivery): Promise<void> {
  await withDurableIntegrationDeliveryLock(root, value.userId, value.id, () => saveIntegrationDeliveryUnlocked(root, value), { waitForMs: 2_000 });
}

export async function loadIntegrationDeliveryUnlocked(root: string, userId: string, deliveryId: string): Promise<IntegrationDelivery | null> {
  try {
    return JSON.parse(await readFile(deliveryPath(root, userId, deliveryId), "utf8")) as IntegrationDelivery;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

export async function loadIntegrationDelivery(root: string, userId: string, deliveryId: string): Promise<IntegrationDelivery | null> {
  return withDurableIntegrationDeliveryLock(root, userId, deliveryId, () => loadIntegrationDeliveryUnlocked(root, userId, deliveryId), { waitForMs: 2_000 });
}

export async function listIntegrationDeliveriesUnlocked(root: string, userId: string): Promise<IntegrationDelivery[]> {
  const directory = deliveryDirectory(root, userId);
  let names: string[];
  try { names = await readdir(directory); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return []; throw error; }
  const result: IntegrationDelivery[] = [];
  for (const name of names.filter((entry) => entry.endsWith(".json")).sort()) {
    try { result.push(JSON.parse(await readFile(resolve(directory, name), "utf8")) as IntegrationDelivery); }
    catch { /* malformed delivery records are not exposed */ }
  }
  return result;
}

export async function listIntegrationDeliveries(root: string, userId: string): Promise<IntegrationDelivery[]> {
  const candidates = await listIntegrationDeliveriesUnlocked(root, userId);
  const result: IntegrationDelivery[] = [];
  for (const candidate of candidates) {
    try { assertIdentityId(candidate.id); } catch { continue; }
    await withDurableIntegrationDeliveryLock(root, userId, candidate.id, async () => {
      const current = await loadIntegrationDeliveryUnlocked(root, userId, candidate.id);
      if (current?.userId === userId) result.push(current);
    }, { waitForMs: 2_000 });
  }
  return result;
}
