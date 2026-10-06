import assert from "node:assert/strict";
import test from "node:test";
import { access, readFile, writeFile, mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { AddressInfo } from "node:net";
import { loadRuntimeHostConfig } from "../scripts/iseol-runtime-host.js";
import { resolveWebControlPlaneConfig, startWebControlPlaneServer } from "../src/web-control-plane/server.js";
import { routeWebControlPlaneRequest } from "../src/web-control-plane/router.js";
import { buildIdeaLabView } from "../src/web-control-plane/view-model.js";
import { loadProjectWorkspace, listProjectWorkspaces } from "../src/project-model/workspace-store.js";
import { loadProjectHistory } from "../src/project-model/history-store.js";
import { loadPrototypeCandidate } from "../src/project-model/prototype-store.js";
import { at, readModelFixture } from "./support/read-model-fixture.js";

test("legacy host Idea root resolves the existing campaign layout through the web config without creating nested data", async () => {
  const f = await readModelFixture();
  const before = await readFile(f.hostFile, "utf8");
  const config = loadRuntimeHostConfig(f.hostFile);
  const web = resolveWebControlPlaneConfig({ ISEOL_MODEL_ROOT: config.modelRoot, ISEOL_RUN_ROOT: config.runRoot });
  const view = await buildIdeaLabView(web.modelRoot, web.harnessRoot);
  assert.deepEqual(view.campaigns.map(x => x.id), ["campaign-fixture"]);
  assert.equal(view.productions[0]?.run?.status, "WAITING_EXTERNAL");
  assert.equal(view.prototypes[0]?.id, "prototype-ready");
  assert.equal(config.modelRoot, f.dataRoot);
  assert.equal(await readFile(f.hostFile, "utf8"), before);
  await assert.rejects(access(join(f.dataRoot, "idea-lab", "idea-lab")));
});

test("host does not guess between nested and canonical model data or rewrite custom roots", async () => {
  const f = await readModelFixture();
  await mkdir(join(f.dataRoot, "idea-lab", "idea-lab", "campaigns"), { recursive: true });
  assert.throws(() => loadRuntimeHostConfig(f.hostFile), /Ambiguous legacy modelRoot/);
  const raw = JSON.parse(await readFile(f.hostFile, "utf8"));
  raw.modelRoot = join(f.root, "custom-model");
  await writeFile(f.hostFile, JSON.stringify(raw));
  assert.equal(loadRuntimeHostConfig(f.hostFile).modelRoot, raw.modelRoot);
});

test("project list reads independent workspaces and protects list and detail with the configured bearer", async t => {
  const f = await readModelFixture();
  let enqueues = 0;
  const server = await startWebControlPlaneServer({ ...f, host: "127.0.0.1", port: 0, token: "fixture-token", webRoot: resolve("web"),
    ideaLabRuntime: { state: "ready", enqueue: () => { enqueues++; } } });
  t.after(() => new Promise<void>(done => { server.close(() => done()); server.closeAllConnections(); }));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  for (const path of ["/api/projects", "/api/projects/workspace-existing"]) {
    assert.equal((await fetch(url + path)).status, 401);
    assert.equal((await fetch(url + path, { headers: { Authorization: "Bearer wrong" } })).status, 401);
  }
  const headers = { Authorization: "Bearer fixture-token" };
  const response = await fetch(url + "/api/projects", { headers });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { projects: [{ id: "workspace-existing", name: "Existing workspace", status: "active", createdAt: at, updatedAt: at }] });
  assert.equal((await fetch(url + "/api/projects/workspace-existing", { headers })).status, 200);
  assert.equal((await fetch(url + "/api/projects/missing", { headers })).status, 404);
  assert.equal((await fetch(url + "/api/projects/%2E%2E%2Fescape", { headers })).status, 404);
  assert.equal(enqueues, 0);
  const empty = await routeWebControlPlaneRequest({ method: "GET", path: "/api/projects", headers: {} }, { ...f, projectModelRoot: join(f.root, "empty") });
  assert.deepEqual(empty.body, { projects: [] });
  await writeFile(join(f.projectModelRoot, "projects", "workspace-existing", "project.json"), "invalid-json");
  assert.equal((await fetch(url + "/api/projects", { headers })).status, 500);
});

test("promotion across roots writes the workspace and history where list/detail read and retains source evidence on repeat", async () => {
  const f = await readModelFixture();
  const deps = { ...f, token: "fixture-token", now: () => at };
  const headers = { authorization: "Bearer fixture-token" };
  const sourceRun = await readFile(join(f.harnessRoot, "run-ready", "run.json"), "utf8");
  const request = { method: "POST", path: "/api/prototypes/prototype-ready/promote", headers, body: {} };
  const first = await routeWebControlPlaneRequest(request, deps);
  assert.equal(first.status, 200);
  const workspace = await loadProjectWorkspace(f.projectModelRoot, "project-prototype-ready");
  assert.ok(workspace, "promoted workspace must be saved in Project model root");
  assert.equal(await loadProjectWorkspace(f.modelRoot, workspace.id), null);
  assert.equal(workspace.genesis.ideaLabOrigin?.campaignId, "campaign-fixture");
  assert.equal(workspace.genesis.runs[0]?.evidence[0]?.id, "fixture-evidence");
  const detail = await routeWebControlPlaneRequest({ method: "GET", path: `/api/projects/${workspace.id}`, headers }, deps);
  assert.equal(detail.status, 200);
  const second = await routeWebControlPlaneRequest(request, deps);
  assert.deepEqual(second, first);
  const list = await routeWebControlPlaneRequest({ method: "GET", path: "/api/projects", headers }, deps);
  assert.equal((list.body as any).projects.filter((p: any) => p.id === workspace.id).length, 1);
  assert.equal((await listProjectWorkspaces(f.projectModelRoot)).length, 2);
  assert.equal((await loadProjectHistory(f.projectModelRoot, workspace.id)).filter(e => e.type === "project-promoted").length, 1);
  assert.equal((await loadPrototypeCandidate(f.modelRoot, "prototype-ready"))?.promotedProjectId, workspace.id);
  assert.equal(await readFile(join(f.harnessRoot, "run-ready", "run.json"), "utf8"), sourceRun);
});

test("concurrent promotions do not duplicate history and a promoted candidate cannot be recreated in a different root", async () => {
  const f = await readModelFixture();
  const request = { method: "POST", path: "/api/prototypes/prototype-ready/promote", headers: {}, body: {} };
  const deps = { ...f, now: () => at };
  const results = await Promise.all([routeWebControlPlaneRequest(request, deps), routeWebControlPlaneRequest(request, deps)]);
  assert.ok(results.some(result => result.status === 200));
  assert.ok(results.every(result => result.status === 200 || result.status === 409));
  assert.equal((await loadProjectHistory(f.projectModelRoot, "project-prototype-ready")).filter(e => e.type === "project-promoted").length, 1);
  const wrongRoot = join(f.root, "other-projects");
  const redirected = await routeWebControlPlaneRequest(request, { ...deps, projectModelRoot: wrongRoot });
  assert.equal(redirected.status, 409);
  assert.equal(await loadProjectWorkspace(wrongRoot, "project-prototype-ready"), null);
});
