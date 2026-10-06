import assert from "node:assert/strict";
import test from "node:test";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import type { AddressInfo } from "node:net";
import { chromium } from "playwright-core";
import { startWebControlPlaneServer } from "../src/web-control-plane/server.js";
import { loadHarnessRun, requestHarnessRunRetry, saveHarnessRun } from "../src/harness/run-store.js";
import { updateProjectWorkRequest } from "../src/project-model/work-request.js";
import { readModelFixture } from "./support/read-model-fixture.js";

test("authenticated browser selects an existing workspace, promotes across roots, returns to selections, and distinguishes list errors", async t => {
  const executablePath = process.env.ISEOL_TEST_BROWSER ?? [
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  ].find(existsSync);
  assert.ok(executablePath, "Set ISEOL_TEST_BROWSER to an installed test browser; no production profile is used");
  const f = await readModelFixture();
  const server = await startWebControlPlaneServer({ ...f, host: "127.0.0.1", port: 0, token: "synthetic-browser-token", webRoot: resolve("web") });
  t.after(() => new Promise<void>(done => { server.close(() => done()); server.closeAllConnections(); }));
  const browser = await chromium.launch({ executablePath, headless: true });
  t.after(() => browser.close());
  const context = await browser.newContext({ viewport: { width: 1100, height: 820 } });
  const page = await context.newPage();
  // Only synthetic local requests: never open the example preview or external accounts.
  await context.route("**/*", route => new URL(route.request().url()).hostname === "127.0.0.1" ? route.continue() : route.abort());
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  await page.goto(base);
  await page.evaluate(() => {
    localStorage.setItem("iseol.web.token", "legacy-web-token");
    localStorage.setItem("iseol.operator.token", "legacy-operator-token");
  });
  await page.reload();
  assert.equal(await page.locator("#web-token").inputValue(), "");
  assert.equal(await page.locator("#operator-token").inputValue(), "");
  assert.equal(await page.evaluate(() => localStorage.getItem("iseol.web.token")), null);
  assert.equal(await page.evaluate(() => localStorage.getItem("iseol.operator.token")), null);
  await page.locator("#web-token").fill("synthetic-browser-token");
  await page.locator("#save-token").click();
  const listResponse = page.waitForResponse(r => r.url() === base + "/api/projects");
  await page.locator('[data-mode="project-workspace"]').click();
  assert.equal((await listResponse).status(), 200);
  await page.waitForFunction(() => Array.from(document.querySelectorAll<HTMLOptionElement>("#project-select option")).some(x => x.value === "workspace-existing"));
  await page.locator("#project-select").selectOption("workspace-existing");
  await page.waitForFunction(() => document.querySelector("#status-banner")?.textContent?.includes("Project Workspace loaded:"));
  assert.match(await page.locator("#project-content").innerText(), /Existing workspace/);
  await page.locator('[data-mode="idea-lab"]').click();
  await page.getByRole("button", { name: "Open campaign", exact: true }).first().click();
  await page.locator("#campaign-detail-content h3").first().waitFor();
  assert.match(await page.locator("#campaign-detail").innerText(), /WAITING_EXTERNAL/);
  await page.locator("#close-campaign-detail").click();
  await page.getByRole("button", { name: "Details", exact: true }).first().click();
  await page.locator("#prototype-detail-content h3").waitFor();
  assert.match(await page.locator("#prototype-detail").innerText(), /campaign-fixture/);
  await page.locator("#close-prototype-detail").click();
  await page.getByRole("button", { name: "Promote to project", exact: true }).first().click();
  await page.waitForFunction(() => document.querySelector("#status-banner")?.textContent?.includes("Promoted prototype-ready"));
  assert.equal(await page.locator('#project-select option[value="project-prototype-ready"]').count(), 1);
  await page.locator('[data-mode="idea-lab"]').click();
  await page.locator('[data-mode="project-workspace"]').click();
  assert.equal(await page.locator("#project-select").inputValue(), "project-prototype-ready");
  await page.route("**/api/projects", route => route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: "fixture list failure" }) }));
  await page.locator("#refresh-project").click();
  await page.waitForFunction(() => document.querySelector("#project-list-status")?.textContent?.includes("fixture list failure"));
  assert.equal(await page.locator("#project-list-status").getAttribute("data-kind"), "error");
  await page.unroute("**/api/projects");
  await page.locator("#refresh-project").click();
  await page.waitForFunction(() => document.querySelector("#project-list-status")?.getAttribute("data-kind") === "success");
  await page.route("**/api/projects", route => route.fulfill({ status: 200, contentType: "application/json", body: '{"projects":[]}' }));
  await page.route("**/api/idea-lab", route => route.fulfill({ status: 200, contentType: "application/json", body: '{"campaigns":[],"productions":[],"prototypes":[]}' }));
  await page.reload();
  await page.locator('[data-mode="project-workspace"]').click();
  await page.waitForFunction(() => document.querySelector("#project-list-status")?.textContent?.includes("No projects"));
  assert.equal(await page.locator("#project-list-status").getAttribute("data-kind"), "empty");
  await context.clearCookies();
  await page.evaluate(() => sessionStorage.clear());
});

