# Free Code Review Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace paid-AI-first PR review with a zero-API-cost GitHub Actions analysis pipeline whose normalized findings are polled and rendered by Iseol as Gemini-style inline GitHub reviews.

**Architecture:** Same-repository PRs run on a trusted self-hosted runner and emit a normalized `iseol-review-findings` artifact. The existing 1-minute Iseol poller locates the completed run for the PR HEAD SHA, downloads the artifact, filters findings to changed RIGHT-side lines, deduplicates/noise-filters them, and posts one compact review plus at most five ordinary inline comments.

**Tech Stack:** TypeScript, Node.js 22, `@octokit/rest`, GitHub Actions, GitHub self-hosted runner, ESLint/TypeScript/npm audit/Knip/dependency-cruiser plus optional Semgrep/Gitleaks/Trivy/OSV-Scanner/actionlint.

**Spec:** `docs/superpowers/specs/2026-09-01-free-code-review-engine-design.md`

## Global Constraints
- No paid LLM/API is required for normal reviews.
- No public inbound webhook port is required.
- Never execute fork PR code on the trusted self-hosted runner.
- Keep repository + PR + HEAD SHA deduplication.
- Inline comments target only changed RIGHT-side lines.
- Filter style-only noise and cap ordinary inline comments at five.
- Analyzer failures must not erase successful findings from other analyzers.

---

### Task 1: CI review contract and aggregation

**Files:**
- Create: `src/services/review/ci-review-types.ts`
- Create: `src/services/review/ci-review-aggregate.ts`
- Test: `tests/ci-review-aggregate.test.ts`
- Modify: `package.json`

**Interfaces:**
- Produces `ciReviewArtifactSchema` and `CiReviewArtifact`.
- Produces `aggregateCiFindings(artifact, changedLines)` returning the existing `ReviewResult` shape.

- [ ] **Step 1: Write failing tests** for schema validation, changed-line filtering, style-noise filtering, duplicate collapse, cross-tool confidence increase, security severity preservation, and five-comment cap.
- [ ] **Step 2: Run `npm test` and verify the new tests fail because implementation does not exist.**
- [ ] **Step 3: Implement the schema and aggregator** using the existing `ReviewFinding`/filtering conventions.
- [ ] **Step 4: Run `npm test` and verify all tests pass.**
- [ ] **Step 5: Commit** `feat: aggregate ci review findings`.

### Task 2: GitHub Actions collector

