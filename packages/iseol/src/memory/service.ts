import { randomUUID } from "node:crypto";
import { assertIdentityId, assertTimestamp, type Principal } from "../identity/contracts.js";
import type { TeamService } from "../teams/contracts.js";
import type { MemoryInput, MemoryPatch, MemoryRecord, MemoryService } from "./contracts.js";
import { withDurableMemoryLock } from "./memory-lock.js";
import { deleteMemoryUnlocked, listAllMemoriesUnlocked, listMemoriesUnlocked, loadMemoryUnlocked, saveMemory, saveMemoryUnlocked } from "./store.js";
import { withDurableTeamMembershipLock } from "../teams/membership-lock.js";

function ensurePrincipal(principal: Principal): void {
  assertIdentityId(principal.userId);
}

function sharedTeamIds(value: MemoryRecord): string[] {
  if (!Array.isArray(value.sharedTeamIds)) return [];
  return [...new Set(value.sharedTeamIds.filter((teamId): teamId is string => typeof teamId === "string" && (() => { try { assertIdentityId(teamId); return true; } catch { return false; } })()))];
}

function withSharing(value: MemoryRecord): MemoryRecord {
  return { ...value, ...(sharedTeamIds(value).length > 0 ? { sharedTeamIds: sharedTeamIds(value) } : { sharedTeamIds: [] }) };
}

function normalizeTeamIds(teamIds: string[]): string[] {
  if (!Array.isArray(teamIds) || teamIds.length > 20 || teamIds.some((teamId) => typeof teamId !== "string")) throw new Error("Memory sharing teams are invalid");
  const normalized = [...new Set(teamIds.map((teamId) => teamId.trim()))];
  normalized.forEach((teamId) => assertIdentityId(teamId));
  return normalized;
}

function activeHumanMember(teamId: string, userId: string, memberships: Awaited<ReturnType<TeamService["listMemberships"]>>): boolean {
  return memberships.some((membership) => membership.teamId === teamId && membership.userId === userId && membership.memberType === "human" && membership.status === "active");
}

async function withTeamMembershipLocks<T>(root: string, teamIds: string[], task: () => Promise<T>): Promise<T> {
  const [teamId, ...remaining] = teamIds;
  if (!teamId) return task();
  return withDurableTeamMembershipLock(root, teamId, () => withTeamMembershipLocks(root, remaining, task), { waitForMs: 2_000 });
}

