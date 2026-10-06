# Iseol Project Model Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Promote one deployed Idea Lab prototype into a durable Project Workspace that preserves its Genesis history and provides stable Project/Tree context for all future Iseol work.

**Architecture:** Keep the existing Discord `StoredProject` format untouched. Add a separate core project-model boundary with caller-supplied storage roots, atomic workspace/catalog persistence, append-only project history, idempotent prototype promotion, and a flat parent-linked project tree that Web and Discord can later share.

**Tech Stack:** TypeScript 7, Node.js 22, `node:test`, `node:crypto`, `node:fs/promises`, existing Harness Run stores/events, no new runtime dependencies.

**Spec:** `docs/superpowers/specs/2026-09-07-iseol-product-architecture-design.md`

## Global Constraints

- Read `docs/HARNESS_ENGINEERING.md` before every implementation task.
- A promoted project freezes the selected prototype's exact repository branch/commit and deployment URL; it is never regenerated during promotion.
- Promotion imports the selected prototype's prior Harness Runs as Genesis.
- Rejected/unselected prototypes do not automatically become full Project Workspaces.
- Project Tree nodes represent product/development structure, not filesystem paths.
- Existing `src/services/projects.ts`, Discord commands, GitHub/Figma/Notion/Calendar behavior, and `data/projects.json` format remain unchanged in this phase.
- Runtime stores receive their root from the caller; tests use temporary directories and never touch real project data.
- All commits use English Conventional Commit-style messages.

---
## File structure

- `src/project-model/contracts.ts` — versioned prototype/workspace/genesis/tree/history contracts and safe ID validation.
- `src/project-model/prototype-store.ts` — atomic prototype catalog persistence and lookup/update helpers.
- `src/project-model/workspace-store.ts` — atomic Project Workspace persistence and lookup.
- `src/project-model/history-store.ts` — append-only project history JSONL.
- `src/project-model/promotion.ts` — idempotent promotion and Harness Genesis import.
- `src/project-model/project-tree.ts` — pure tree-node creation/status/run attachment helpers.
- `src/project-model/work-context.ts` — stable Project/Node/Run context validation for future Web/Discord callers.
- `tests/project-model-*.test.ts` — focused contract/store/promotion/tree/context coverage.

### Task 1: Versioned Project Model contracts

**Files:**
- Create: `src/project-model/contracts.ts`
- Create: `tests/project-model-contracts.test.ts`
- Modify: `package.json`

**Interfaces:**
- Produces: `PrototypeCandidate`, `PrototypeRepositorySnapshot`, `PrototypeDeploymentSnapshot`, `ProjectWorkspace`, `ProjectGenesis`, `GenesisRunSnapshot`, `ProjectTreeNode`, `ProjectHistoryEvent`, `ProjectWorkContext`, `assertProjectModelId(id)`.

- [x] Write failing tests proving IDs reject path traversal/whitespace and valid contract fixtures retain exact repository branch/commit/deployment identity.
- [x] Run the focused test and confirm RED because the module does not exist.
- [x] Implement version `1` contracts with prototype status `candidate | promoted | archived`, tree kinds `root | area | feature | task`, and node status `planned | in-progress | blocked | done`.
- [x] Require promotion-capable repository snapshots to contain `url`, `branch`, and `commitSha`; deployment snapshots contain at least `url`.
- [x] Run focused test plus `npm run build` and confirm PASS.
- [x] Commit as `feat: define iseol project model contracts`.
### Task 2: Prototype, Workspace, and History stores

**Files:**
- Create: `src/project-model/prototype-store.ts`
- Create: `src/project-model/workspace-store.ts`
- Create: `src/project-model/history-store.ts`
- Create: `tests/project-model-stores.test.ts`

**Interfaces:**
- Produces: `savePrototypeCandidate`, `loadPrototypeCandidate`, `updatePrototypeCandidate`, `saveProjectWorkspace`, `loadProjectWorkspace`, `appendProjectHistoryEvent`, `loadProjectHistory`.

- [x] Write failing tests for atomic prototype/workspace round trips, missing IDs returning `null`, append-order history reload, and safe ID boundaries.
- [x] Run the focused test and confirm RED.
- [x] Store prototypes under `<root>/prototypes/<id>.json`, workspaces under `<root>/projects/<id>/project.json`, and history under `<root>/projects/<id>/history.jsonl`.
- [x] Use temp-file + rename for JSON snapshots and append-only writes for history; never persist secrets or environment variables.
- [x] Run focused tests plus build and confirm PASS.
- [x] Commit as `feat: persist project model state`.

