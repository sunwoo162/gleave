import { randomUUID } from "node:crypto";
import type { IdeaLabCampaign } from "../idea-lab/contracts.js";
import { assertIdeaLabId } from "../idea-lab/contracts.js";
import { withDurableIdeaLabCampaignLock } from "../idea-lab/campaign-lock.js";
import { loadIdeaLabCampaignUnlocked, saveIdeaLabCampaignUnlocked } from "../idea-lab/campaign-store.js";
import { appendIdeaLabCampaignEventOnce } from "../idea-lab/event-store.js";

export class WebIdeaLabActionError extends Error {
  constructor(readonly status: 400 | 404 | 409, message: string) {
    super(message);
    this.name = "WebIdeaLabActionError";
  }
}

export type CreateWebIdeaLabCampaignOptions = {
  root: string;
  body: unknown;
  at: string;
  idFactory?: () => string;
};

function requireObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new WebIdeaLabActionError(400, "Campaign body must be an object");
  }
  return value as Record<string, unknown>;
}

function boundedInteger(value: unknown, fallback: number, min: number, max: number, label: string): number {
  if (value === undefined) return fallback;
  if (!Number.isInteger(value) || Number(value) < min || Number(value) > max) {
    throw new WebIdeaLabActionError(400, `${label} must be an integer from ${min} to ${max}`);
  }
  return Number(value);
}

export async function createWebIdeaLabCampaign(options: CreateWebIdeaLabCampaignOptions): Promise<IdeaLabCampaign> {
  const body = requireObject(options.body);
  const allowed = new Set(["seed", "constraints", "targetReadyCount", "productionConcurrency"]);
  for (const key of Object.keys(body)) {
    if (!allowed.has(key)) throw new WebIdeaLabActionError(400, `Campaign body contains unknown field: ${key}`);
  }
  if (typeof body.seed !== "string" || !body.seed.trim() || body.seed.trim().length > 500) {
    throw new WebIdeaLabActionError(400, "Campaign seed must be a non-empty string up to 500 characters");
  }
  const seed = body.seed.trim();
  const constraints = body.constraints ?? [];
  if (!Array.isArray(constraints) || constraints.length > 20 || constraints.some((item) => typeof item !== "string" || !item.trim())) {
    throw new WebIdeaLabActionError(400, "Campaign constraints must be up to 20 non-empty strings");
  }
  const targetReadyCount = boundedInteger(body.targetReadyCount, 3, 1, 20, "targetReadyCount");
  const productionConcurrency = boundedInteger(body.productionConcurrency, 1, 1, 4, "productionConcurrency");
  const id = (options.idFactory ?? (() => `campaign-${randomUUID()}`))();
  try { assertIdeaLabId(id); } catch { throw new WebIdeaLabActionError(400, "Generated Campaign id is invalid"); }
  return withDurableIdeaLabCampaignLock(options.root, id, async () => {
    if (await loadIdeaLabCampaignUnlocked(options.root, id)) throw new WebIdeaLabActionError(409, `Campaign already exists: ${id}`);
    const campaign: IdeaLabCampaign = {
      version: 1, id, seed, constraints: constraints.map((item) => String(item).trim()),
      targetReadyCount, productionConcurrency, proposalIds: [], productionIds: [], status: "generating",
      createdAt: options.at, updatedAt: options.at,
    };
    await saveIdeaLabCampaignUnlocked(options.root, campaign);
    await appendIdeaLabCampaignEventOnce(options.root, {
      version: 1,
      id: `campaign-created-${id}`,
      campaignId: id,
      type: "campaign-created",
      at: options.at,
      summary: `Created Idea Lab Campaign ${id}`,
    });
    return campaign;
  }, { waitForMs: 2_000 });
}

export async function cancelWebIdeaLabCampaign(root: string, campaignId: string, at: string): Promise<IdeaLabCampaign> {
  try { assertIdeaLabId(campaignId); } catch { throw new WebIdeaLabActionError(404, "Campaign not found"); }
  return withDurableIdeaLabCampaignLock(root, campaignId, async () => {
    const campaign = await loadIdeaLabCampaignUnlocked(root, campaignId);
    if (!campaign) throw new WebIdeaLabActionError(404, `Campaign not found: ${campaignId}`);
    if (campaign.status === "cancelled") return campaign;
    if (campaign.status === "complete") throw new WebIdeaLabActionError(409, `Completed Campaign cannot be cancelled: ${campaignId}`);
    const { blockerSummary: _ignoredBlocker, ...campaignWithoutBlocker } = campaign;
    const updated: IdeaLabCampaign = { ...campaignWithoutBlocker, status: "cancelled", updatedAt: at };
    await saveIdeaLabCampaignUnlocked(root, updated);
    await appendIdeaLabCampaignEventOnce(root, {
      version: 1,
      id: `campaign-cancelled-${campaignId}`,
      campaignId,
      type: "campaign-cancelled",
      at,
      summary: `Cancelled Idea Lab Campaign ${campaignId}`,
    });
    return updated;
  }, { waitForMs: 2_000 });
}
