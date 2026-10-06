import { listIdeaLabCampaigns } from "./campaign-store.js";

export type IdeaLabRuntimeService = {
  enqueue(campaignId: string): void;
  retryRun(runId: string): Promise<"accepted" | "already-active" | "not-allowed">;
  recover(): Promise<void>;
  idle(): Promise<void>;
  dispose(): Promise<void>;
};

export type IdeaLabRuntimeOptions = {
  modelRoot: string;
  superviseCampaign: (campaignId: string) => Promise<void>;
  recoveryGuard?: (campaignId: string) => Promise<boolean>;
  onError?: (campaignId: string, safeSummary: string) => void;
  requestRetry?: (runId: string) => Promise<"accepted" | "already-active" | "not-allowed">;
  concurrency?: 1;
};

const SAFE_ERROR_SUMMARY = "Campaign supervision failed";

export function createIdeaLabRuntimeService(options: IdeaLabRuntimeOptions): IdeaLabRuntimeService {
  const concurrency = options.concurrency as number | undefined;
  if (concurrency !== undefined && concurrency !== 1) {
    throw new Error("Idea Lab runtime concurrency must be 1");
  }
  const freshQueue: string[] = [];
  const recoveryQueue: string[] = [];
  const scheduled = new Set<string>();
  const failedPasses = new Map<string, number>();
  const pendingRecoveryAfterPass = new Set<string>();
  const MAX_AUTOMATIC_RETRIES = 1;
  let accepting = true;
  let running = false;
  let activeCampaignId: string | null = null;
  let drainWaiters: Array<() => void> = [];

  const signalIdle = () => {
    if (!running && freshQueue.length === 0 && recoveryQueue.length === 0) {
      const waiters = drainWaiters;
      drainWaiters = [];
      for (const resolve of waiters) resolve();
    }
  };

  const pump = async (): Promise<void> => {
    if (running) return;
    running = true;
    try {
      while (freshQueue.length || recoveryQueue.length) {
        const campaignId = freshQueue.shift() ?? recoveryQueue.shift()!;
        let retryAfterFailure = false;
        activeCampaignId = campaignId;
        try {
          await options.superviseCampaign(campaignId);
          failedPasses.delete(campaignId);
        } catch {
          try { options.onError?.(campaignId, SAFE_ERROR_SUMMARY); } catch { /* reporting must not stop the worker */ }
          const attempts = failedPasses.get(campaignId) ?? 0;
          if (attempts < MAX_AUTOMATIC_RETRIES) {
            try {
              const campaign = (await listIdeaLabCampaigns(options.modelRoot))
                .find((item) => item.id === campaignId);
              if (campaign && (campaign.status === "generating" || campaign.status === "producing")) {
                failedPasses.set(campaignId, attempts + 1);
                retryAfterFailure = true;
              } else {
                failedPasses.delete(campaignId);
              }
            } catch {
              failedPasses.delete(campaignId);
            }
          } else {
            failedPasses.delete(campaignId);
          }
        } finally {
          activeCampaignId = null;
          scheduled.delete(campaignId);

          const recoverAfterPass =
            pendingRecoveryAfterPass.delete(campaignId);

          if (retryAfterFailure || recoverAfterPass) {
            const allowed = await (options.recoveryGuard?.(campaignId) ?? Promise.resolve(true));
            if (allowed) schedule(campaignId, "recovery");
          }
        }
      }
    } finally {
      running = false;
      signalIdle();
    }
  };

  const schedule = (campaignId: string, source: "fresh" | "recovery"): void => {
    if (!accepting) return;

    if (scheduled.has(campaignId)) {
      if (source === "recovery" && activeCampaignId === campaignId) {
        pendingRecoveryAfterPass.add(campaignId);
      }
      return;
    }
    scheduled.add(campaignId);
    (source === "fresh" ? freshQueue : recoveryQueue).push(campaignId);
    void pump();
  };
  const enqueue = (campaignId: string): void => schedule(campaignId, "fresh");

  return {
    enqueue,
    async retryRun(runId) {
      if (!options.requestRetry) return "not-allowed";
      return options.requestRetry(runId);
    },
    async recover() {
      for (const campaign of await listIdeaLabCampaigns(options.modelRoot)) {
        if (campaign.status !== "generating" && campaign.status !== "producing") continue;
        const allowed = await (options.recoveryGuard?.(campaign.id) ?? Promise.resolve(true));
        if (allowed) schedule(campaign.id, "recovery");
      }
    },
    idle() {
      if (!running && freshQueue.length === 0 && recoveryQueue.length === 0) return Promise.resolve();
      return new Promise<void>((resolve) => drainWaiters.push(resolve));
    },
    async dispose() {
      accepting = false;
      await this.idle();
    },
  };
}