### Task 3: Idempotent prototype promotion and Genesis import

**Files:**
- Create: `src/project-model/promotion.ts`
- Create: `tests/project-model-promotion.test.ts`

**Interfaces:**
- Consumes: prototype/workspace/history stores, `loadHarnessRun`, `loadHarnessRunEvents`.
- Produces: `promotePrototype(input): Promise<ProjectWorkspace>`.

- [x] Write failing tests proving promotion freezes the candidate repository/deployment snapshots, imports every listed Harness Run and its events/evidence, marks the candidate promoted, and returns the same workspace when retried.
- [x] Add a failure case proving a missing Genesis Run aborts promotion before marking the candidate promoted.
- [x] Run focused tests and confirm RED.
- [x] Implement deterministic workspace ID `project-<prototypeId>` and root tree node `root`; snapshot Harness Run objective/stage/status/policy digest/evidence/events into `genesis.runs`.
- [x] Persist the workspace before marking the prototype promoted; retry reconciles an already-created workspace instead of creating a duplicate.
- [x] Append `project-promoted` and `genesis-run-imported` history events with stable project/prototype/run references.
- [x] Run focused tests plus build and confirm PASS.
- [x] Commit as `feat: promote prototypes into project workspaces`.
### Task 4: Project Tree operations

**Files:**
- Create: `src/project-model/project-tree.ts`
- Create: `tests/project-model-tree.test.ts`

**Interfaces:**
- Produces: `addProjectTreeNode(workspace, input)`, `updateProjectTreeNodeStatus(workspace, nodeId, status, at)`, `attachRunToProjectTreeNode(workspace, nodeId, runId, at)`, `findProjectTreeNode(workspace, nodeId)`.

- [x] Write failing tests for adding area/feature/task nodes, rejecting missing parents/duplicate IDs, updating status, and attaching a Run once without duplicates.
- [x] Prove the root node cannot be deleted/reparented in this first model and that tree operations do not mutate the input workspace object.
- [x] Run focused tests and confirm RED.
- [x] Implement a flat parent-linked node list so Web and Discord can render different tree UIs from the same structure.
- [x] Keep destructive reparent/delete operations out of scope until an explicit approval workflow exists.
- [x] Run focused tests plus build and confirm PASS.
- [x] Commit as `feat: structure project work with tree nodes`.

### Task 5: Shared Project Work context

**Files:**
- Create: `src/project-model/work-context.ts`
- Create: `tests/project-model-work-context.test.ts`

**Interfaces:**
- Produces: `resolveProjectWorkContext(input)` returning `{ projectId, nodeId?, runId? }` only when referenced workspace/node/run relationships are valid.

- [x] Write failing tests for project-only context, valid node context, valid node+attached-run context, missing node rejection, and run/node mismatch rejection.
- [x] Run focused tests and confirm RED.
- [x] Implement validation using `loadProjectWorkspace`, `findProjectTreeNode`, and the node's attached `runIds`; do not read legacy `projects.json` directly.
- [x] Run focused tests plus build and confirm PASS.
- [x] Commit as `feat: resolve shared project work context`.

## Phase verification

- [x] Re-read `docs/HARNESS_ENGINEERING.md`.
- [x] Run all `tests/project-model-*.test.ts` tests.
- [x] Run `npm test`.
- [x] Run `npm run build`.
- [x] Run `git diff --check`.
- [x] Confirm `src/services/projects.ts`, Discord commands, providers, and `data/projects.json` were not modified.
- [x] Record verification counts and execution notes in this plan.

## Phase completion gate

The phase is complete only when a deployed prototype can be promoted idempotently into one canonical Project Workspace, its prior Harness Runs are permanently represented as Genesis, future work can attach to stable Project Tree nodes, and Web/Discord can later share the same validated project/node/run coordinates without changing the existing Discord project store.

## Execution notes

- Implemented on isolated branch eat/iseol-project-model.
- Project Model focused suite passes 17/17 tests.
- Full project suite passes 98/98 tests.
- TypeScript build and git diff --check pass.
- Existing src/services/projects.ts, Discord command/provider paths, and data/projects.json were not modified.
- Prototype promotion freezes the selected repository branch/commit and deployment snapshot, imports prior Harness Runs as Genesis, and is idempotent on retry.
- Project Tree operations are immutable and destructive delete/reparent operations remain intentionally unavailable in this phase.
