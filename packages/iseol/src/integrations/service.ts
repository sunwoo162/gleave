import { createHash } from "node:crypto";
import { assertIdentityId, assertTimestamp, type Principal } from "../identity/contracts.js";
import { INTEGRATION_PROVIDERS, type IntegrationAdapter, type IntegrationDelivery, type IntegrationDeliveryInput, type IntegrationProvider, type IntegrationService } from "./contracts.js";
import { withDurableIntegrationDeliveryLock } from "./delivery-lock.js";
import { listIntegrationDeliveriesUnlocked, loadIntegrationDeliveryUnlocked, saveIntegrationDeliveryUnlocked } from "./store.js";

type IntegrationServiceOptions = {
  now?: () => string;
  adapters?: Partial<Record<IntegrationProvider, IntegrationAdapter>>;
  isOptedIn?: (userId: string, provider: IntegrationProvider) => boolean | Promise<boolean>;
};

function ensurePrincipal(principal: Principal): void { assertIdentityId(principal.userId); }

function validateInput(input: IntegrationDeliveryInput): void {
  if (!INTEGRATION_PROVIDERS.includes(input.provider)) throw new Error("Invalid integration provider");
  for (const [label, value] of [["sourceType", input.sourceType], ["sourceId", input.sourceId], ["eventType", input.eventType]] as const) {
    if (typeof value !== "string" || !value.trim() || value.length > 200 || /[\u0000-\u001f\u007f]/.test(value)) throw new Error(`Invalid integration ${label}`);
  }
  if (!Number.isInteger(input.eventVersion) || input.eventVersion < 1 || input.eventVersion > 1000) throw new Error("Invalid integration event version");
  const payload = input.payload ?? {};
  if (typeof payload !== "object" || Array.isArray(payload) || Object.keys(payload).length > 24) throw new Error("Invalid integration payload");
  for (const [key, value] of Object.entries(payload)) {
    if (!/^[A-Za-z0-9._:-]{1,80}$/.test(key) || (typeof value === "string" && value.length > 1000) || (value !== null && !["string", "number", "boolean"].includes(typeof value))) {
      throw new Error("Invalid integration payload");
    }
  }
}

function identity(userId: string, input: IntegrationDeliveryInput): string {
  return createHash("sha256").update([userId, input.provider, input.sourceType, input.sourceId, input.eventType, input.eventVersion].join("\u001f")).digest("hex").slice(0, 40);
}

function sameInput(current: IntegrationDelivery, input: IntegrationDeliveryInput): boolean {
  return current.provider === input.provider
    && current.sourceType === input.sourceType
    && current.sourceId === input.sourceId
    && current.eventType === input.eventType
    && current.eventVersion === input.eventVersion
    && JSON.stringify(current.payload) === JSON.stringify(input.payload ?? {});
}

