import assert from "node:assert/strict";
import test from "node:test";
import { withDiscordChannelEnsureLock } from "../src/services/discord-channel-ensure-lock.js";

test("discord channel ensure lock serializes the same category across concurrent workers", async () => {
  const scope = `test:${Date.now()}:${Math.random()}`;
  let release!: () => void;
  const firstStarted = new Promise<void>((resolveStarted) => {
    void withDiscordChannelEnsureLock(scope, async () => {
      resolveStarted();
      await new Promise<void>((resolveRelease) => { release = resolveRelease; });
    });
  });
  await firstStarted;

  let secondSettled = false;
  const secondRun = withDiscordChannelEnsureLock(scope, async () => {
    secondSettled = true;
  });
  await new Promise((resolveWait) => setTimeout(resolveWait, 50));
  assert.equal(secondSettled, false);
  release();
  await secondRun;
  assert.equal(secondSettled, true);
});