export function createMemoryService(root: string, options: { now?: () => string; teamMembershipRoot?: string; teamService?: TeamService } = {}): MemoryService {
  const now = options.now ?? (() => new Date().toISOString());
  const teamMembershipRoot = options.teamMembershipRoot ?? root;
  return {
    async appendPrivateMemory(principal, input: MemoryInput): Promise<MemoryRecord> {
      ensurePrincipal(principal);
      if (!input.kind.trim() || input.kind.length > 100) throw new Error("Memory kind is required");
      if (!input.content.trim() || input.content.length > 20_000) throw new Error("Memory content is required");
      if (input.source !== undefined && input.source.length > 256) throw new Error("Memory source is too long");
      const at = now();
      assertTimestamp(at, "memory timestamp");
      const memory: MemoryRecord = {
        version: 1,
        id: `memory-${randomUUID()}`,
        userId: principal.userId,
        kind: input.kind.trim(),
        content: input.content.trim(),
        ...(input.source?.trim() ? { source: input.source.trim() } : {}),
        visibility: "private",
        sharedTeamIds: [],
        createdAt: at,
        updatedAt: at,
      };
      await saveMemory(root, memory);
      return memory;
    },

    async listPrivateMemories(principal, query): Promise<MemoryRecord[]> {
      ensurePrincipal(principal);
      const search = query.search?.trim().toLowerCase();
      const limit = Math.max(1, Math.min(500, Math.floor(query.limit ?? 100)));
      const current: MemoryRecord[] = [];
      for (const candidate of await listMemoriesUnlocked(root, principal.userId)) {
        try { assertIdentityId(candidate.id); } catch { continue; }
        await withDurableMemoryLock(root, principal.userId, candidate.id, async () => {
          const record = await loadMemoryUnlocked(root, principal.userId, candidate.id);
          if (!record || record.userId !== principal.userId || record.visibility !== "private") return;
          if (!search || `${record.kind} ${record.content} ${record.source ?? ""}`.toLowerCase().includes(search)) current.push(record);
        }, { waitForMs: 2_000 });
      }
      return current.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, limit).map(withSharing);
    },

    async listSharedMemories(principal, teamId): Promise<MemoryRecord[]> {
      ensurePrincipal(principal);
      assertIdentityId(teamId);
      if (!options.teamService) return [];
      return withDurableTeamMembershipLock(teamMembershipRoot, teamId, async () => {
        const memberships = await options.teamService!.listMembershipsWithinMembershipLock(teamId);
        if (!activeHumanMember(teamId, principal.userId, memberships)) return [];
        const current: MemoryRecord[] = [];
        for (const candidate of await listAllMemoriesUnlocked(root)) {
          try { assertIdentityId(candidate.userId); assertIdentityId(candidate.id); } catch { continue; }
          await withDurableMemoryLock(root, candidate.userId, candidate.id, async () => {
            const record = await loadMemoryUnlocked(root, candidate.userId, candidate.id);
            if (!record || record.visibility !== "private" || !sharedTeamIds(record).includes(teamId)) return;
            current.push(withSharing(record));
          }, { waitForMs: 2_000 });
        }
        return current.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id));
      }, { waitForMs: 2_000 });
    },

    async updatePrivateMemory(principal, memoryId, patch: MemoryPatch): Promise<MemoryRecord | null> {
      ensurePrincipal(principal);
      assertIdentityId(memoryId);
      return withDurableMemoryLock(root, principal.userId, memoryId, async () => {
        const current = await loadMemoryUnlocked(root, principal.userId, memoryId);
        if (!current || current.userId !== principal.userId || current.visibility !== "private") return null;
        if (!patch || typeof patch !== "object" || Object.keys(patch).length === 0) throw new Error("Memory patch is required");
        if (patch.kind !== undefined && (typeof patch.kind !== "string" || !patch.kind.trim() || patch.kind.length > 100)) throw new Error("Memory kind is required");
        if (patch.content !== undefined && (typeof patch.content !== "string" || !patch.content.trim() || patch.content.length > 20_000)) throw new Error("Memory content is required");
        if (patch.source !== undefined && patch.source !== null && (typeof patch.source !== "string" || patch.source.length > 256)) throw new Error("Memory source is too long");
        const at = now();
        assertTimestamp(at, "memory timestamp");
        const source = patch.source === null ? undefined : patch.source === undefined ? current.source : patch.source.trim() || undefined;
        const updated: MemoryRecord = {
          ...current,
          kind: patch.kind === undefined ? current.kind : patch.kind.trim(),
          content: patch.content === undefined ? current.content : patch.content.trim(),
          ...(source ? { source } : {}),
          updatedAt: at,
          sharedTeamIds: sharedTeamIds(current),
        };
        if (!source) delete updated.source;
        await saveMemoryUnlocked(root, updated);
        return updated;
      }, { waitForMs: 2_000 });
    },

    async updatePrivateMemorySharing(principal, memoryId, teamIds): Promise<MemoryRecord | null> {
      ensurePrincipal(principal);
      assertIdentityId(memoryId);
      const nextTeamIds = normalizeTeamIds(teamIds);
      const persistSharing = async () => withDurableMemoryLock(root, principal.userId, memoryId, async () => {
        const current = await loadMemoryUnlocked(root, principal.userId, memoryId);
        if (!current || current.userId !== principal.userId || current.visibility !== "private") return null;
        if (nextTeamIds.length > 0) {
          if (!options.teamService) throw new Error("Memory sharing is unavailable");
          for (const teamId of nextTeamIds) {
            const memberships = await options.teamService.listMembershipsWithinMembershipLock(teamId);
            if (!activeHumanMember(teamId, principal.userId, memberships)) throw new Error("Active team member access is required for memory sharing");
          }
        }
        const at = now();
        assertTimestamp(at, "memory sharing timestamp");
        const updated = { ...current, sharedTeamIds: nextTeamIds, updatedAt: at };
        await saveMemoryUnlocked(root, updated);
        return updated;
      }, { waitForMs: 2_000 });
      return nextTeamIds.length > 0 ? withTeamMembershipLocks(teamMembershipRoot, [...nextTeamIds].sort(), persistSharing) : persistSharing();
    },

    async deletePrivateMemory(principal, memoryId): Promise<boolean> {
      ensurePrincipal(principal);
      assertIdentityId(memoryId);
      return withDurableMemoryLock(root, principal.userId, memoryId, async () => {
        const current = await loadMemoryUnlocked(root, principal.userId, memoryId);
        if (!current || current.userId !== principal.userId || current.visibility !== "private") return false;
        return deleteMemoryUnlocked(root, principal.userId, memoryId);
      }, { waitForMs: 2_000 });
    },
  };
}