export function createIntegrationService(root: string, options: IntegrationServiceOptions = {}): IntegrationService {
  const now = options.now ?? (() => new Date().toISOString());
  const adapters = options.adapters ?? {};
  const isOptedIn = options.isOptedIn ?? (() => false);
  const deliveryTails = new Map<string, Promise<void>>();
  async function withDeliveryLock<T>(key: string, task: () => Promise<T>): Promise<T> {
    const prior = deliveryTails.get(key) ?? Promise.resolve();
    let release!: () => void;
    const current = new Promise<void>((resolve) => { release = resolve; });
    const queued = prior.then(() => current);
    deliveryTails.set(key, queued);
    await prior;
    try { return await task(); }
    finally {
      release();
      if (deliveryTails.get(key) === queued) deliveryTails.delete(key);
    }
  }

  return {
    async enqueueDelivery(principal, input) {
      ensurePrincipal(principal);
      validateInput(input);
      const at = now();
      assertTimestamp(at, "integration delivery timestamp");
      const id = `integration-delivery-${identity(principal.userId, input)}`;
      return withDeliveryLock(`${principal.userId}:${id}`, () => withDurableIntegrationDeliveryLock(root, principal.userId, id, async () => {
        const existing = await loadIntegrationDeliveryUnlocked(root, principal.userId, id);
        if (existing) {
          if (!sameInput(existing, input)) throw new Error("Delivery identity conflict");
          return existing;
        }
        const delivery: IntegrationDelivery = {
          version: 1,
          id,
          userId: principal.userId,
          provider: input.provider,
          sourceType: input.sourceType,
          sourceId: input.sourceId,
          eventType: input.eventType,
          eventVersion: input.eventVersion,
          payload: { ...(input.payload ?? {}) },
          state: "queued",
          attempts: 0,
          createdAt: at,
          updatedAt: at,
        };
        await saveIntegrationDeliveryUnlocked(root, delivery);
        return delivery;
      }, { waitForMs: 2_000 }));
    },

    async dispatchDelivery(principal, deliveryId) {
      ensurePrincipal(principal);
      assertIdentityId(deliveryId);
      return withDeliveryLock(`${principal.userId}:${deliveryId}`, () => withDurableIntegrationDeliveryLock(root, principal.userId, deliveryId, async () => {
        const current = await loadIntegrationDeliveryUnlocked(root, principal.userId, deliveryId);
        if (!current || current.userId !== principal.userId) throw new Error("Delivery not found");
        if (current.state !== "queued") return current;
        const at = now();
        assertTimestamp(at, "integration delivery timestamp");
        if (!await isOptedIn(principal.userId, current.provider)) {
          const blocked: IntegrationDelivery = { ...current, state: "blocked", reason: "user-opt-in-required", updatedAt: at };
          await saveIntegrationDeliveryUnlocked(root, blocked);
          return blocked;
        }
        const adapter = adapters[current.provider];
        if (!adapter) {
          const unavailable: IntegrationDelivery = { ...current, state: "not-configured", reason: "provider-adapter-unconfigured", updatedAt: at };
          await saveIntegrationDeliveryUnlocked(root, unavailable);
          return unavailable;
        }
        const attempting: IntegrationDelivery = { ...current, attempts: current.attempts + 1, updatedAt: at };
        try {
          const result = await adapter.deliver(attempting);
          if ("externalRef" in result) {
            if (!result.externalRef.trim() || result.externalRef.length > 300 || /[\u0000-\u001f\u007f]/.test(result.externalRef)) throw new Error("Invalid provider reference");
            const delivered: IntegrationDelivery = { ...attempting, state: "delivered", externalRef: result.externalRef, updatedAt: now() };
            assertTimestamp(delivered.updatedAt, "integration delivery timestamp");
            await saveIntegrationDeliveryUnlocked(root, delivered);
            return delivered;
          }
          const unknown: IntegrationDelivery = { ...attempting, state: "unknown", reason: "provider-error", updatedAt: now() };
          assertTimestamp(unknown.updatedAt, "integration delivery timestamp");
          await saveIntegrationDeliveryUnlocked(root, unknown);
          return unknown;
        } catch {
          const unknown: IntegrationDelivery = { ...attempting, state: "unknown", reason: "provider-error", updatedAt: now() };
          assertTimestamp(unknown.updatedAt, "integration delivery timestamp");
          await saveIntegrationDeliveryUnlocked(root, unknown);
          return unknown;
        }
      }, { waitForMs: 2_000 }));
    },

    async listDeliveries(principal) {
      ensurePrincipal(principal);
      const current: IntegrationDelivery[] = [];
      for (const candidate of await listIntegrationDeliveriesUnlocked(root, principal.userId)) {
        try { assertIdentityId(candidate.id); } catch { continue; }
        await withDurableIntegrationDeliveryLock(root, principal.userId, candidate.id, async () => {
          const delivery = await loadIntegrationDeliveryUnlocked(root, principal.userId, candidate.id);
          if (delivery?.userId === principal.userId) current.push(delivery);
        }, { waitForMs: 2_000 });
      }
      return current.sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id));
    },
  };
}
