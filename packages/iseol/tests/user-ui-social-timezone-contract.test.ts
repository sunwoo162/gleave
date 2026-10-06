import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

test("social and chat surfaces use the authenticated account timezone for timestamps", async () => {
  const root = resolve(process.cwd(), "user-ui/src/pages");
  const [friends, community, aiChat, teams] = await Promise.all([
    readFile(resolve(root, "Friends.tsx"), "utf8"),
    readFile(resolve(root, "Community.tsx"), "utf8"),
    readFile(resolve(root, "AIChat.tsx"), "utf8"),
    readFile(resolve(root, "Teams.tsx"), "utf8"),
  ]);
  for (const source of [friends, community, aiChat, teams]) {
    assert.match(source, /useUser/);
    assert.match(source, /profile\.timezone/);
  }
  assert.match(friends, /formatWorldTime/);
  assert.match(community, /formatWorldDateTime/);
  assert.match(aiChat, /formatWorldTime/);
  assert.match(teams, /formatWorldDateTime/);
  assert.doesNotMatch(friends, /new Date\(value\)\.toLocaleTimeString/);
  assert.doesNotMatch(aiChat, /new Date\(value\)\.toLocaleTimeString/);
  assert.doesNotMatch(community, /new Date\(post\.createdAt\)\.toLocaleString/);
  assert.doesNotMatch(teams, /new Date\(message\.createdAt\)\.toLocaleString/);
});
