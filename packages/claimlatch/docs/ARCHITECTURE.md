# Architecture

ClaimLatch is a pipeline of replaceable ports with a deterministic release boundary.

1. **ClaimExtractor** turns a draft answer into atomic factual claims.
2. **EvidenceProvider** retrieves evidence for each claim.
3. **ProvenanceEvidenceProvider** can fetch the original document and replace search snippets with an auditable quote plus content hash.
4. **ClaimVerifier** classifies the relationship between one claim and supplied evidence.
5. **Core invariant sanitizer** refuses malformed plugin output and strips invented evidence references.
6. **Optional confidence scorer and calibration profile** attach a calibrated verification-status-correctness value to each sanitized claim.
7. **Policy evaluator** makes the final PASS/BLOCK decision.

The model never gets to directly decide whether the answer is released. It can propose claim/evidence relations, but the final gate result is deterministic policy code over explicit statuses and validated bindings.

## Confidence data flow

Confidence is an independent annotation path, not a policy input:

```text
sanitized claim verification
        ↓
caller-provided scorer → raw score
        ↓
validated offline isotonic profile
        ↓
claim.confidence.value + scorer/profile provenance
```

The profile's target is `verification-status-correctness`: the probability that the emitted status is correct under the calibration distribution. It is not the probability that the claim is factually true. Confidence is omitted unless the caller configures both a scorer and a matching profile. Invalid scorer output fails the verification operation closed, and confidence never changes statuses, coverage, counts, violations, or the policy PASS/BLOCK result.

Calibration is performed by `claimlatch-calibrate` from disjoint calibration and evaluation JSONL datasets. The profile records both canonical dataset SHA-256 hashes, the scorer ID, the profile ID, and evaluation Brier/ECE metrics so downstream receipts can preserve the provenance of the optional value.

## Status semantics

- `SUPPORTED`: supplied evidence directly entails the claim.
- `CONTRADICTED`: supplied evidence directly conflicts with the claim.
- `UNSUPPORTED`: relevant evidence exists but does not establish the claim.
- `UNVERIFIABLE`: no usable evidence is available or the evidence is too ambiguous to judge.

The verifier may also return `supportingEvidenceIds` and `contradictingEvidenceIds`. The core keeps only IDs that exist in the retrieved evidence. The policy evaluator treats support and contradiction from distinct normalized source URLs as a cross-source contradiction and blocks it by default.

## Coverage

Coverage is `(SUPPORTED + CONTRADICTED) / total claims`.

It is **not** an accuracy probability. A contradicted claim counts as covered because evidence was sufficient to decide it, but the default policy blocks it.

## Core invariants

The core does not assume plugins behave perfectly.

- Claim IDs must be non-empty and unique.
- Evidence with a mismatched `claimId` is discarded.
- Duplicate evidence IDs are discarded.
- Verifier evidence IDs that do not exist in retrieved evidence are discarded.
- `SUPPORTED`/`CONTRADICTED` with no valid evidence binding is downgraded to `UNVERIFIABLE`.
- Supporting and contradicting evidence relations are filtered to retrieved IDs before policy evaluation.
- The claim/evidence objects included in the final report come from the core pipeline, not arbitrary verifier replacements.

## Provenance

A `retrieved-document` evidence record contains a quote, normalized-document character offsets, final URL, retrieval time, content type, and SHA-256. PDF evidence also records the 1-based page number and page-local quote offsets. Search snippets remain explicitly labeled `search-snippet`.

PDF text is extracted page by page with PDF.js. If parsing or text extraction fails, the provider preserves the original search-snippet provenance instead of creating unverifiable document provenance.

The strict `requireRetrievedDocumentForDecisiveClaims` policy requires every selected decisive verdict to cite at least one fetched-document evidence item.

## Reverse proxy

The proxy implements `GET /v1/models`, `GET /models`, `GET /v1/models/:id`, `GET /models/:id`, `POST /v1/chat/completions`, and `POST /chat/completions`. Model listing and retrieval are bounded metadata passthroughs and never invoke the answer gate. Model IDs are encoded as a single upstream path segment. Provider profiles can supply provider-specific model-list and model-retrieval routes; a profile can set model retrieval to `null` to fail closed when an upstream exposes listing but not per-model retrieval. The Azure profile uses `/openai/models?api-version=2024-10-21` alongside its deployment completion path, while FastChat uses `/v1/models` and disables `/v1/models/:id` by default. For completions, it verifies every assistant choice in a multi-choice response; textual choices use ClaimLatch, while structured choices require an explicit application verifier. One blocked choice blocks the whole response.

```text
client
  ↓
ClaimLatch proxy
  ↓
upstream generation provider
  ↓
full draft buffered
  ↓
ClaimLatch gate
  ├─ PASS → original completion released
  └─ BLOCK → HTTP 422 + aggregate and per-choice reports
```

For `stream: true`, the proxy buffers the complete upstream SSE response privately, verifies every reconstructed choice, and replays the original frames only after PASS. Structured streaming choices remain fail-closed without an explicit verifier. The configured upstream base must be an absolute HTTP(S) URL without credentials, query, or fragment. A configured upstream API key can target a provider-specific header such as `api-key` and an explicit authentication scheme prefix such as `Api-Key`; otherwise `Authorization` uses `Bearer` and the proxy uses `/chat/completions`.

## Application integration

`createGuardedAnswerServer` and `createGuardedAnswerFetchHandler` use `/health` and `/answer` by default. Both accept absolute `healthPath` and `answerPath` overrides without query strings or fragments, so Fetch-native framework routes can mount the same fail-closed verification boundary under an application-specific prefix.

## Benchmark

The benchmark runner compares end-to-end gate decisions to labels authored independently of the gate output. The default frozen dataset is verified against its SHA-256 manifest before any provider calls. False-pass rate is treated as the primary safety regression metric.

## Failure philosophy

ClaimLatch should fail closed when a verifier or evidence provider cannot produce a defensible result. Transport failures are errors; absence of evidence becomes `UNVERIFIABLE`; contradictions are explicit violations.
