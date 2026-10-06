import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  ISEOL_IDEA_LAB_VERSION,
  assertIdeaLabCampaign,
  assertIdeaLabId,
  assertIdeaProposal,
  assertPrototypeProduction,
  type IdeaLabCampaign,
  type IdeaLabCampaignEvent,
  type IdeaProposal,
  type PrototypeProduction,
} from "../src/idea-lab/contracts.js";
import {
  listIdeaLabCampaigns,
  loadIdeaLabCampaign,
  saveIdeaLabCampaign,
} from "../src/idea-lab/campaign-store.js";
import { withDurableIdeaLabCampaignLock } from "../src/idea-lab/campaign-lock.js";
import { withDurableIdeaLabCampaignEventLock } from "../src/idea-lab/event-lock.js";
import { loadIdeaProposal, saveIdeaProposal } from "../src/idea-lab/proposal-store.js";
import { withDurableIdeaLabProposalLock } from "../src/idea-lab/proposal-lock.js";
import {
  listPrototypeProductions,
  loadPrototypeProduction,
  savePrototypeProduction,
} from "../src/idea-lab/production-store.js";
import {
  appendIdeaLabCampaignEventOnce,
  listIdeaLabCampaignEvents,
} from "../src/idea-lab/event-store.js";
import { withDurableIdeaLabProductionLock } from "../src/idea-lab/production-lock.js";

const NOW = "2026-09-08T12:00:00.000Z";
function campaign(id = "camp-1"): IdeaLabCampaign {
  return {
    version: 1,
    id,
    seed: "student focus tools",
    constraints: ["web only"],
    targetReadyCount: 3,
    productionConcurrency: 1,
    proposalIds: [],
    productionIds: [],
    status: "generating",
    createdAt: NOW,
    updatedAt: NOW,
  };
}

function proposal(id = "prop-1"): IdeaProposal {
  return {
    version: 1,
    id,
    campaignId: "camp-1",
    title: "Focus Loop",
    concept: "Plan and review focus sessions",
    problemDomain: "study planning",
    targetUser: "high school students",
    jobToBeDone: "plan focused study blocks",
    coreInteractionLoop: "plan -> focus -> review",
    dataModel: "sessions and reflections",
    primaryDifferentiator: "adaptive review",
    whyMateriallyDifferent: "Centers on reflection instead of a task list",
    status: "accepted",
    createdAt: NOW,
  };
}
function production(id = "prod-1"): PrototypeProduction {
  return {
    version: 1,
    id,
    campaignId: "camp-1",
    proposalId: "prop-1",
    runId: `run-${id}`,
    repositoryUrl: "https://example.test/ideas.git",
    sandboxRoot: "C:/sandbox",
    worktreeRoot: `C:/sandbox/${id}`,
    branch: `idea/camp-1/${id}`,
    baseRef: "main",
    status: "queued",
    createdAt: NOW,
    updatedAt: NOW,
  };
}

async function withRoot(fn: (root: string) => Promise<void>): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), "iseol-idea-lab-"));
  try { await fn(root); } finally { await rm(root, { recursive: true, force: true }); }
}

test("idea lab contract version and ids fail closed", () => {
  assert.equal(ISEOL_IDEA_LAB_VERSION, 1);
  for (const bad of ["", "../escape", "a/b", "a\\b", ".hidden"]) {
    assert.throws(() => assertIdeaLabId(bad));
  }
  assert.doesNotThrow(() => assertIdeaLabId("camp-abc_123"));
});

