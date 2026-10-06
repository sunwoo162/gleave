# Confidence Semantics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an opt-in, independently calibrated claim-status correctness probability without changing ClaimLatch's deterministic policy gate.

**Architecture:** Keep confidence calculation outside policy evaluation. A `ClaimConfidenceScorer` produces a raw `[0, 1]` score from sanitized claim verification; a validated isotonic `ConfidenceCalibrationProfile` maps it to a claim-level `ClaimConfidence`. Offline calibration code parses independently labelled claim observations, fits the mapping, evaluates it on a disjoint dataset, and the runtime only accepts profiles that carry that provenance.

**Tech Stack:** TypeScript 5.8, Node.js >=20, Node test runner, Node `crypto`/`fs/promises`, existing ESM/NodeNext build, no new runtime dependencies.

**Spec:** `docs/superpowers/specs/2026-09-30-confidence-semantics-design.md`

## Global Constraints

- Confidence means `verification-status-correctness`, not factual truth probability or answer trustworthiness.
- `PASS`/`BLOCK`, policy evaluation, counts, coverage, and proxy behavior remain deterministic and confidence-independent.
- Confidence is claim-level and opt-in; without a scorer and profile, existing report behavior is unchanged.
- Raw scores, mapping thresholds, and calibrated probabilities must be finite numbers in `[0, 1]`.
- The final isotonic mapping threshold is exactly `1`; thresholds are strictly increasing and calibrated probabilities are non-decreasing.
- Profiles are version `1`, target `verification-status-correctness`, method `isotonic`, and must match the configured scorer ID.
- Calibration and independent evaluation datasets require canonical SHA-256 manifests, distinct manifest hashes, and no reused source case/claim pair.
- Brier score and ten-bin equal-width ECE are descriptive metrics, never policy thresholds.
- Invalid profiles, scorer exceptions, and invalid raw scores fail closed when confidence is explicitly configured.
- Existing signed receipt version `1` remains compatible with reports both with and without optional confidence.
- No aggregate confidence proxy header is added.
- Do not add a runtime dependency; use existing TypeScript and Node.js standard-library patterns.
- Follow the repository commit convention: `feat : ...`, `fix : ...`, `refactor : ...`, `test : ...`, `docs : ...`, `chore : ...`.
- Work on a `codex/` branch, run tests/build before each commit, open a PR, review it, merge it, and delete the branch.

## Review Focus

- A scorer returning `NaN`, infinity, or a value outside `[0, 1]` must reject the configured verification rather than silently omit or clamp confidence. Test in Task 2 with `ConfidenceEvaluationError` assertions.
- Raw scores exactly at mapping thresholds, `0`, and `1` must use deterministic first-match step-function behavior. Test in Task 1 with boundary mappings.
- Calibration and evaluation data sharing a manifest, observation ID, or source case/claim pair must be rejected before profile output. Test in Task 3 with overlapping fixtures.
- An old receipt without confidence must remain verifiable, while changing or removing confidence from a signed report must invalidate its signature. Test in Task 4 with both legacy and confidence-bearing reports.
- A gate without confidence configuration must produce the existing report shape and the proxy must not grow a confidence header. Test in Task 2 and Task 4 with a fixture gate and proxy header assertions.

---

### Task 1: Add confidence contracts and pure profile mapping

**Files:**
- Modify: `src/types.ts` — add `ClaimConfidence`, `ClaimConfidenceScorer`, `ClaimVerificationForConfidence`, `ConfidenceCalibrationProfile`, `ConfidenceCalibrationOptions`, `CalibrationObservation`, `CalibrationEvaluation`, and optional `ClaimVerification.confidence`.
- Create: `src/confidence.ts` — validate profiles, apply mappings, and create a claim confidence value.
- Create: `tests/confidence.test.ts` — failing-first tests for profile validation and deterministic mapping.

