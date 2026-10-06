import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";

test("release readiness command and CI workflow exist", async () => {
  assert.equal(existsSync("scripts/check-release-readiness.mjs"), true);
  assert.equal(existsSync(".github/workflows/ci.yml"), true);
  assert.equal(existsSync(".github/workflows/release.yml"), true);
  assert.equal(existsSync("scripts/docker-release-smoke.mjs"), true);
  const workflow = await readFile(".github/workflows/ci.yml", "utf8");
  const releaseWorkflow = await readFile(".github/workflows/release.yml", "utf8");
  assert.match(workflow, /runs-on:\s*windows-latest/);
  assert.match(workflow, /npm ci/);
  assert.match(workflow, /npm --prefix user-ui ci/);
  assert.match(workflow, /npm audit --audit-level=high/);
  assert.match(workflow, /npm test/);
  assert.match(workflow, /npm run build/);
  assert.match(workflow, /npm run user-ui:build/);
  assert.match(workflow, /check-release-readiness/);
  assert.match(workflow, /lfs:\s*true/);
  assert.match(workflow, /DISCORD_TOKEN:\s*ci-discord-token/);
  assert.match(workflow, /DISCORD_CLIENT_ID:\s*ci-discord-client/);
  assert.match(workflow, /GITHUB_TOKEN:\s*ci-github-token/);
  assert.match(workflow, /FIGMA_TOKEN:\s*ci-figma-token/);
  assert.match(workflow, /NOTION_TOKEN:\s*ci-notion-token/);
  assert.match(releaseWorkflow, /gh release view/);
  assert.match(releaseWorkflow, /gh release create/);
  assert.match(releaseWorkflow, /smoke:docker-release/);
  assert.match(releaseWorkflow, /DISCORD_TOKEN:\s*release-discord-token/);
  assert.match(releaseWorkflow, /npm audit --audit-level=high/);
  assert.match(releaseWorkflow, /npm test/);
  assert.match(releaseWorkflow, /npm run test:iseol-user-product/);
});

test("release workflow verifies the compose health boundary before publishing", async () => {
  const releaseWorkflow = await readFile(".github/workflows/release.yml", "utf8");
  const smoke = await readFile("scripts/docker-release-smoke.mjs", "utf8");
  assert.match(releaseWorkflow, /npm run smoke:docker-release/);
  assert.match(smoke, /docker compose/);
  assert.match(smoke, /\["inspect"/);
  assert.match(smoke, /healthy/);
  assert.match(smoke, /"down", "--volumes"/);
});

test("release readiness script checks required artifacts and forbidden tracked secrets", async () => {
  const script = await readFile("scripts/check-release-readiness.mjs", "utf8");
  assert.match(script, /LICENSE/);
  assert.match(script, /AGPL-3\.0/);
  assert.match(script, /DISCORD_TOKEN|GITHUB_TOKEN/);
  assert.match(script, /Broadcast Room|방송실/);
});
