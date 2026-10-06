import assert from "node:assert/strict";
import test from "node:test";
import type { PrototypeProduction } from "../src/idea-lab/contracts.js";
import {
  createVercelPrototypeDeployAdapter,
  resolveVercelPrototypeDeployAdapter,
} from "../src/idea-lab/vercel-deploy-adapter.js";
import { deployPrototypeProduction } from "../src/idea-lab/production-service.js";

const NOW = "2026-09-08T12:00:00.000Z";
const COMMIT = "a".repeat(40);
const KEY = `prototype:camp-1:prod-1:${COMMIT}`;

function production(): PrototypeProduction {
  return {
    version: 1,
    id: "prod-1",
    campaignId: "camp-1",
    proposalId: "proposal-1",
    runId: "run-1",
    repositoryUrl: "https://github.com/acme/prototype.git",
    sandboxRoot: "C:/sandbox",
    worktreeRoot: "C:/sandbox/worktrees/prod-1",
    branch: "idea/camp-1/prod-1",
    baseRef: "main",
    commitSha: COMMIT,
    status: "deploying",
    createdAt: NOW,
    updatedAt: NOW,
  };
}

test("Vercel deployment rejects unsafe repository identities before provider mutation", async () => {
  let fetchCalls = 0;
  const adapter = createVercelPrototypeDeployAdapter({
    token: "vercel-token",
    projectId: "prj_test",
    fetch: async () => {
      fetchCalls += 1;
      return Response.json({ id: "unexpected", url: "unexpected.vercel.app" });
    },
  });
  const base = {
    key: KEY,
    campaignId: "camp-1",
    productionId: "prod-1",
    branch: "idea/camp-1/prod-1",
    commitSha: COMMIT,
  };

  for (const repositoryUrl of [
    "https://user:password@github.com/acme/prototype.git",
    "https://github.com:444/acme/prototype.git",
    "https://github.com/acme/./prototype.git",
    "https://github.com/acme/prototype.git/extra",
    "https://github.com/acme/prototype?",
    "https://github.com/acme/prototype%5C.git",
    "https://github.com/acme//prototype",
    "https://github.com/acme/.git",
  ]) {
    await assert.rejects(
      () => adapter.deploy({ ...base, repositoryUrl }),
      /GitHub repository|GitHub 저장소/,
    );
  }
  assert.equal(fetchCalls, 0);
});

test("Vercel deployment rejects unsafe provider URLs before returning a receipt", async () => {
  for (const responseUrl of [
    "preview.vercel.app?access_token=secret-value",
    "https://preview.vercel.app/#oauth_token=secret-value",
    "javascript:alert(1)",
    "//attacker.example/preview",
    "https:/evil",
    "file:/C:/secret.txt",
    "https://preview.vercel.app/%ZZ",
  ]) {
    const adapter = createVercelPrototypeDeployAdapter({
      token: "vercel-token",
      projectId: "prj_test",
      fetch: async () => Response.json({ id: "dpl_unsafe", url: responseUrl }),
    });
    await assert.rejects(
      () => adapter.deploy({
        key: KEY,
        campaignId: "camp-1",
        productionId: "prod-1",
        branch: "idea/camp-1/prod-1",
        commitSha: COMMIT,
        repositoryUrl: "https://github.com/acme/prototype.git",
      }),
      /URL|credential|deployment/i,
      responseUrl,
    );
  }
});

test("Vercel reconciliation and verification reject unsafe repository identities before provider reads", async () => {
  let fetchCalls = 0;
  const adapter = createVercelPrototypeDeployAdapter({
    token: "vercel-token",
    projectId: "prj_test",
    fetch: async () => {
      fetchCalls += 1;
      return Response.json({ deployments: [] });
    },
  });
  const input = {
    key: KEY,
    campaignId: "camp-1",
    productionId: "prod-1",
    branch: "idea/camp-1/prod-1",
    commitSha: COMMIT,
    repositoryUrl: "https://github.com/acme/prototype%5C.git",
  };
  await assert.rejects(
    () => adapter.reconcile(input),
    /GitHub repository|GitHub 저장소/,
  );
  await assert.rejects(
    () => adapter.verify({
      ...input,
      deployment: {
        provider: "vercel",
        deploymentId: "dpl_1",
        url: "https://prototype.vercel.app",
        commitSha: COMMIT,
        deployedAt: NOW,
      },
    }),
    /GitHub repository|GitHub 저장소/,
  );
  assert.equal(fetchCalls, 0);
});

test("Vercel deployment preserves uppercase HTTPS GitHub URL compatibility", async () => {
  let requestBody: any;
  const adapter = createVercelPrototypeDeployAdapter({
    token: "vercel-token",
    projectId: "prj_test",
    fetch: async (_input, init) => {
      requestBody = JSON.parse(String(init?.body));
      return Response.json({ id: "dpl_upper", url: "upper.vercel.app", createdAt: Date.parse(NOW) });
    },
    now: () => NOW,
  });
  const deployed = await adapter.deploy({
    key: KEY,
    campaignId: "camp-1",
    productionId: "prod-1",
    branch: "idea/camp-1/prod-1",
    commitSha: COMMIT,
    repositoryUrl: "HTTPS://github.com/acme/prototype.GIT",
  });
  assert.equal(requestBody.gitSource.org, "acme");
  assert.equal(requestBody.gitSource.repo, "prototype");
  assert.equal(deployed.deploymentId, "dpl_upper");
});