test("campaign proposal and production contracts reject unknown credential-shaped fields", () => {
  assert.doesNotThrow(() => assertIdeaLabCampaign(campaign()));
  assert.doesNotThrow(() => assertIdeaProposal(proposal()));
  assert.doesNotThrow(() => assertPrototypeProduction(production()));
  assert.throws(() => assertIdeaLabCampaign({ ...campaign(), token: "secret" }));
  assert.throws(() => assertIdeaProposal({ ...proposal(), reasoning: "hidden" }));
  assert.throws(() => assertPrototypeProduction({ ...production(), cookie: "secret" }));
});
test("campaign proposal and production stores round trip and list deterministically", async () => {
  await withRoot(async (root) => {
    await saveIdeaLabCampaign(root, campaign("camp-b"));
    await saveIdeaLabCampaign(root, { ...campaign("camp-a"), createdAt: "2026-09-08T11:00:00.000Z" });
    assert.equal((await loadIdeaLabCampaign(root, "camp-b"))?.id, "camp-b");
    assert.equal(await loadIdeaLabCampaign(root, "missing"), null);
    assert.deepEqual((await listIdeaLabCampaigns(root)).map((item) => item.id), ["camp-a", "camp-b"]);

    await saveIdeaProposal(root, proposal("prop-1"));
    assert.equal((await loadIdeaProposal(root, "prop-1"))?.title, "Focus Loop");
    assert.equal(await loadIdeaProposal(root, "missing"), null);

    await savePrototypeProduction(root, production("prod-b"));
    await savePrototypeProduction(root, { ...production("prod-a"), createdAt: "2026-09-08T10:00:00.000Z" });
    assert.equal((await loadPrototypeProduction(root, "prod-b"))?.runId, "run-prod-b");
    assert.deepEqual((await listPrototypeProductions(root)).map((item) => item.id), ["prod-a", "prod-b"]);
  });
});

test("proposal reads wait for the durable proposal lock", async () => {
  await withRoot(async (root) => {
    const item = proposal();
    await saveIdeaProposal(root, item);
    let releaseHolder!: () => void;
    const holderStarted = new Promise<void>((resolve) => {
      void withDurableIdeaLabProposalLock(root, item.id, async () => {
        resolve();
        await new Promise<void>((release) => { releaseHolder = release; });
      });
    });
    await holderStarted;

    let settled = false;
    const reading = loadIdeaProposal(root, item.id).then((value) => {
      settled = true;
      return value;
    });
    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.equal(settled, false);

    releaseHolder();
    assert.equal((await reading)?.id, item.id);
  });
});

test("production listing waits for each durable production lock", async () => {
  await withRoot(async (root) => {
    const item = production();
    await savePrototypeProduction(root, item);
    let releaseHolder!: () => void;
    const holderStarted = new Promise<void>((resolve) => {
      void withDurableIdeaLabProductionLock(root, item.id, async () => {
        resolve();
        await new Promise<void>((release) => { releaseHolder = release; });
      });
    });
    await holderStarted;

    let settled = false;
    const listing = listPrototypeProductions(root).then((value) => {
      settled = true;
      return value;
    });
    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.equal(settled, false);

    releaseHolder();
    assert.deepEqual((await listing).map((value) => value.id), [item.id]);
  });
});

test("production reads wait for the durable production lock", async () => {
  await withRoot(async (root) => {
    const item = production();
    await savePrototypeProduction(root, item);
    let releaseHolder!: () => void;
    const holderStarted = new Promise<void>((resolve) => {
      void withDurableIdeaLabProductionLock(root, item.id, async () => {
        resolve();
        await new Promise<void>((release) => { releaseHolder = release; });
      });
    });
    await holderStarted;

    let settled = false;
    const reading = loadPrototypeProduction(root, item.id).then((value) => {
      settled = true;
      return value;
    });
    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.equal(settled, false);

    releaseHolder();
    assert.equal((await reading)?.id, item.id);
  });
});

test("production writes wait for the durable production lock", async () => {
  await withRoot(async (root) => {
    const item = production();
    await savePrototypeProduction(root, item);
    let releaseHolder!: () => void;
    const holderStarted = new Promise<void>((resolve) => {
      void withDurableIdeaLabProductionLock(root, item.id, async () => {
        resolve();
        await new Promise<void>((release) => { releaseHolder = release; });
      });
    });
    await holderStarted;

    let settled = false;
    const writing = savePrototypeProduction(root, { ...item, status: "running" }).then(() => {
      settled = true;
    });
    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.equal(settled, false);

    releaseHolder();
    await writing;
    assert.equal((await loadPrototypeProduction(root, item.id))?.status, "running");
  });
});

test("campaign listing waits for each durable campaign lock", async () => {
  await withRoot(async (root) => {
    const item = campaign();
    await saveIdeaLabCampaign(root, item);
    let releaseHolder!: () => void;
    const holderStarted = new Promise<void>((resolve) => {
      void withDurableIdeaLabCampaignLock(root, item.id, async () => {
        resolve();
        await new Promise<void>((release) => { releaseHolder = release; });
      });
    });
    await holderStarted;

    let settled = false;
    const listing = listIdeaLabCampaigns(root).then((value) => {
      settled = true;
      return value;
    });
    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.equal(settled, false);

    releaseHolder();
    assert.deepEqual((await listing).map((value) => value.id), [item.id]);
  });
});

