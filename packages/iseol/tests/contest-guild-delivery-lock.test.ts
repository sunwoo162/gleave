import assert from "node:assert/strict";
import test from "node:test";
import { withContestGuildDeliveryLock } from "../src/services/contest-feed.js";

test("contest guild delivery lock serializes publishers for one guild", async () => {
  let release!: () => void;
  const held = new Promise<void>((resolve) => { release = resolve; });
  let active = 0;
  let maximumActive = 0;

  const first = withContestGuildDeliveryLock("contest-guild-delivery-lock", async () => {
    active += 1;
    maximumActive = Math.max(maximumActive, active);
    await held;
    active -= 1;
  });
  while (active === 0) await new Promise((resolve) => setImmediate(resolve));

  let secondFinished = false;
  const second = withContestGuildDeliveryLock("contest-guild-delivery-lock", async () => {
    secondFinished = true;
    active += 1;
    maximumActive = Math.max(maximumActive, active);
    active -= 1;
  });

  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(secondFinished, false);
  release();
  await Promise.all([first, second]);

  assert.equal(maximumActive, 1);
  assert.equal(secondFinished, true);
});
