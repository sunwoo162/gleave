# Confidence Semantics Design

Date: 2026-09-30
Status: Design approved in chat; implementation not started

## Summary

ClaimLatch currently produces deterministic claim statuses and a deterministic
`PASS` or `BLOCK` decision. It intentionally does not expose a probability
score. This design adds an opt-in, claim-level confidence estimate only when a
caller supplies both a score provider and an independently evaluated calibration
profile.

The estimate has one narrow meaning:

> The estimated probability that ClaimLatch assigned the appropriate
> verification status for this claim, given the configured scorer and its
> calibration profile.

It is not a probability that the claim is true, a probability that the whole
answer is trustworthy, or a replacement for the deterministic policy gate.

## Goals

- Define a confidence meaning that can be measured against independent labels.
- Keep `PASS`/`BLOCK`, policy evaluation, and evidence coverage deterministic and
  unchanged.
- Prevent uncalibrated or mismatched scores from being presented as reliable
  probabilities.
- Make the calibration data, scorer identity, and evaluation provenance
  inspectable and reproducible.
- Preserve existing SDK, CLI, proxy, and signed-receipt behavior when the new
  feature is not configured.

## Non-goals

- Estimating the factual truth probability of a claim.
- Using confidence to override a contradiction, unsupported-claim limit,
  coverage requirement, or any other policy violation.
- Creating a universal score that is portable across models, providers,
  scorers, domains, or benchmark distributions.
- Training or fitting a calibration model during request handling.
- Adding an aggregate confidence header to the proxy.
- Claiming that a profile generalizes beyond the distribution represented by its
  calibration and independent evaluation data.

## Terminology

- **Raw score**: A scorer-produced number in `[0, 1]` before calibration. It is
  not exposed as a probability.
- **Scorer**: An application-supplied component that derives a raw score from a
  claim, its sanitized verification, and the bound evidence.
- **Calibration profile**: An immutable, versioned isotonic mapping from raw
  score to calibrated probability, tied to one scorer and one dataset
  manifest.
- **Status correctness**: The binary target produced by comparing
  `predictedStatus` with an independently labelled `expectedStatus`.
- **Independent evaluation**: A labelled observation set that is not used to
  fit the calibration mapping and is identified by a distinct manifest.

## Design

### 1. Runtime data flow

Confidence is entirely opt-in. `ClaimLatchOptions` receives a confidence
configuration only when the caller wants estimates:

```ts
interface ClaimConfidenceScorer {
  id: string;
  score(input: {
    claim: Claim;
    verification: ClaimVerification;
  }): number | Promise<number>;
}

interface ConfidenceCalibrationOptions {
  scorer: ClaimConfidenceScorer;
  profile: ConfidenceCalibrationProfile;
}
```

The gate performs the existing extraction, evidence search, verification,
sanitization, and policy evaluation. After a claim has been sanitized, and
before the report is returned, the optional confidence path:

1. Calls the configured scorer with the sanitized claim verification.
2. Rejects a non-finite raw score or a value outside `[0, 1]`.
3. Applies the profile's deterministic isotonic mapping.
4. Attaches the resulting `ClaimConfidence` to that claim.

The confidence path never changes the status, counts, coverage, violations, or
`passed` value. A missing confidence configuration leaves reports byte-for-byte
compatible in shape with current reports, apart from normal timestamp
generation.

The public claim field is:

```ts
interface ClaimConfidence {
  value: number;
  meaning: "verification-status-correctness";
  scorerId: string;
  calibrationProfileId: string;
}
```

Confidence is claim-level only. ClaimLatch does not calculate a report-level
average, answer-level probability, or policy threshold from these values.

### 2. Calibration profile

The profile is validated before it can be used. Its public shape is:

```ts
interface ConfidenceCalibrationProfile {
  version: 1;
  id: string;
  target: "verification-status-correctness";
  scorerId: string;
  method: "isotonic";
  datasetManifestSha256: string;
  observationCount: number;
  mapping: Array<{
    maxRawScore: number;
    calibratedProbability: number;
  }>;
  validation: {
    datasetManifestSha256: string;
    observationCount: number;
    brierScore: number;
    expectedCalibrationError: number;
  };
  createdAt: string;
}
```

The mapping is a step function. For a raw score, ClaimLatch selects the first
entry whose `maxRawScore` is greater than or equal to that score. The final
entry must have `maxRawScore === 1`, so every valid raw score has a defined
mapping. Mapping thresholds are strictly increasing and calibrated
probabilities are non-decreasing.

Profile validation also requires:

- `version`, `id`, `target`, `method`, and `scorerId` to be valid and non-empty;
- both manifest hashes to be lowercase 64-character SHA-256 values;
- positive integer observation counts;
- finite numeric metrics in `[0, 1]`;
- `validation.datasetManifestSha256` to differ from
  `datasetManifestSha256`;
- the runtime scorer's `id` to equal the profile's `scorerId`.

The profile is configuration, not an attestation by itself. Consumers that need
an external trust boundary must authenticate the profile file or distribute its
hash through their own trusted configuration. The signed verification receipt
will authenticate the profile identifier and resulting confidence values as
part of the signed report, but it will not make an untrusted profile truthful.

### 3. Calibration observations and fitting

