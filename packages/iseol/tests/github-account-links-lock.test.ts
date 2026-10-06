import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { GitHubAccountLinkStore } from "../src/services/github-user.js";

test("GitHub account links preserve concurrent links from independent stores", async () => {
  const dir = await mkdtemp(join(tmpdir(), "iseol-github-account-links-lock-"));
  const file = join(dir, "github-users.json");
  const first = new GitHubAccountLinkStore(file);
  const second = new GitHubAccountLinkStore(file);

  await Promise.all([
    first.link("guild-a", "discord-a", "alice"),
    second.link("guild-b", "discord-b", "bob"),
  ]);

  const result = await new GitHubAccountLinkStore(file).list();
  assert.deepEqual(result.map((item) => item.githubLogin).sort(), ["alice", "bob"]);
  await rm(dir, { recursive: true, force: true });
});

test("GitHub account links preserve concurrent unlink operations from independent stores", async () => {
  const dir = await mkdtemp(join(tmpdir(), "iseol-github-account-links-unlink-lock-"));
  const file = join(dir, "github-users.json");
  const first = new GitHubAccountLinkStore(file);
  const second = new GitHubAccountLinkStore(file);
  await first.link("guild-a", "discord-a", "alice");
  await first.link("guild-b", "discord-b", "bob");

  await Promise.all([
    first.unlink("guild-a", "discord-a"),
    second.unlink("guild-b", "discord-b"),
  ]);

  assert.deepEqual(await new GitHubAccountLinkStore(file).list(), []);
  await rm(dir, { recursive: true, force: true });
});

test("GitHub account links remove one guild without touching another guild", async () => {
  const dir = await mkdtemp(join(tmpdir(), "iseol-github-account-links-guild-reset-"));
  try {
    const file = join(dir, "github-users.json");
    const store = new GitHubAccountLinkStore(file);
    await store.link("guild-target", "discord-target", "target-login");
    await store.link("guild-other", "discord-other", "other-login");

    const linksBeforeMissingGuild = await store.list();
    const otherLink = linksBeforeMissingGuild.find((link) => link.guildId === "guild-other");
    assert.ok(otherLink);
    assert.equal(await store.removeGuild("guild-target"), 1);
    assert.deepEqual(await store.list(), [otherLink]);
    assert.equal(await store.removeGuild("guild-missing"), 0);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