**Interfaces:**
- Consumes: `Claim`, `ClaimVerification`, `ClaimVerificationForConfidence`, and `VerificationStatus` from `src/types.ts`.
- Produces: `validateConfidenceCalibrationProfile(profile: ConfidenceCalibrationProfile): void`, `applyConfidenceCalibrationProfile(profile: ConfidenceCalibrationProfile, rawScore: number): number`, `createClaimConfidence(input: { scorer: ClaimConfidenceScorer; profile: ConfidenceCalibrationProfile; verification: ClaimVerificationForConfidence }): Promise<ClaimConfidence>`, and `ConfidenceEvaluationError` for Tasks 2 and 4.

- [ ] **Step 1: Write the failing profile-validation and mapping tests**

  Add tests named `confidence profile accepts a valid monotonic step mapping`, `confidence profile rejects malformed hashes and metadata`, `confidence profile rejects unsorted or non-monotonic mappings`, `confidence mapping uses the first threshold at exact boundaries`, and `confidence mapping covers raw score one with the final threshold`. Assert the exact profile values from the spec, including `version: 1`, `target: "verification-status-correctness"`, `method: "isotonic"`, distinct calibration/evaluation hashes, and final `maxRawScore: 1`.

- [ ] **Step 2: Run the focused tests and verify they fail**

  Run: `npm test --silent -- --test-name-pattern="confidence profile|confidence mapping"`

  Expected: FAIL because the confidence types and functions do not exist yet.

- [ ] **Step 3: Implement the public confidence types and pure validation/mapping helpers**

  In `src/types.ts`, make `ClaimConfidence.value` the calibrated `[0, 1]` value and use the literal meaning `"verification-status-correctness"`. Keep profile validation separate from calibration fitting. In `src/confidence.ts`, validate all profile fields and mapping invariants, require lowercase 64-character SHA-256 hashes, require positive integer observation counts, require distinct calibration/evaluation manifest hashes, and throw `ConfidenceEvaluationError` for runtime scorer/mapping failures. Apply the first mapping entry with `maxRawScore >= rawScore`; never clamp invalid input.

- [ ] **Step 4: Run the focused tests and verify they pass**

  Run: `npm test --silent -- --test-name-pattern="confidence profile|confidence mapping"`

  Expected: PASS for all focused confidence contract tests.

- [ ] **Step 5: Run build and commit the pure confidence contract**

  Run: `npm run build --silent`

  Commit:

  ```bash
  git add src/types.ts src/confidence.ts tests/confidence.test.ts
  git commit -m "feat : add confidence profile contracts"
  ```

### Task 2: Integrate opt-in confidence into ClaimLatch

**Files:**
- Modify: `src/gate.ts` — accept optional confidence configuration, validate it at construction, and attach confidence after verification sanitization.
- Create: `tests/confidence-gate.test.ts` — gate integration, failure, compatibility, and policy-independence tests.

**Interfaces:**
- Consumes: Task 1's `createClaimConfidence`, `validateConfidenceCalibrationProfile`, `ClaimConfidenceScorer`, and `ConfidenceCalibrationOptions`.
- Produces: `ClaimLatchOptions.confidence?: ConfidenceCalibrationOptions`; `ClaimLatch.verify` returns the existing `VerificationReport` with optional claim-level confidence.

- [ ] **Step 1: Write failing gate integration tests**

  Add tests named `ClaimLatch attaches calibrated confidence when configured`, `ClaimLatch leaves reports unchanged without confidence configuration`, `ClaimLatch rejects a scorer that does not match the profile`, `ClaimLatch fails when the scorer returns an invalid raw score`, `ClaimLatch propagates scorer failures`, `confidence does not change policy PASS or BLOCK`, and `confidence does not change coverage or counts`. Use a deterministic fixture scorer that returns known raw scores and a profile with thresholds `0.5` and `1`.

