import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { ContestAudienceFeedStore, type ContestAudienceFeedState } from "../src/services/contest-audience-feed.js";
import { ContestFeedStore, type ContestFeedState } from "../src/services/contest-feed.js";
import { listRepostTargets } from "../src/services/contest-repost-all.js";

function contestFeed(guildId: string): ContestFeedState {
  return {
    guildId,
    categoryId: `category-${guildId}`,
    channelId: `contest-${guildId}`,
    postedKeys: [],
    audienceFilter: "all",
    createdAt: new Date(0).toISOString(),
  };
}

function audienceFeed(guildId: string, filter: ContestAudienceFeedState["audienceFilter"]): ContestAudienceFeedState {
  return {
    guildId,
    categoryId: `category-${guildId}`,
    channelId: `audience-${filter}`,
    audienceFilter: filter,
    postedKeys: [],
    createdAt: new Date(0).toISOString(),
  };
}

test("contest repost target discovery reads through durable feed stores", async () => {
  const dir = await mkdtemp(join(tmpdir(), "iseol-contest-repost-state-read-"));
  const contestStore = new ContestFeedStore(join(dir, "contest-feed.json"));
  const audienceStore = new ContestAudienceFeedStore(join(dir, "contest-audience-feeds.json"));
  await contestStore.save(contestFeed("guild-a"));
  await audienceStore.save(audienceFeed("guild-a", "high-school"));
  await audienceStore.save(audienceFeed("guild-b", "university"));

  const result = await listRepostTargets("guild-a", contestStore, audienceStore);
  assert.deepEqual(result, [
    { channelId: "contest-guild-a", audienceFilter: "all" },
    { channelId: "audience-high-school", audienceFilter: "high-school" },
  ]);
  await rm(dir, { recursive: true, force: true });
});