test("lost Vercel create response reconciles by stable deployment metadata", async () => {
  const deployments: any[] = [];
  let createCalls = 0;
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = new URL(String(input));
    if (init?.method === "POST" && url.pathname === "/v13/deployments") {
      createCalls += 1;
      const body = JSON.parse(String(init.body));
      assert.equal(body.project, "prj_test");
      assert.equal(body.target, "preview");
      assert.equal(body.meta.iseolDeploymentKey, KEY);
      assert.equal(body.gitSource.org, "acme");
      assert.equal(body.gitSource.repo, "prototype");
      assert.equal(body.gitSource.sha, COMMIT);
      deployments.push({
        uid: "dpl_1", url: "prod-1.vercel.app", state: "BUILDING", createdAt: Date.parse(NOW),
        meta: body.meta,
      });
      throw new TypeError("simulated response loss");
    }
    if (url.pathname === "/v6/deployments") {
      assert.equal(url.searchParams.get("projectId"), "prj_test");
      assert.equal(url.searchParams.get("meta-iseolDeploymentKey"), null);
      return Response.json({ deployments });
    }
    throw new Error(`unexpected request ${url}`);
  };
  const adapter = createVercelPrototypeDeployAdapter({
    token: "vercel-token",
    projectId: "prj_test",
    teamId: "team_test",
    fetch: fetchImpl,
    now: () => NOW,  });
  await assert.rejects(() => deployPrototypeProduction(production(), adapter), /response loss/i);
  const recovered = await deployPrototypeProduction(production(), adapter);
  assert.equal(createCalls, 1);
  assert.equal(recovered.provider, "vercel");
  assert.equal(recovered.deploymentId, "dpl_1");
  assert.equal(recovered.url, "https://prod-1.vercel.app");
  assert.equal(recovered.commitSha, COMMIT);
});

test("Vercel verification requires READY provider state and exact Iseol identity", async () => {
  let state = "READY";
  const fetchImpl: typeof fetch = async (input) => {
    const url = new URL(String(input));
    assert.equal(url.pathname, "/v13/deployments/dpl_1");
    return Response.json({
      id: "dpl_1", url: "prod-1.vercel.app", readyState: state, createdAt: Date.parse(NOW),
      meta: { iseolDeploymentKey: KEY, iseolCommitSha: COMMIT, iseolProductionId: "prod-1" },
    });
  };
  const adapter = createVercelPrototypeDeployAdapter({
    token: "vercel-token",
    projectId: "prj_test",
    fetch: fetchImpl,
    now: () => NOW,  });
  const deployment = {
    provider: "vercel", deploymentId: "dpl_1", url: "https://prod-1.vercel.app",
    commitSha: COMMIT, deployedAt: NOW,
  };
  const verified = await adapter.verify({
    key: KEY, campaignId: "camp-1", productionId: "prod-1",
    repositoryUrl: "https://github.com/acme/prototype.git", branch: "idea/camp-1/prod-1",
    commitSha: COMMIT, deployment,
  });
  assert.equal(verified.verifiedAt, NOW);
  state = "ERROR";
  await assert.rejects(() => adapter.verify({
    key: KEY, campaignId: "camp-1", productionId: "prod-1",
    repositoryUrl: "https://github.com/acme/prototype.git", branch: "idea/camp-1/prod-1",
    commitSha: COMMIT, deployment,
  }), /not ready.*ERROR/i);
});

test("Vercel adapter resolver is fail-closed when credentials are incomplete", () => {
  assert.equal(resolveVercelPrototypeDeployAdapter({}), null);
  assert.equal(resolveVercelPrototypeDeployAdapter({ VERCEL_TOKEN: "token" }), null);
  const resolved = resolveVercelPrototypeDeployAdapter({
    VERCEL_TOKEN: "token",
    ISEOL_VERCEL_PROJECT_ID: "prj_test",  });
  assert.ok(resolved);
});

test("Vercel reconciliation follows pagination before creating another deployment", async () => {
  let listCalls = 0;
  let createCalls = 0;
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = new URL(String(input));
    if (url.pathname === "/v6/deployments") {
      listCalls += 1;
      assert.equal(url.searchParams.get("projectId"), "prj_test");
      assert.equal(url.searchParams.get("sha"), COMMIT);
      if (listCalls === 1) {
        assert.equal(url.searchParams.get("until"), null);
        return Response.json({
          deployments: Array.from({ length: 100 }, (_, index) => ({
            uid: `other-${index}`, url: `other-${index}.vercel.app`, createdAt: 2_000 - index,
            meta: { iseolDeploymentKey: `other-${index}` },
          })),
          pagination: { count: 100, next: 1_000, prev: 2_000 },
        });
      }
      assert.equal(url.searchParams.get("until"), "1000");
      return Response.json({
        deployments: [{
          uid: "dpl_old", url: "old.vercel.app", createdAt: 900,
          meta: { iseolDeploymentKey: KEY, iseolProductionId: "prod-1", iseolCommitSha: COMMIT },
        }],
        pagination: { count: 1, next: 800, prev: 1_000 },
      });
    }
    if (init?.method === "POST") {
      createCalls += 1;
      return Response.json({
        uid: "dpl_duplicate", url: "duplicate.vercel.app", createdAt: Date.parse(NOW),
        meta: { iseolDeploymentKey: KEY, iseolProductionId: "prod-1", iseolCommitSha: COMMIT },
      });
    }
    throw new Error(`unexpected request ${url}`);
  };
  const adapter = createVercelPrototypeDeployAdapter({
    token: "vercel-token",
    projectId: "prj_test",
    fetch: fetchImpl,
    now: () => NOW,
  });
  const recovered = await deployPrototypeProduction(production(), adapter);
  assert.equal(listCalls, 2);
  assert.equal(createCalls, 0);
  assert.equal(recovered.deploymentId, "dpl_old");
  assert.equal(recovered.commitSha, COMMIT);
});
