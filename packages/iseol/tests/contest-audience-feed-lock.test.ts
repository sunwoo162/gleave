import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { ChannelType, Collection, TextChannel } from "discord.js";
import { ContestAudienceFeedStore, createContestAudienceFeed, type ContestAudienceFeedState } from "../src/services/contest-audience-feed.js";
import { ContestFeedStore, createContestFeed } from "../src/services/contest-feed.js";

function state(guildId: string, audienceFilter: ContestAudienceFeedState["audienceFilter"]): ContestAudienceFeedState {
  return {
    guildId,
    categoryId: `category-${guildId}`,
    channelId: `channel-${audienceFilter}`,
    audienceFilter,
    postedKeys: [],
    createdAt: new Date(0).toISOString(),
  };
}

test("contest audience feed state preserves concurrent saves from independent stores", async () => {
  const dir = await mkdtemp(join(tmpdir(), "iseol-contest-audience-feed-lock-"));
  const file = join(dir, "contest-audience-feeds.json");
  const first = new ContestAudienceFeedStore(file);
  const second = new ContestAudienceFeedStore(file);

  await Promise.all([
    first.save(state("guild-a", "high-school")),
    second.save(state("guild-a", "university")),
  ]);

  const result = await new ContestAudienceFeedStore(file).list();
  assert.deepEqual(result.map((item) => item.audienceFilter).sort(), ["high-school", "university"]);
  await rm(dir, { recursive: true, force: true });
});

test("contest audience feed state updates are serialized across independent stores", async () => {
  const dir = await mkdtemp(join(tmpdir(), "iseol-contest-audience-feed-update-lock-"));
  const file = join(dir, "contest-audience-feeds.json");
  const first = new ContestAudienceFeedStore(file);
  const second = new ContestAudienceFeedStore(file);
  await first.save(state("guild-a", "high-school"));
  await first.save(state("guild-b", "university"));

  await Promise.all([
    first.update("guild-a", "high-school", (current) => ({ ...current, postedKeys: ["alpha"] })),
    second.update("guild-b", "university", (current) => ({ ...current, postedKeys: ["beta"] })),
  ]);

  const result = await new ContestAudienceFeedStore(file).list();
  assert.deepEqual(result.map((item) => [item.guildId, item.postedKeys]).sort(), [
    ["guild-a", ["alpha"]],
    ["guild-b", ["beta"]],
  ]);
  await rm(dir, { recursive: true, force: true });
});