test("operator browser can retry a failed Project Workspace Run with the same durable Run identity", async t => {
  const executablePath = process.env.ISEOL_TEST_BROWSER ?? [
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  ].find(existsSync);
  assert.ok(executablePath, "Set ISEOL_TEST_BROWSER to an installed test browser; no production profile is used");
  const f = await readModelFixture();
  const runId = "run-browser-operator-retry";
  const at = "2026-09-21T00:03:00.000Z";
  const server = await startWebControlPlaneServer({
    ...f,
    host: "127.0.0.1",
    port: 0,
    token: "synthetic-browser-token",
    operatorToken: "synthetic-operator-token",
    webRoot: resolve("web"),
    ideaLabRuntime: {
      state: "ready",
      retryProjectRun: async ({ projectId, runId: requestedRunId }) => {
        if (projectId !== "workspace-existing" || requestedRunId !== runId) return "not-allowed";
        const retry = await requestHarnessRunRetry(f.projectHarnessRoot, requestedRunId, {
          retryReason: "operator-request",
          actor: "operator",
          requestedAt: at,
        });
        return retry.status === "accepted" ? "accepted" : retry.status === "already-active" ? "already-active" : "not-allowed";
      },
    },
  });
  t.after(() => new Promise<void>(done => { server.close(() => done()); server.closeAllConnections(); }));
  await saveHarnessRun(f.projectHarnessRoot, {
    version: 1,
    request: { version: 1, runId, mode: "project-workspace", projectId: "workspace-existing", objective: "Recover browser fixture", targetRoot: "synthetic-only" },
    preflight: { version: 1, runId, status: "ready" },
    state: { version: 1, stage: "IMPLEMENT", status: "FAILED_FINAL", completedStages: ["PREFLIGHT", "CONTEXT"], skippedStages: [], updatedAt: at, reason: "synthetic failure" },
    evidence: [],
    updatedAt: at,
  });
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const queued = await fetch(`${base}/api/projects/workspace-existing/work-requests`, {
    method: "POST",
    headers: { authorization: "Bearer synthetic-browser-token", "content-type": "application/json" },
    body: JSON.stringify({ title: "Retry browser fixture", objective: "Recover browser fixture", idempotencyKey: "browser-operator-retry" }),
  });
  assert.equal(queued.status, 201);
  const workId = ((await queued.json()) as { id: string }).id;
  await updateProjectWorkRequest(f.projectModelRoot, "workspace-existing", workId, {
    status: "failed", runId, requestedRunId: runId, blocker: "synthetic failure",
  }, at);

  const browser = await chromium.launch({ executablePath, headless: true });
  t.after(() => browser.close());
  const context = await browser.newContext({ viewport: { width: 1100, height: 820 } });
  const page = await context.newPage();
  await context.route("**/*", route => new URL(route.request().url()).hostname === "127.0.0.1" ? route.continue() : route.abort());
  page.on("dialog", dialog => dialog.accept());
  await page.goto(base);
  await page.locator("#web-token").fill("synthetic-browser-token");
  await page.locator("#save-token").click();
  await page.locator("#operator-token").fill("synthetic-operator-token");
  await page.locator("#save-operator-token").click();
  const listResponse = page.waitForResponse(r => r.url() === base + "/api/projects");
  await page.locator('[data-mode="project-workspace"]').click();
  assert.equal((await listResponse).status(), 200);
  await page.locator("#project-select").selectOption("workspace-existing");
  await page.getByRole("button", { name: "Retry Run", exact: true }).waitFor();
  await page.getByRole("button", { name: "Retry Run", exact: true }).click();
  await page.waitForFunction(() => document.querySelector("#status-banner")?.textContent?.includes("queued again"));
  await page.waitForFunction(() => document.querySelector("#work-request-list")?.textContent?.includes("running"));
  const run = await loadHarnessRun(f.projectHarnessRoot, runId);
  assert.equal(run?.state.status, "READY");
  assert.equal(run?.retry?.actor, "operator");
  assert.equal(run?.request.runId, runId);
  await context.clearCookies();
  await page.evaluate(() => sessionStorage.clear());
});