- [ ] **Step 2: Run the focused tests and verify they fail**

  Run: `npm test --silent -- --test-name-pattern="ClaimLatch attaches|reports unchanged|scorer|confidence does not"`

  Expected: FAIL because `ClaimLatchOptions` has no confidence path.

- [ ] **Step 3: Implement the opt-in gate path**

  Store the optional confidence configuration on `ClaimLatch`, validate the profile and scorer ID in the constructor, and call `createClaimConfidence` only after `sanitizeVerification` has produced the final bound evidence/status. Preserve the existing policy calculation and report fields exactly. Let configured confidence errors reject `verify`; callers without confidence configuration must not invoke a scorer or alter claim objects.

- [ ] **Step 4: Run the focused tests and verify they pass**

  Run: `npm test --silent -- --test-name-pattern="ClaimLatch attaches|reports unchanged|scorer|confidence does not"`

  Expected: PASS with deterministic `PASS`/`BLOCK`, coverage, counts, and violations unchanged by confidence.

- [ ] **Step 5: Run the full existing suite and commit the runtime integration**

  Run: `npm test --silent`

  Commit:

  ```bash
  git add src/gate.ts src/types.ts tests/confidence-gate.test.ts tests/gate.test.ts
  git commit -m "feat : attach calibrated confidence to claims"
  ```

### Task 3: Build offline calibration fitting, evaluation, and CLI

**Files:**
- Create: `src/calibration.ts` — parse claim-level JSONL, canonicalize/hash datasets, fit isotonic mappings, validate disjoint datasets, and calculate Brier/ECE metrics.
- Create: `src/calibration-cli-options.ts` — parse calibration CLI arguments and render credential-free help.
- Create: `src/calibration-cli.ts` — read two datasets, create a profile only after all validation succeeds, write the profile, and print deterministic evaluation JSON.
- Modify: `package.json` — add the `claimlatch-calibrate` bin and a `calibrate` script that builds before running the CLI.
- Create: `tests/calibration.test.ts` — parser, manifest, fitting, overlap, Brier, and ECE tests.
- Create: `tests/calibration-cli-options.test.ts` — help and argument validation tests.
- Create: `tests/calibration-cli.test.ts` — successful CLI artifact creation and no-output-on-error subprocess tests.

**Interfaces:**
- Consumes: `CalibrationObservation` and `ConfidenceCalibrationProfile` from `src/types.ts`, and Task 1's profile validation/mapping helpers.
- Produces: `CalibrationStatusEvaluation` with `count`, optional `brierScore`, and optional `expectedCalibrationError`; `CalibrationEvaluation` with overall count/metrics and a `Record<VerificationStatus, CalibrationStatusEvaluation>`; `parseCalibrationJsonl(input: string): CalibrationObservation[]`; `hashCalibrationDataset(input: string): string`; `createConfidenceCalibrationProfile(input: { id: string; scorerId: string; calibration: { manifestSha256: string; observations: CalibrationObservation[] }; evaluation: { manifestSha256: string; observations: CalibrationObservation[] }; createdAt: string }): { profile: ConfidenceCalibrationProfile; evaluation: CalibrationEvaluation }`; `evaluateCalibration(observations: readonly CalibrationObservation[], profile: ConfidenceCalibrationProfile): CalibrationEvaluation`; `parseCalibrationCliArguments(argv: readonly string[]): CalibrationCliArguments`; and `renderCalibrationHelp(): string`.

- [ ] **Step 1: Write failing parser and calibration math tests**

  Add tests named `calibration JSONL parser preserves valid observations`, `calibration parser rejects duplicate IDs and invalid label URLs`, `calibration manifest canonicalizes CRLF`, `profile fitting produces a monotonic step mapping`, `profile creation rejects shared manifests and source case claim pairs`, `Brier score matches the hand-computed fixture`, and `ECE uses ten fixed equal-width bins`. Include all four statuses and assert zero-count status groups are reported with unavailable status metrics rather than omitted.

