# Gleave Project Portfolio Generation Design

## Status

Approved conversational scope: generate portfolio material from the durable
record of a Gleave project. This document defines the design before
implementation.

## Intent and success criteria

The user should be able to select a completed or in-progress project from the
Gleave project view and say, "이 프로젝트 포트폴리오로 정리해줘" or press a
single action button. EEEE must then produce useful Korean-first portfolio
artifacts without inventing work, results, or technologies.

Success means:

1. Every factual section in a generated artifact can be traced to durable
   project evidence.
2. The generated package explains not only what was built, but also the
   decisions, troubleshooting, verification, and outcome.
3. The same source snapshot can produce a portfolio page, GitHub README,
   retrospective, technical blog post, resume summary, and interview guide.
4. Generation is local-first, does not publish externally, and redacts
   secrets and private values by default.
5. Missing evidence is shown as missing instead of being guessed.

## Scope

### In scope

- A durable portfolio evidence snapshot for each project revision.
- Structured troubleshooting records linked to tasks, commits, and QA.
- A portfolio generation capability exposed through the EEEE assistant and
  the Gleave project view.
- Six Markdown outputs, Korean by default with English as an option.
- A provenance manifest linking output sections to source evidence.
- Preview, regeneration, local artifact storage, and error reporting.

### Out of scope for this increment

- Automatic publishing to a public website, GitHub, Notion, or a blog.
- Creating or editing a resume document format such as DOCX or PDF.
- A public portfolio hosting service or login system.
- Replacing the existing project execution engine.

## Existing system boundaries to reuse

The feature must build on the current durable project records instead of
creating a second project history:

- `ProjectProfile` supplies the goal, scope, constraints, acceptance criteria,
  workspace, capabilities, preferences, and retrieved QA memories.
- Project, task, task-event, run, report, artifact, and harness records supply
  the execution timeline and outcomes.
- The Git adapter supplies branch, commit, changed-file, and diff metadata.
- ClaimLatch audit records supply verification decisions and report IDs.
- Independent QA and verification records supply test commands, results, and
  evidence paths.
- Promoted EEEE memories supply reusable lessons, but only with their linked
  evidence and verification IDs.

The current implementation stores a current commit and run artifacts in some
paths but does not yet provide a complete portfolio-ready history. The
implementation must add the missing normalized records and Git history
collection without breaking existing request/run APIs.

## Durable evidence model

### Troubleshooting record

Each meaningful failure or investigation is stored as a structured record:

- `id`, `projectId`, `projectRevision`
- `title`
- `symptom`
- `reproduction`
- `impact`
- `investigation` (ordered observations)
- `attempts` (attempt, result, and why it was kept or rejected)
- `resolution`
- `verification`
- `taskIds`, `commitRefs`, `evidenceRefs`
- `createdAt`, `updatedAt`
- `visibility` with local/private as the default

Troubleshooting records may be created from agent events, QA failures, build
failures, and explicit EEEE notes. They remain editable so the user can fix
wording or remove private context before generating a public-facing artifact.

### Portfolio source snapshot

Generation reads one immutable snapshot identified by project and revision.
The snapshot contains:

- project profile and original request;
- organization-map nodes and their status transitions;
- task and run timeline;
- Git branches, commits, changed files, and relevant diffs;
- troubleshooting records;
- ClaimLatch decisions and evidence references;
- QA reports, test commands, and outcomes;
- artifact paths and screenshots;
- selected promoted memories and their provenance;
- a redaction report.

The snapshot is retained so regenerating a document later does not silently
change its factual basis after the project evolves.

### Generated artifact record

Every output is stored with:

- `artifactId`, `projectId`, `sourceSnapshotId`;
- `kind` (`portfolio-page`, `github-readme`, `retrospective`,
  `technical-blog`, `resume-summary`, or `interview-guide`);
- `language`, `path`, `contentHash`, `generatedAt`;
- `status` (`generated`, `needs-review`, or `failed`);
- source-section references used by the artifact.