test("contest audience delivery lock serializes concurrent polls for one audience feed", async () => {
  const dir = await mkdtemp(join(tmpdir(), "iseol-contest-audience-delivery-lock-"));
  const store = new ContestAudienceFeedStore(join(dir, "contest-audience-feeds.json"));
  let release!: () => void;
  const entered = new Promise<void>((resolve) => { release = resolve; });
  let active = 0;
  let maximumActive = 0;

  const first = store.withDeliveryLock("guild-a", "high-school", async () => {
    active += 1;
    maximumActive = Math.max(maximumActive, active);
    await entered;
    active -= 1;
  });
  while (active === 0) await new Promise((resolve) => setImmediate(resolve));

  let secondFinished = false;
  const second = store.withDeliveryLock("guild-a", "high-school", async () => {
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

test("contest audience setup creates one channel for concurrent requests", async () => {
  const dir = await mkdtemp(join(tmpdir(), "iseol-contest-audience-setup-lock-"));
  const store = new ContestAudienceFeedStore(join(dir, "contest-audience-feeds.json"));
  const defaultFile = join(process.cwd(), "data", "contest-audience-feeds.json");
  let previous: Buffer | null = null;
  try { previous = await readFile(defaultFile); } catch { /* test creates the file */ }
  const createdNames: string[] = [];
  const existingChannel = Object.create(TextChannel.prototype) as TextChannel & { send: () => Promise<void> };
  existingChannel.id = "audience-channel";
  existingChannel.send = async () => undefined;
  const guild = {
    id: "contest-audience-setup-lock-guild",
    channels: {
      cache: { find: () => undefined },
      fetch: async (id: string) => id === existingChannel.id ? existingChannel : null,
      create: async (input: { name: string; type: number }) => {
        createdNames.push(input.name);
        if (input.type === ChannelType.GuildCategory) return { id: "category" };
        return existingChannel;
      },
    },
  };

  try {
    const [first, second] = await Promise.all([
      createContestAudienceFeed(guild as any, "high-school", store),
      createContestAudienceFeed(guild as any, "high-school", store),
    ]);
    assert.deepEqual(createdNames, ["🏆 공모전", "🎓・고등학생-공모전"]);
    assert.equal(first.state.channelId, second.state.channelId);
    assert.equal((await store.list()).length, 1);
  } finally {
    if (previous) await writeFile(defaultFile, previous);
    else await rm(defaultFile, { force: true });
    await rm(dir, { recursive: true, force: true });
  }
});

test("contest audience feeds share one category creation across filters", async () => {
  const dir = await mkdtemp(join(tmpdir(), "iseol-contest-audience-category-lock-"));
  const store = new ContestAudienceFeedStore(join(dir, "contest-audience-feeds.json"));
  const defaultFile = join(process.cwd(), "data", "contest-feeds.json");
  let previous: Buffer | null = null;
  try { previous = await readFile(defaultFile); } catch { /* test creates the file */ }

  const createdNames: string[] = [];
  const channels = new Map<string, any>();
  const guild = {
    id: "contest-audience-category-lock-guild",
    channels: {
      cache: { find: () => undefined },
      fetch: async (id?: string) => {
        if (id) return channels.get(id) ?? null;
        return { find: (predicate: (channel: any) => boolean) => [...channels.values()].find(predicate) };
      },
      create: async (input: { name: string; type: number }) => {
        await new Promise((resolve) => setTimeout(resolve, input.type === ChannelType.GuildCategory ? 30 : 0));
        createdNames.push(input.name);
        if (input.type === ChannelType.GuildCategory) {
          const category = { id: "shared-category", name: input.name, type: ChannelType.GuildCategory };
          channels.set(category.id, category);
          return category;
        }

        const channel = Object.create(TextChannel.prototype) as TextChannel & { send: () => Promise<void> };
        channel.id = `channel-${input.name}`;
        channel.send = async () => undefined;
        channels.set(channel.id, channel);
        return channel;
      },
    },
  };

  try {
    const [first, second] = await Promise.all([
      createContestAudienceFeed(guild as any, "high-school", store),
      createContestAudienceFeed(guild as any, "university", store),
    ]);
    assert.equal(createdNames.filter((name) => name === "🏆 공모전").length, 1);
    assert.equal(first.state.categoryId, second.state.categoryId);
  } finally {
    if (previous) await writeFile(defaultFile, previous);
    else await rm(defaultFile, { force: true });
    await rm(dir, { recursive: true, force: true });
  }
});

test("base and audience contest feeds share one category creation", async () => {
  const dir = await mkdtemp(join(tmpdir(), "iseol-contest-category-shared-lock-"));
  const audienceStore = new ContestAudienceFeedStore(join(dir, "contest-audience-feeds.json"));
  const baseStore = new ContestFeedStore(join(dir, "contest-feeds.json"));
  const defaultFile = join(process.cwd(), "data", "contest-feeds.json");
  let previous: Buffer | null = null;
  try { previous = await readFile(defaultFile); } catch { /* test creates the file */ }

  const createdNames: string[] = [];
  const channels = new Map<string, any>();
  const guild = {
    id: "contest-category-shared-lock-guild",
    channels: {
      cache: { find: () => undefined },
      fetch: async (id?: string) => id ? channels.get(id) ?? null : new Collection(channels),
      create: async (input: { name: string; type: number }) => {
        await new Promise((resolve) => setTimeout(resolve, input.type === ChannelType.GuildCategory ? 30 : 0));
        createdNames.push(input.name);
        if (input.type === ChannelType.GuildCategory) {
          const category = { id: "shared-contest-category", name: input.name, type: ChannelType.GuildCategory };
          channels.set(category.id, category);
          return category;
        }

        const channel = Object.create(TextChannel.prototype) as TextChannel & { send: () => Promise<void> };
        channel.id = `channel-${createdNames.length}`;
        channel.send = async () => undefined;
        channels.set(channel.id, channel);
        return channel;
      },
    },
  };

  try {
    const [base, audience] = await Promise.all([
      createContestFeed(guild as any, baseStore),
      createContestAudienceFeed(guild as any, "high-school", audienceStore),
    ]);
    assert.equal(createdNames.filter((name) => name === "🏆 공모전").length, 1);
    assert.equal(base.categoryId, audience.state.categoryId);
  } finally {
    if (previous) await writeFile(defaultFile, previous);
    else await rm(defaultFile, { force: true });
    await rm(dir, { recursive: true, force: true });
  }
});