Calibration uses claim-level observations, not only the existing benchmark
decision label. The decision label `expectedPassed` cannot establish whether an
individual `SUPPORTED`, `CONTRADICTED`, `UNSUPPORTED`, or `UNVERIFIABLE` status
was appropriate.

The observation format is:

```ts
interface CalibrationObservation {
  id: string;
  predictedStatus: VerificationStatus;
  expectedStatus: VerificationStatus;
  rawScore: number;
  sourceCaseId: string;
  sourceClaimId: string;
  labelSourceUrls: string[];
}
```

The binary calibration target is:

```ts
const statusCorrect = predictedStatus === expectedStatus;
```

The fitting workflow has two disjoint sets:

1. A calibration set fits the isotonic mapping.
2. An independent evaluation set measures the fitted mapping.

Both sets require unique observation IDs, valid raw scores, valid statuses,
non-empty HTTP(S) label source URLs, and canonical SHA-256 manifests. The
calibration and evaluation sets must have different manifest hashes and must not
reuse a source case/claim pair. Empty sets, malformed labels, duplicate IDs,
and overlapping source observations fail closed.

The calibration result must include the independent evaluation metadata in the
profile's `validation` object. A mapping without an independent evaluation
cannot be loaded as a runtime confidence profile.

### 4. Evaluation metrics

The calibration evaluator reports:

- **Brier score**: the mean of `(probability - statusCorrect)^2`;
- **expected calibration error (ECE)**: the weighted absolute difference
  between mean predicted probability and empirical correctness in ten fixed
  equal-width probability bins;
- overall observation count;
- observation count and the same metrics for each predicted status.

The evaluator must not silently omit empty status groups. It reports their
count as zero and their status-specific metrics as unavailable. Metrics are
descriptive for the supplied evaluation distribution and do not become policy
thresholds.

### 5. Error and fail-closed behavior

- An invalid profile is rejected during confidence configuration validation.
- A scorer exception rejects the verification operation when confidence is
  explicitly configured.
- A non-finite or out-of-range raw score rejects the verification operation.
- Existing callers without confidence configuration follow the current error
  and report behavior exactly.
- Guarded HTTP integrations and the proxy use their existing fail-closed error
  handling when confidence evaluation rejects a request.
- Confidence errors never turn a policy `BLOCK` into `PASS`, and confidence is
  never used to turn a policy `PASS` into `BLOCK`.

## Signed receipts and compatibility

`ClaimConfidence` is nested inside the existing `VerificationReport` claim
objects. Existing signed receipt version `1` remains the receipt format. The
receipt shape validator accepts reports both with and without the optional
confidence field, and canonical signing automatically covers confidence when it
is present.

Older receipts remain verifiable. A receipt created with a confidence-bearing
report cannot be altered to remove or change confidence without invalidating its
signature.

No new proxy response header is added. Multi-choice proxy aggregation continues
to aggregate counts and coverage only.

## Public API and CLI surface

The SDK exports the confidence types and the profile validation/mapping helpers.
The gate accepts an optional confidence configuration. The existing `claimlatch`
verification command remains unchanged unless a future explicit CLI option
supplies a scorer and profile.

A separate calibration CLI is added for offline work. It accepts a calibration
dataset, an independent evaluation dataset, and an output path for the profile;
it prints deterministic JSON metrics and refuses to write a profile when either
dataset is invalid or independent evaluation is missing. It never performs
live evidence search or provider calls.

CLI help and README examples must state that the output is status-correctness
probability, not factual truth probability.

## Testing strategy

Tests are added before implementation for:

1. profile validation, including malformed ranges, ordering, hashes, counts,
   scorer mismatch, and calibration/evaluation overlap;
2. deterministic mapping boundaries and monotonicity;
3. unchanged reports when confidence is not configured;
4. confidence attachment with a valid scorer and profile;
5. scorer failures and invalid scores failing closed;
6. receipt signing, verification, and tamper detection with confidence;
7. Brier/ECE calculations using a small hand-computed fixture;
8. calibration CLI validation, deterministic output, and no-output-on-error;
9. SDK exports and CLI help text;
10. existing full unit, build, package, benchmark, and audit checks.

No benchmark accuracy or calibration result may be claimed unless it is produced
by the committed evaluation dataset and recorded in the generated output.

## Documentation updates

The implementation updates:

- `README.md` with the semantic warning, opt-in setup, profile provenance, and
  CLI usage;
- `docs/ARCHITECTURE.md` with the confidence data flow and the separation from
  deterministic policy;
- `docs/TRUST_MODEL.md` with the status-correctness limitation and profile
  trust boundary;
- `docs/ROADMAP.md` to mark calibration experiments as implemented only after
  the independent labelled data and generated metrics exist.

## Rollout and acceptance criteria

The feature is ready only when all of the following are true:

- the public types and runtime path enforce the semantics in this document;
- an independent, manifest-verified calibration fixture produces a profile and
  metrics without network calls;
- no confidence configuration preserves existing behavior;
- malformed profiles, scorer failures, and invalid scores fail closed;
- signed receipts cover optional confidence values;
- all tests, build, package dry-run, benchmark validation, and production audit
  checks pass;
- the feature is merged through a reviewed pull request and the temporary
  branch is deleted afterward.

