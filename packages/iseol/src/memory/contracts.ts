import type { Principal } from "../identity/contracts.js";

export type MemoryRecord = {
  version: 1;
  id: string;
  userId: string;
  kind: string;
  content: string;
  source?: string;
  visibility: "private";
  /** Explicitly selected active team scopes; absent on legacy records means private-only. */
  sharedTeamIds?: string[];
  createdAt: string;
  updatedAt: string;
};

export type MemoryInput = {
  kind: string;
  content: string;
  source?: string;
};
export type MemoryPatch = {
  kind?: string;
  content?: string;
  source?: string | null;
};

export type MemoryQuery = {
  search?: string;
  limit?: number;
};

export type MemoryService = {
  appendPrivateMemory(principal: Principal, input: MemoryInput): Promise<MemoryRecord>;
  listPrivateMemories(principal: Principal, query: MemoryQuery): Promise<MemoryRecord[]>;
  listSharedMemories(principal: Principal, teamId: string): Promise<MemoryRecord[]>;
  updatePrivateMemory(principal: Principal, memoryId: string, patch: MemoryPatch): Promise<MemoryRecord | null>;
  updatePrivateMemorySharing(principal: Principal, memoryId: string, teamIds: string[]): Promise<MemoryRecord | null>;
  deletePrivateMemory(principal: Principal, memoryId: string): Promise<boolean>;
};
