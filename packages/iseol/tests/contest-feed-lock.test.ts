import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { ChannelType } from "discord.js";
import { ContestFeedStore, createContestFeed, type ContestFeedState } from "../src/services/contest-feed.js";

function state(guildId: string): ContestFeedState {
  return {
    guildId,
    categoryId: `category-${guildId}`,
    channelId: `channel-${guildId}`,
    postedKeys: [],
    remindedKeys: [],
    audienceFilter: "all",
    createdAt: new Date(0).toISOString(),
  };
}

test("contest feed state preserves concurrent saves from independent stores", async () => {
  const dir = await mkdtemp(join(tmpdir(), "iseol-contest-feed-lock-"));
  const file = join(dir, "contest-feed.json");
  const first = new ContestFeedStore(file);
  const second = new ContestFeedStore(file);

  await Promise.all([
    first.save(state("guild-a")),
    second.save(state("guild-b")),
  ]);

  const result = await new ContestFeedStore(file).list();
  assert.deepEqual(result.map((item) => item.guildId).sort(), ["guild-a", "guild-b"]);
  await rm(dir, { recursive: true, force: true });
});

test("contest feed state updates are serialized across independent stores", async () => {
  const dir = await mkdtemp(join(tmpdir(), "iseol-contest-feed-update-lock-"));
  const file = join(dir, "contest-feed.json");
  const first = new ContestFeedStore(file);
  const second = new ContestFeedStore(file);
  await first.save(state("guild-a"));
  await first.save(state("guild-b"));

  await Promise.all([
    first.update("guild-a", (current) => ({ ...current, postedKeys: ["alpha"] })),
    second.update("guild-b", (current) => ({ ...current, postedKeys: ["beta"] })),
  ]);

  const result = await new ContestFeedStore(file).list();
  assert.deepEqual(result.map((item) => [item.guildId, item.postedKeys]).sort(), [
    ["guild-a", ["alpha"]],
    ["guild-b", ["beta"]],
  ]);
  await rm(dir, { recursive: true, force: true });
});

test("contest feed delivery lock serializes concurrent polls for one guild", async () => {
  const dir = await mkdtemp(join(tmpdir(), "iseol-contest-feed-delivery-lock-"));
  const store = new ContestFeedStore(join(dir, "contest-feed.json"));
  let release!: () => void;
  const entered = new Promise<void>((resolve) => { release = resolve; });
  let active = 0;
  let maximumActive = 0;

  const first = store.withDeliveryLock("guild-a", async () => {
    active += 1;
    maximumActive = Math.max(maximumActive, active);
    await entered;
    active -= 1;
  });
  while (active === 0) await new Promise((resolve) => setImmediate(resolve));

  let secondFinished = false;
  const second = store.withDeliveryLock("guild-a", async () => {
    secondFinished = true;
  });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(secondFinished, false);

  release();
  await Promise.all([first, second]);
  assert.equal(maximumActive, 1);
  assert.equal(secondFinished, true);
  await rm(dir, { recursive: true, force: true });
});

test("contest feed setup creates one channel pair for concurrent requests", async () => {
  const dir = await mkdtemp(join(tmpdir(), "iseol-contest-feed-setup-lock-"));
  const store = new ContestFeedStore(join(dir, "contest-feed.json"));
  const createdNames: string[] = [];
  const guild = {
    id: "1539559244028715060",
    channels: {
      cache: { find: () => undefined },
      create: async (input: { name: string; type: number }) => {
        createdNames.push(input.name);
        if (input.type === ChannelType.GuildCategory) return { id: "category", delete: async () => undefined };
        return { id: "channel", send: async () => undefined };
      },
    },
  };

  const [first, second] = await Promise.all([
    createContestFeed(guild as any, store),
    createContestFeed(guild as any, store),
  ]);
  assert.deepEqual(createdNames, ["🏆 공모전", "📢・공모전"]);
  assert.equal(first.channelId, second.channelId);
  assert.equal((await store.list()).length, 1);
  await rm(dir, { recursive: true, force: true });
});
