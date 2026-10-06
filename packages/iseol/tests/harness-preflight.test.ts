import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DevelopmentRunRequest } from "../src/harness/contracts.js";
import {
  assertPreflightReady,
  prepareDevelopmentRun,
} from "../src/harness/preflight.js";

async function roots(withGlobal = true) {
  const root = await mkdtemp(join(tmpdir(), "iseol-preflight-"));
  const iseolRoot = join(root, "iseol");
  const targetRoot = join(root, "target");
  await mkdir(join(iseolRoot, "docs"), { recursive: true });
  await mkdir(targetRoot, { recursive: true });
  if (withGlobal) {
    await writeFile(join(iseolRoot, "docs", "HARNESS_ENGINEERING.md"), "global policy\n");
  }
  return { iseolRoot, targetRoot };
}

function request(targetRoot: string): DevelopmentRunRequest {
  return {
    version: 1,
    runId: "run-001",
    mode: "project-workspace",
    objective: "Implement profile editing",
    targetRoot,
  };
}

test("development run becomes ready only after policy resolution", async () => {
  const { iseolRoot, targetRoot } = await roots();
  const preflight = await prepareDevelopmentRun(request(targetRoot), {
    iseolRoot,
    loadedAt: "2026-09-07T00:00:00.000Z",
  });

  assert.equal(preflight.status, "ready");
  assert.equal(preflight.runId, "run-001");
  assert.equal(preflight.gitPreparation, "bootstrap-if-empty");
  assert.ok(preflight.policy?.sources.some((source) => source.kind === "iseol-global"));
  assert.doesNotThrow(() => assertPreflightReady(preflight));
});

test("missing global harness guidance blocks the run", async () => {
  const { iseolRoot, targetRoot } = await roots(false);
  const preflight = await prepareDevelopmentRun(request(targetRoot), { iseolRoot });

  assert.equal(preflight.status, "blocked");
  assert.equal(preflight.policy, undefined);
  assert.match(preflight.reason ?? "", /global HARNESS_ENGINEERING\.md/i);
  assert.throws(() => assertPreflightReady(preflight), /Development Run preflight is not ready/);
});

test("invalid run requests fail before policy resolution", async () => {
  const { iseolRoot, targetRoot } = await roots();
  const invalid = { ...request(targetRoot), objective: "" };

  await assert.rejects(
    prepareDevelopmentRun(invalid, { iseolRoot }),
    /objective is required/,
  );
});