Alongside the human-readable files, `portfolio-manifest.json` records the
source evidence for every generated section. The manifest is for traceability
and review; it is not required to be published.

## Generation flow

```text
User selects project or says "이 프로젝트 포트폴리오로 정리해줘"
          |
          v
EEEE selects Portfolio Generation capability
          |
          v
Snapshot project revision + Git + QA + ClaimLatch + troubleshooting
          |
          v
Redact secrets and private values; report missing evidence
          |
          v
Build structured fact sheet and provenance map
          |
          v
Render six requested formats from the same fact sheet
          |
          v
Write local docs/portfolio/ artifacts and manifest
          |
          v
Show preview, evidence coverage, warnings, and output paths
```

The preferred renderer is hybrid: deterministic extraction and validation form
the factual layer, while an optional local LLM only improves narrative style
within that fact sheet. A template renderer remains available when no LLM is
configured. The renderer must reject or mark a sentence when its claim cannot
be tied to a source reference.

## Output contract

The default project output is:

```text
<project-workspace>/docs/portfolio/
├── portfolio-page.md
├── github-readme.md
├── retrospective.md
├── technical-blog.md
├── resume-summary.md
├── interview-guide.md
└── portfolio-manifest.json
```

All six outputs use the same factual sections where applicable:

1. project context and goal;
2. role of EEEE, ISEOL, and specialist agents;
3. architecture and technology choices;
4. implementation highlights;
5. troubleshooting and decisions;
6. verification, QA, and ClaimLatch evidence;
7. measurable or explicitly observed outcome;
8. limitations and next steps.

Each format then adapts length and tone. Resume output is concise, the
interview guide is question-and-answer oriented, and the technical blog keeps
the investigation narrative.

## API and assistant surface

The capability registry will include a `portfolio-generation` capability with
local side effects, defaulting to user confirmation before overwriting an
existing artifact.

The project API will provide:

- create a portfolio generation job for a project and revision;
- list generated artifacts and coverage warnings;
- retrieve an artifact or its provenance manifest;
- regenerate selected formats or language;
- record user edits as local artifact revisions.

Generation is idempotent for the same project revision, language, format set,
and source snapshot. A new project revision creates a new snapshot rather than
mutating the factual basis of an older package.

## Gleave project view

The existing project work view will expose a `포트폴리오로 정리` action. The
visual project organization map remains the primary view; the action is
available from the project header and completed project nodes.

The result panel shows:

- generation status and progress;
- evidence coverage and missing records;
- six output cards with preview/open actions;
- a link to the source snapshot and provenance manifest;
- warnings requiring user review.

The view must not expose internal secrets, raw model prompts, or private
connector tokens.

## Integrity, privacy, and failure handling

- ClaimLatch verification is evidence for a claim, not a replacement for the
  claim itself. A non-PASS or missing result is shown explicitly.
- Secret patterns, tokens, private keys, and configured private connector
  values are redacted before fact extraction and output rendering.
- Unverified metrics are labelled as observations or omitted.
- If Git, QA, or ClaimLatch data is unavailable, generation continues with a
  coverage warning and never fabricates the missing section.
- If generation fails, the source snapshot is retained and no partial output
  replaces a prior successful artifact.
- External publishing is never implicit; only local files are written in this
  increment.

## Testing and acceptance criteria

Tests will cover:

- durable troubleshooting record creation, update, and project-revision
  isolation;
- snapshot completeness and immutable source references;
- secret and private-value redaction;
- provenance for every generated section;
- deterministic fallback rendering without an LLM;
- all six output formats in Korean and English;
- regeneration idempotency and partial-failure recovery;
- API and assistant capability routing;
- Gleave UI generation status, previews, warnings, and output links;
- evidence that no external connector is called during local generation;
- end-to-end generation from a project with commits, QA, ClaimLatch, and a
  troubleshooting record.

The feature is complete when a seeded project can produce all six files, every
factual section resolves to the saved manifest, missing evidence is visibly
reported, and a second generation from the same revision produces the same
content hashes.
