import { createHash } from "node:crypto";
import { assertIdentityId, assertTimestamp, type Principal } from "../identity/contracts.js";
import type { ActivityEvent, ActivityEventInput, ActivityService } from "./contracts.js";
import { withDurableActivityEventLock } from "./event-lock.js";
import { listActivityEventsUnlocked, loadActivityEventUnlocked, saveActivityEventUnlocked } from "./store.js";

function ensurePrincipal(principal: Principal): void { assertIdentityId(principal.userId); }

function eventId(userId: string, input: ActivityEventInput): string {
  const key = [userId, input.sourceType, input.sourceId, input.eventType, input.eventVersion].join("\u001f");
  return `activity-${createHash("sha256").update(key).digest("hex").slice(0, 40)}`;
}

function validateInput(input: ActivityEventInput): void {
  for (const [label, value] of [["sourceType", input.sourceType], ["sourceId", input.sourceId], ["eventType", input.eventType]] as const) {
    if (!/^[A-Za-z0-9._:-]{1,120}$/.test(value)) throw new Error(`Invalid activity ${label}`);
  }
  if (!Number.isInteger(input.eventVersion) || input.eventVersion < 1 || input.eventVersion > 1000) throw new Error("Invalid activity event version");
  if (!new Set(["user", "ai", "system"]).has(input.actorType)) throw new Error("Invalid activity actor");
  if (!new Set(["verified", "unverified", "unknown"]).has(input.verificationStatus)) throw new Error("Invalid activity verification");
  if (input.payload !== undefined) {
    if (typeof input.payload !== "object" || Array.isArray(input.payload) || Object.keys(input.payload).length > 32) throw new Error("Invalid activity payload");
    for (const [key, value] of Object.entries(input.payload)) {
      if (!/^[A-Za-z0-9._:-]{1,80}$/.test(key) || (value !== null && !["string", "number", "boolean"].includes(typeof value))) throw new Error("Invalid activity payload");
    }
  }
}

export function createActivityService(root: string, options: { now?: () => string } = {}): ActivityService {
  const now = options.now ?? (() => new Date().toISOString());
  return {
    async recordActivityEvent(principal, input): Promise<ActivityEvent> {
      ensurePrincipal(principal);
      validateInput(input);
      const at = now();
      assertTimestamp(at, "activity timestamp");
      const occurredAt = input.occurredAt ?? at;
      assertTimestamp(occurredAt, "activity occurrence timestamp");
      const id = eventId(principal.userId, input);
      return withDurableActivityEventLock(root, principal.userId, id, async () => {
        const existing = await loadActivityEventUnlocked(root, principal.userId, id);
        if (existing) {
          const sameIdentity = existing.userId === principal.userId
            && existing.sourceType === input.sourceType
            && existing.sourceId === input.sourceId
            && existing.eventType === input.eventType
            && existing.eventVersion === input.eventVersion;
          const sameEvidence = sameIdentity
            && existing.actorType === input.actorType
            && existing.verificationStatus === input.verificationStatus
            && JSON.stringify(existing.payload) === JSON.stringify(input.payload ?? {})
            && existing.occurredAt === occurredAt;
          if (!sameEvidence) throw new Error("Activity event identity conflict");
          return existing;
        }
        const event: ActivityEvent = {
          version: 1,
          id,
          userId: principal.userId,
          sourceType: input.sourceType,
          sourceId: input.sourceId,
          eventType: input.eventType,
          eventVersion: input.eventVersion,
          actorType: input.actorType,
          verificationStatus: input.verificationStatus,
          status: "active",
          payload: { ...(input.payload ?? {}) },
          occurredAt,
          createdAt: at,
          updatedAt: at,
        };
        await saveActivityEventUnlocked(root, event);
        return event;
      }, { waitForMs: 2_000 });
    },

    async listActivityEvents(principal): Promise<ActivityEvent[]> {
      ensurePrincipal(principal);
      const candidates = await listActivityEventsUnlocked(root, principal.userId);
      const current: ActivityEvent[] = [];
      for (const candidate of candidates) {
        await withDurableActivityEventLock(root, principal.userId, candidate.id, async () => {
          const event = await loadActivityEventUnlocked(root, principal.userId, candidate.id);
          if (event?.userId === principal.userId) current.push(event);
        }, { waitForMs: 2_000 });
      }
      return current.sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
    },

    async getActivityEvent(principal, eventIdValue): Promise<ActivityEvent | null> {
      ensurePrincipal(principal);
      try { assertIdentityId(eventIdValue); } catch { return null; }
      return withDurableActivityEventLock(root, principal.userId, eventIdValue, async () => {
        const event = await loadActivityEventUnlocked(root, principal.userId, eventIdValue);
        return event?.userId === principal.userId ? event : null;
      }, { waitForMs: 2_000 });
    },

    async retractActivityEvent(principal, eventIdValue, at = now()): Promise<ActivityEvent> {
      ensurePrincipal(principal);
      assertIdentityId(eventIdValue);
      assertTimestamp(at, "activity retraction timestamp");
      return withDurableActivityEventLock(root, principal.userId, eventIdValue, async () => {
        const event = await loadActivityEventUnlocked(root, principal.userId, eventIdValue);
        if (!event || event.userId !== principal.userId) throw new Error("Activity event not found");
        if (event.status === "retracted") return event;
        const retracted: ActivityEvent = { ...event, status: "retracted", retractedAt: at, updatedAt: at };
        await saveActivityEventUnlocked(root, retracted);
        return retracted;
      }, { waitForMs: 2_000 });
    },
  };
}