**Files:**
- Create: `scripts/iseol-review-collector.mjs`
- Create: `tests/iseol-review-collector.test.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes the checked-out PR workspace plus `GITHUB_REPOSITORY`, `ISEOL_PR_NUMBER`, `ISEOL_HEAD_SHA`.
- Produces `.iseol/review/iseol-review.json` matching `CiReviewArtifact`.

- [ ] **Step 1: Write failing tests** around pure exported parsers for ESLint JSON, TypeScript diagnostics, npm audit JSON, Knip text/JSON, dependency-cruiser, Semgrep JSON, Gitleaks JSON, Trivy JSON, OSV JSON, and actionlint text.
- [ ] **Step 2: Verify RED.**
- [ ] **Step 3: Implement collector helpers** so each analyzer is isolated and returns check status + normalized findings; missing optional commands return `skipped`.
- [ ] **Step 4: Implement the collector CLI** to run project-native install/lint/typecheck/test/build where available and analyzers without aborting the whole run after one tool fails.
- [ ] **Step 5: Verify GREEN with `npm test` and `npm run build`.**
- [ ] **Step 6: Commit** `feat: collect free ci review findings`.

### Task 3: Workflow template and repository bootstrap

**Files:**
- Create: `src/services/review/review-workflow.ts`
- Create: `scripts/install-review-workflows.ts`
- Test: `tests/review-workflow.test.ts`
- Modify: `src/services/github.ts`
- Modify: `src/commands/project.ts`
- Modify: `package.json`

**Interfaces:**
- Produces `renderIseolReviewWorkflow(collectorRef)`.
- Adds `GitHubWebhookService.ensureRepositoryFile(repository, path, content, message)` that creates the workflow only when absent.
- `npm run review:install-workflows` bootstraps existing stored projects.

- [ ] **Step 1: Write failing tests** asserting self-hosted labels, fork guard, minimum permissions, artifact upload name, and pull-request triggers.
- [ ] **Step 2: Verify RED.**
- [ ] **Step 3: Implement workflow renderer** using `runs-on: [self-hosted, linux, x64, iseol-review]`, same-repository fork guard, checkout with full enough history, collector download/execution, and unconditional artifact upload.
- [ ] **Step 4: Add GitHub contents API helper** to install the workflow without overwriting an existing user workflow.
- [ ] **Step 5: Hook workflow installation into new project creation** for frontend/backend repositories; installation failure becomes a warning and does not roll back Discord project creation.
- [ ] **Step 6: Add one-shot bootstrap script for existing projects.**
- [ ] **Step 7: Verify tests/build and commit** `feat: install iseol review workflows`.

### Task 4: Poll completed CI artifacts and post reviews

**Files:**
- Create: `src/services/review/github-ci-review.ts`
- Test: `tests/github-ci-review.test.ts`
- Modify: `src/services/github-automation-source.ts`
- Modify: `src/services/github-automation-polling.ts`
- Modify: `src/services/review/github-review.ts`
- Modify: `package.json`

**Interfaces:**
- `GitHubAutomationSource.findIseolReviewRun(repository, headSha)` returns completed/queued/missing run metadata.
- `GitHubAutomationSource.downloadIseolReviewArtifact(repository, runId)` returns parsed artifact bytes/content.
- `GitHubReviewService.postComputedReview(repository, pullNumber, headSha, result)` posts an already-computed `ReviewResult` and marks HEAD reviewed only after success.

- [ ] **Step 1: Write failing tests** for waiting on incomplete runs, ignoring mismatched HEAD SHA/artifact metadata, no duplicate review, changed-line filtering, and successful computed review posting.
- [ ] **Step 2: Verify RED.**
- [ ] **Step 3: Add workflow-run/artifact GitHub API reads.**
- [ ] **Step 4: Reuse existing PR file patches to build the changed-line set, aggregate CI findings, and post the review.**
- [ ] **Step 5: Keep current AI provider method only as optional legacy code; polling default path uses CI artifacts and no AI key.**
- [ ] **Step 6: Verify tests/build and commit** `feat: review pull requests from ci artifacts`.

### Task 5: Remove AI from default runtime/config and add runner setup

**Files:**
- Create: `scripts/setup-review-runner-tools.sh`
- Create: `docs/operations/iseol-review-runner.md`
- Modify: `src/config.ts`
- Modify: `.env.example`
- Modify: `README.md`
- Modify: `src/services/github-automation-polling.ts`
- Modify: `tests/config.test.ts`

**Interfaces:**
- Normal PR review requires only existing GitHub credentials and a registered runner.
- `GEMINI_API_KEY` becomes legacy/optional and is not checked to enable PR review.

- [ ] **Step 1: Write/update failing config/runtime tests** so review polling is enabled without Gemini/Groq/OpenAI keys.
- [ ] **Step 2: Verify RED.**
- [ ] **Step 3: Remove AI-key gating from default PR polling.**
- [ ] **Step 4: Add runner tool setup helper** that validates Node/npm and installs or documents optional scanners; failures are explicit and idempotent.
- [ ] **Step 5: Document one-time GitHub self-hosted runner registration and security rule: same-repository PRs only.**
- [ ] **Step 6: Verify GREEN and commit** `chore: make ci review the default`.

### Task 6: Final verification and deployment preparation

**Files:**
- Modify as needed only for verification fixes.
- Update: `docs/superpowers/specs/2026-09-01-free-code-review-engine-design.md` if implementation differs materially.

- [ ] **Step 1: Run `npm test`. Expected: 0 failures.**
- [ ] **Step 2: Run `npm run build`. Expected: exit 0.**
- [ ] **Step 3: Run `git diff --check`. Expected: no output.**
- [ ] **Step 4: Inspect PR #39 diff and confirm no secrets/workflow tokens are committed.**
- [ ] **Step 5: On production deployment branch, merge the feature branch, repeat tests/build/diff-check, restart PM2, and confirm the 1-minute poller starts without an AI-key warning.**
- [ ] **Step 6: Register the dedicated `iseol-review` self-hosted runner and run `npm run review:install-workflows`.**
- [ ] **Step 7: Open/update one same-repository test PR and verify: Actions run completes, artifact exists, Iseol posts one compact review with changed-line inline comments, repeated polling does not duplicate it.**

## Self-review
- Spec coverage: cost, security, polling, artifacts, inline UX, dedupe, onboarding, failure handling, and runner setup are covered.
- Placeholder scan: no TBD/TODO/implement-later placeholders.
- Type consistency: CI artifact -> aggregator -> existing `ReviewResult` -> `GitHubReviewService` is the single review data path.
