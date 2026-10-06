import { randomUUID } from "node:crypto";
import { mkdir, readdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { assertIdentityId, assertTimestamp } from "../identity/contracts.js";
import type { AiTeamProposal } from "./contracts.js";
import { withDurableAiTeamProposalLock } from "./proposal-lock.js";

function file(root: string, projectId: string, proposalId: string): string { assertIdentityId(projectId); assertIdentityId(proposalId); return resolve(root, "proposals", projectId, `${proposalId}.json`); }
function validate(value: AiTeamProposal): void {
  if (value.version !== 1) throw new Error("Unsupported AI team proposal version");
  assertIdentityId(value.id); assertIdentityId(value.projectId); assertIdentityId(value.teamId); assertIdentityId(value.agentId);
  if (!value.requestId.trim() || !value.title.trim() || !value.objective.trim()) throw new Error("AI team proposal fields are required");
  if (!["waiting-runtime", "proposed", "accepted", "rejected"].includes(value.status)) throw new Error("Invalid AI team proposal status");
  if (value.acceptanceCriteria.length > 8 || value.acceptanceCriteria.some((item) => !item.trim() || item.length > 300)) throw new Error("AI team proposal acceptance criteria are invalid");
  assertTimestamp(value.createdAt, "AI team proposal createdAt"); assertTimestamp(value.updatedAt, "AI team proposal updatedAt");
}
async function loadAt(path: string): Promise<AiTeamProposal | null> { try { const value = JSON.parse(await readFile(path, "utf8")) as AiTeamProposal; validate(value); return value; } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return null; throw error; } }
export async function saveAiTeamProposalUnlocked(root: string, proposal: AiTeamProposal): Promise<void> { validate(proposal); const path = file(root, proposal.projectId, proposal.id); await mkdir(dirname(path), { recursive: true }); const temp = `${path}.${process.pid}.${randomUUID()}.tmp`; await writeFile(temp, JSON.stringify(proposal, null, 2), "utf8"); await rename(temp, path); }
export async function saveAiTeamProposal(root: string, proposal: AiTeamProposal): Promise<void> {
  return withDurableAiTeamProposalLock(root, proposal.projectId, proposal.requestId, () => saveAiTeamProposalUnlocked(root, proposal), { waitForMs: 2_000 });
}
export async function loadAiTeamProposalUnlocked(root: string, projectId: string, proposalId: string): Promise<AiTeamProposal | null> { return loadAt(file(root, projectId, proposalId)); }
export async function loadAiTeamProposal(root: string, projectId: string, proposalId: string): Promise<AiTeamProposal | null> {
  const candidate = await loadAiTeamProposalUnlocked(root, projectId, proposalId);
  if (!candidate) return null;
  return withDurableAiTeamProposalLock(root, projectId, candidate.requestId, () => loadAiTeamProposalUnlocked(root, projectId, proposalId), { waitForMs: 2_000 });
}
export async function listAiTeamProposalsUnlocked(root: string, projectId: string): Promise<AiTeamProposal[]> {
  assertIdentityId(projectId); let names: string[]; try { names = await readdir(resolve(root, "proposals", projectId)); } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return []; throw error; }
  const result: AiTeamProposal[] = []; for (const name of names.filter((item) => item.endsWith(".json"))) { const value = await loadAt(resolve(root, "proposals", projectId, name)); if (value) result.push(value); }
  return result.sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
}
export async function listAiTeamProposals(root: string, projectId: string): Promise<AiTeamProposal[]> {
  const candidates = await listAiTeamProposalsUnlocked(root, projectId);
  const result: AiTeamProposal[] = [];
  for (const candidate of candidates) {
    const current = await withDurableAiTeamProposalLock(root, projectId, candidate.requestId, () => loadAiTeamProposalUnlocked(root, projectId, candidate.id), { waitForMs: 2_000 });
    if (current) result.push(current);
  }
  return result.sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
}
