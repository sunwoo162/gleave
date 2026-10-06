import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { ProjectStore } from "../src/services/projects.js";

function project(name: string, guildId: string): Parameters<ProjectStore["save"]>[0] {
  return {
    name,
    guildId,
    categoryId: `category-${guildId}`,
    organization: "iseol",
    frontend: { owner: "iseol", repo: `${name}-frontend` },
    backend: { owner: "iseol", repo: `${name}-backend` },
  };
}

test("service project state preserves concurrent saves from independent stores", async () => {
  const dir = await mkdtemp(join(tmpdir(), "iseol-service-projects-lock-"));
  const file = join(dir, "projects.json");
  const first = new ProjectStore(file);
  const second = new ProjectStore(file);

  await Promise.all([
    first.save(project("alpha", "guild-a")),
    second.save(project("beta", "guild-b")),
  ]);

  const result = await new ProjectStore(file).list();
  assert.deepEqual(result.map((item) => item.name).sort(), ["alpha", "beta"]);
  await rm(dir, { recursive: true, force: true });
});

test("service project state preserves concurrent updates from independent stores", async () => {
  const dir = await mkdtemp(join(tmpdir(), "iseol-service-projects-update-lock-"));
  const file = join(dir, "projects.json");
  const first = new ProjectStore(file);
  const second = new ProjectStore(file);
  const alpha = await first.save(project("alpha", "guild-a"));
  const beta = await first.save(project("beta", "guild-b"));

  await Promise.all([
    first.update(alpha.id, { organization: "alpha-org" }),
    second.update(beta.id, { organization: "beta-org" }),
  ]);

  const result = await new ProjectStore(file).list();
  assert.deepEqual(result.map((item) => [item.name, item.organization]).sort(), [
    ["alpha", "alpha-org"],
    ["beta", "beta-org"],
  ]);
  await rm(dir, { recursive: true, force: true });
});

test("service project polling lock serializes external integration runs", async () => {
  const dir = await mkdtemp(join(tmpdir(), "iseol-service-projects-polling-lock-"));
  const store = new ProjectStore(join(dir, "projects.json"));
  let release!: () => void;
  const entered = new Promise<void>((resolve) => { release = resolve; });
  let active = 0;
  let maximumActive = 0;

  const first = store.withPollingLock(async () => {
    active += 1;
    maximumActive = Math.max(maximumActive, active);
    await entered;
    active -= 1;
  });
  while (active === 0) await new Promise((resolve) => setImmediate(resolve));

  let secondFinished = false;
  const second = store.withPollingLock(async () => {
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
