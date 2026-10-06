import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createPortfolioDocument, loadPortfolioDocument, savePortfolioDocument } from "../src/project-model/portfolio-store.js";
import { withDurablePortfolioLock } from "../src/project-model/portfolio-lock.js";

test("portfolio document saves wait for the durable portfolio lock", async () => {
  const root = await mkdtemp(join(tmpdir(), "iseol-project-portfolio-save-lock-"));
  const document = createPortfolioDocument({
    version: 1,
    projectId: "project-portfolio-save-lock",
    generatedAt: "2026-09-30T07:00:00.000Z",
    overview: "Overview",
    features: [],
    technology: [],
    troubleshooting: [],
    claims: [],
    readme: "# Project",
  });
  await savePortfolioDocument(root, document);

  let release!: () => void;
  const holderStarted = new Promise<void>((resolveStarted) => {
    void withDurablePortfolioLock(root, document.projectId, async () => {
      resolveStarted();
      await new Promise<void>((resolveRelease) => { release = resolveRelease; });
    }, { waitForMs: 2_000 });
  });
  await holderStarted;

  let settled = false;
  const saving = savePortfolioDocument(root, { ...document, readme: "# Updated" }).then(() => {
    settled = true;
  });
  await new Promise((resolveWait) => setTimeout(resolveWait, 50));
  assert.equal(settled, false);

  release();
  await saving;
  assert.equal((await loadPortfolioDocument(root, document.projectId))?.readme, "# Updated");
});