- [ ] **Step 2: Run the focused calibration tests and verify they fail**

  Run: `npm test --silent -- --test-name-pattern="calibration|Brier|ECE|profile fitting"`

  Expected: FAIL because the calibration module does not exist.

- [ ] **Step 3: Implement JSONL validation and canonical dataset hashing**

  In `src/calibration.ts`, parse one JSON object per non-empty/non-comment line, require non-empty IDs, valid `VerificationStatus` values, finite `[0, 1]` raw scores, non-empty source case/claim IDs, and at least one HTTP(S) `labelSourceUrls` entry. Reject duplicate observation IDs. Hash content after replacing CRLF/CR with LF using SHA-256, matching the existing benchmark manifest convention.

- [ ] **Step 4: Implement deterministic isotonic fitting and evaluation**

  Fit the mapping against `predictedStatus === expectedStatus`; sort observations by raw score and use a pooled-adjacent-violators implementation or equivalent deterministic isotonic regression. Encode the result as strictly increasing upper thresholds ending at `1`. Evaluate ten equal-width bins `[0, .1) ... [.9, 1]`, calculate Brier and ECE, and calculate the same metrics per predicted status while preserving zero-count groups.

- [ ] **Step 5: Implement profile creation and disjointness checks**

  Require non-empty calibration and evaluation sets, distinct manifest hashes, unique IDs in each set, and no overlapping `sourceCaseId/sourceClaimId` pair across sets. Fit only from calibration observations, evaluate only on evaluation observations, and include the independent evaluation manifest/count/metrics in `profile.validation`. Call Task 1 profile validation before returning the profile.

- [ ] **Step 6: Run the focused calibration tests and verify they pass**

  Run: `npm test --silent -- --test-name-pattern="calibration|Brier|ECE|profile fitting"`

  Expected: PASS for parser, manifest, fit, disjointness, and metric fixtures.

- [ ] **Step 7: Write failing CLI option and subprocess tests**

  Test `renderCalibrationHelp` for the `claimlatch-calibrate` usage and the status-correctness warning. Test required `--calibration`, `--evaluation`, `--output`, `--profile-id`, `--scorer-id`, and deterministic `--created-at` arguments. In a temp directory, run the built CLI with valid fixtures and assert the profile file, JSON metrics, and no provider/network environment are needed. Run it with overlapping data and assert exit code `2`, the `claimlatch-calibrate:` error prefix, and that the requested output file does not exist.

- [ ] **Step 8: Implement the offline CLI and package wiring**

  Keep all reads and validation ahead of the output write. Serialize profiles with stable object construction and a trailing newline; print only deterministic evaluation JSON to stdout. Add the bin entry `claimlatch-calibrate: dist/src/calibration-cli.js` and script `calibrate: npm run build && node dist/src/calibration-cli.js`. The CLI must never call a provider or evidence search.

- [ ] **Step 9: Run CLI tests, build, and commit the calibration subsystem**

  Run: `npm test --silent -- --test-name-pattern="calibration|claimlatch-calibrate"`

  Run: `npm run build --silent`

  Commit:

  ```bash
  git add src/calibration.ts src/calibration-cli-options.ts src/calibration-cli.ts package.json tests/calibration.test.ts tests/calibration-cli-options.test.ts tests/calibration-cli.test.ts
  git commit -m "feat : add offline confidence calibration"
  ```

### Task 4: Export the API and preserve signed receipt compatibility

**Files:**
- Modify: `src/index.ts` — export confidence and calibration functions/types.
- Modify: `src/receipt.ts` — validate optional claim confidence in signed reports without rejecting legacy reports.
- Modify: `tests/receipt.test.ts` — add confidence-bearing receipt and tamper cases.
- Create: `tests/index-exports.test.ts` — verify the new root runtime exports and type-facing module surface.

**Interfaces:**
- Consumes: Task 1's confidence types and Task 3's calibration functions.
- Produces: package-root exports for runtime helpers, calibration helpers, and all public confidence/calibration types.

