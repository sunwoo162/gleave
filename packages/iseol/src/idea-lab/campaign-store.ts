import { resolve } from "node:path";
import type { IdeaLabCampaign } from "./contracts.js";
import { assertIdeaLabCampaign, assertIdeaLabId } from "./contracts.js";
import { ideaLabDirectory, listIdeaLabJsonFiles, readIdeaLabJson, writeIdeaLabJsonAtomic } from "./store-utils.js";
import { withDurableIdeaLabCampaignLock } from "./campaign-lock.js";

function campaignFile(root: string, id: string): string {
  assertIdeaLabId(id);
  return resolve(ideaLabDirectory(root, "campaigns"), `${id}.json`);
}

export async function saveIdeaLabCampaignUnlocked(root: string, campaign: IdeaLabCampaign): Promise<void> {
  assertIdeaLabCampaign(campaign);
  await writeIdeaLabJsonAtomic(campaignFile(root, campaign.id), campaign);
}

export async function saveIdeaLabCampaign(root: string, campaign: IdeaLabCampaign): Promise<void> {
  return withDurableIdeaLabCampaignLock(
    root,
    campaign.id,
    () => saveIdeaLabCampaignUnlocked(root, campaign),
    { waitForMs: 2_000 },
  );
}

export async function loadIdeaLabCampaignUnlocked(root: string, id: string): Promise<IdeaLabCampaign | null> {
  const value = await readIdeaLabJson<IdeaLabCampaign>(campaignFile(root, id));
  if (value) assertIdeaLabCampaign(value);
  return value;
}

export async function loadIdeaLabCampaign(root: string, id: string): Promise<IdeaLabCampaign | null> {
  return withDurableIdeaLabCampaignLock(root, id, () => loadIdeaLabCampaignUnlocked(root, id), { waitForMs: 2_000 });
}

export async function listIdeaLabCampaigns(root: string): Promise<IdeaLabCampaign[]> {
  const directory = ideaLabDirectory(root, "campaigns");
  const campaigns: IdeaLabCampaign[] = [];
  for (const name of await listIdeaLabJsonFiles(directory)) {
    const id = name.slice(0, -5);
    assertIdeaLabId(id);
    const campaign = await withDurableIdeaLabCampaignLock(
      root,
      id,
      () => loadIdeaLabCampaignUnlocked(root, id),
      { waitForMs: 2_000 },
    );
    if (campaign) campaigns.push(campaign);
  }
  return campaigns.sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
}