test("campaign reads wait for the durable campaign lock", async () => {
  await withRoot(async (root) => {
    const item = campaign();
    await saveIdeaLabCampaign(root, item);
    let releaseHolder!: () => void;
    const holderStarted = new Promise<void>((resolve) => {
      void withDurableIdeaLabCampaignLock(root, item.id, async () => {
        resolve();
        await new Promise<void>((release) => { releaseHolder = release; });
      });
    });
    await holderStarted;

    let settled = false;
    const reading = loadIdeaLabCampaign(root, item.id).then((value) => {
      settled = true;
      return value;
    });
    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.equal(settled, false);

    releaseHolder();
    assert.equal((await reading)?.id, item.id);
  });
});

test("campaign writes wait for the durable campaign lock", async () => {
  await withRoot(async (root) => {
    const item = campaign();
    await saveIdeaLabCampaign(root, item);
    let releaseHolder!: () => void;
    const holderStarted = new Promise<void>((resolve) => {
      void withDurableIdeaLabCampaignLock(root, item.id, async () => {
        resolve();
        await new Promise<void>((release) => { releaseHolder = release; });
      });
    });
    await holderStarted;

    let settled = false;
    const writing = saveIdeaLabCampaign(root, { ...item, status: "producing" }).then(() => {
      settled = true;
    });
    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.equal(settled, false);

    releaseHolder();
    await writing;
    assert.equal((await loadIdeaLabCampaign(root, item.id))?.status, "producing");
  });
});

test("campaign events append once by semantic identity and reject conflicting reuse", async () => {
  await withRoot(async (root) => {
    const event: IdeaLabCampaignEvent = {
      version: 1,
      id: "evt-1",
      campaignId: "camp-1",
      type: "campaign-created",
      at: NOW,
      summary: "Created campaign",
    };
    assert.equal(await appendIdeaLabCampaignEventOnce(root, event), true);
    assert.equal(await appendIdeaLabCampaignEventOnce(root, { ...event, at: "2026-09-08T12:01:00.000Z" }), false);
    assert.deepEqual((await listIdeaLabCampaignEvents(root, "camp-1")).map((item) => item.id), ["evt-1"]);
    await assert.rejects(
      () => appendIdeaLabCampaignEventOnce(root, { ...event, type: "campaign-blocked", summary: "Blocked" }),
      /identity mismatch/i,
    );
  });
});

test("concurrent identical campaign event append-once calls remain one event", async () => {
  await withRoot(async (root) => {
    const event: IdeaLabCampaignEvent = {
      version: 1,
      id: "evt-concurrent",
      campaignId: "camp-1",
      type: "campaign-created",
      at: NOW,
      summary: "Created campaign",
    };
    const results = await Promise.all([
      appendIdeaLabCampaignEventOnce(root, event),
      appendIdeaLabCampaignEventOnce(root, event),
    ]);
    assert.deepEqual(results.sort(), [false, true]);
    assert.deepEqual(await listIdeaLabCampaignEvents(root, event.campaignId), [event]);
  });
});

test("campaign event listing waits for the durable event lock", async () => {
  await withRoot(async (root) => {
    const event: IdeaLabCampaignEvent = {
      version: 1,
      id: "evt-list-lock",
      campaignId: "camp-1",
      type: "campaign-created",
      at: NOW,
      summary: "Created campaign",
    };
    await appendIdeaLabCampaignEventOnce(root, event);
    let releaseHolder!: () => void;
    const holderStarted = new Promise<void>((resolve) => {
      void withDurableIdeaLabCampaignEventLock(root, event.campaignId, async () => {
        resolve();
        await new Promise<void>((release) => { releaseHolder = release; });
      });
    });
    await holderStarted;

    let settled = false;
    const listing = listIdeaLabCampaignEvents(root, event.campaignId).then((value) => {
      settled = true;
      return value;
    });
    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.equal(settled, false);

    releaseHolder();
    assert.deepEqual(await listing, [event]);
  });
});