- [ ] **Step 1: Write failing receipt and export tests**

  Add `signed receipts cover optional confidence values`, `legacy reports without confidence remain valid`, `receipt verification fails when confidence is removed or changed`, and `package exports confidence and calibration helpers`. The confidence-bearing claim must include the exact literal meaning, scorer ID, and profile ID.

- [ ] **Step 2: Run focused receipt/export tests and verify they fail**

  Run: `npm test --silent -- --test-name-pattern="confidence.*receipt|legacy reports|package exports"`

  Expected: FAIL because receipt shape validation and root exports do not know the new fields.

- [ ] **Step 3: Implement optional receipt shape validation and exports**

  Extend `isClaimVerification` with an optional `confidence` object validator requiring a finite `[0, 1]` value, the exact meaning literal, and non-empty scorer/profile IDs. Do not make confidence required. Add the new `src/confidence.ts` and `src/calibration.ts` runtime exports and corresponding type exports in `src/index.ts`.

- [ ] **Step 4: Run focused tests and the full suite**

  Run: `npm test --silent -- --test-name-pattern="confidence.*receipt|legacy reports|package exports"`

  Run: `npm test --silent`

  Expected: all focused and existing tests pass; old receipt fixtures remain valid.

- [ ] **Step 5: Build and commit API/receipt compatibility**

  Run: `npm run build --silent`

  Commit:

  ```bash
  git add src/index.ts src/receipt.ts tests/receipt.test.ts tests/index-exports.test.ts
  git commit -m "feat : expose confidence and receipt provenance"
  ```

### Task 5: Document semantics and complete release verification

**Files:**
- Modify: `README.md` — explain status-correctness probability, opt-in SDK configuration, profile provenance, CLI usage, and limitations.
- Modify: `docs/ARCHITECTURE.md` — add confidence data flow and its separation from policy/coverage.
- Modify: `docs/TRUST_MODEL.md` — document the trust boundary, independent labels, and non-truth-probability meaning.
- Modify: `docs/ROADMAP.md` — mark calibration experiments complete only after the independent labelled fixture and generated metrics are committed.

**Interfaces:**
- Consumes: the public names and CLI behavior from Tasks 1–4.
- Produces: user-facing documentation that cannot imply factual truth probability or a confidence-based PASS.

- [ ] **Step 1: Update the four documentation files**

  Add one concise SDK example using a caller-provided scorer/profile, one offline CLI example with separate calibration/evaluation files, and explicit notes that no profile means no confidence and confidence never changes `PASS/BLOCK`. Preserve the existing English README/documentation language.

- [ ] **Step 2: Run the complete verification suite**

  Run:

  ```bash
  npm test --silent
  npm run build --silent
  npm run calibrate -- --help
  npm run bench:manifest --silent
  npm run bench:validate --silent
  npm pack --dry-run --silent
  npm audit --omit=dev
  git diff --check
  git status --short --branch
  ```

  Expected: all tests/builds succeed, calibration help is credential-free, benchmark manifest output matches the committed manifest, benchmark validation is valid, package dry-run uses the updated version, audit reports zero production vulnerabilities, and the worktree is clean except for the intended committed history.

- [ ] **Step 3: Review the complete branch and commit documentation**

  Review `git diff main...HEAD`, verify no benchmark result is fabricated, verify no proxy confidence header was added, and verify the README warning is unambiguous.

  ```bash
  git add README.md docs/ARCHITECTURE.md docs/TRUST_MODEL.md docs/ROADMAP.md
  git commit -m "docs : document confidence calibration limits"
  ```

- [ ] **Step 4: Open, review, merge, and clean up the implementation PR**

  Push the `codex/` implementation branch, create the PR using the repository's required Korean template, inspect the PR diff/checks, merge with squash after review, delete the remote/local branch, switch to `main`, pull with `--ff-only`, and rerun the final status check. Report only verified test/build/benchmark/audit results.

