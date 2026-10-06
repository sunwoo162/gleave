import { resolve } from "node:path";
import type { IdeaProposal } from "./contracts.js";
import { assertIdeaLabId, assertIdeaProposal } from "./contracts.js";
import { withDurableIdeaLabProposalLock } from "./proposal-lock.js";
import { ideaLabDirectory, readIdeaLabJson, writeIdeaLabJsonAtomic } from "./store-utils.js";

function proposalFile(root: string, id: string): string {
  assertIdeaLabId(id);
  return resolve(ideaLabDirectory(root, "proposals"), `${id}.json`);
}

export async function saveIdeaProposalUnlocked(root: string, proposal: IdeaProposal): Promise<void> {
  assertIdeaProposal(proposal);
  await writeIdeaLabJsonAtomic(proposalFile(root, proposal.id), proposal);
}

export async function saveIdeaProposal(root: string, proposal: IdeaProposal): Promise<void> {
  return withDurableIdeaLabProposalLock(
    root,
    proposal.id,
    () => saveIdeaProposalUnlocked(root, proposal),
    { waitForMs: 2_000 },
  );
}

export async function loadIdeaProposalUnlocked(root: string, id: string): Promise<IdeaProposal | null> {
  const value = await readIdeaLabJson<IdeaProposal>(proposalFile(root, id));
  if (value) assertIdeaProposal(value);
  return value;
}

export async function loadIdeaProposal(root: string, id: string): Promise<IdeaProposal | null> {
  return withDurableIdeaLabProposalLock(
    root,
    id,
    () => loadIdeaProposalUnlocked(root, id),
    { waitForMs: 2_000 },
  );
}
