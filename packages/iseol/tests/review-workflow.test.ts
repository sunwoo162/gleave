import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_ISEOL_COLLECTOR_REF,
  ISEOL_REVIEW_WORKFLOW_PATH,
  renderIseolReviewWorkflow,
} from "../src/services/review/review-workflow.js";

test("private review workflow is self-hosted, fork-safe, and uploads the normalized artifact", () => {
  const yaml = renderIseolReviewWorkflow("abc123", "self-hosted");
  assert.equal(ISEOL_REVIEW_WORKFLOW_PATH, ".github/workflows/iseol-code-review.yml");
  assert.match(yaml, /name: Iseol Code Review/);
  assert.match(yaml, /pull_request:/);
  assert.match(yaml, /types: \[opened, reopened, synchronize\]/);
  assert.match(yaml, /runs-on: \[self-hosted, linux, x64, iseol-review\]/);
  assert.match(yaml, /github\.event\.pull_request\.head\.repo\.full_name == github\.repository/);
  assert.match(yaml, /contents: read/);
  assert.doesNotMatch(yaml, /contents: write/);
  assert.match(yaml, /sunwoo162\/iseol-bot\/abc123\/scripts\/iseol-review-collector\.mjs/);
  assert.match(yaml, /ISEOL_PR_NUMBER:/);
  assert.match(yaml, /ISEOL_HEAD_SHA:/);
  assert.match(yaml, /name: iseol-review-findings/);
  assert.match(yaml, /path: \.iseol\/review\/iseol-review\.json/);
  assert.match(yaml, /if: always\(\)/);
});

test("public review workflow uses the free GitHub-hosted runner", () => {
  const yaml = renderIseolReviewWorkflow("abc123", "github-hosted");
  assert.match(yaml, /runs-on: ubuntu-latest/);
  assert.doesNotMatch(yaml, /runs-on: \[self-hosted/);
});

test("default collector ref is pinned to an immutable commit", () => {
  assert.match(DEFAULT_ISEOL_COLLECTOR_REF, /^[0-9a-f]{40}$/);
  const yaml = renderIseolReviewWorkflow();
  assert.match(yaml, new RegExp(`/iseol-bot/${DEFAULT_ISEOL_COLLECTOR_REF}/scripts/iseol-review-collector\\.mjs`));
});
