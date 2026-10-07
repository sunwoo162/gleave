# EEEE Planning Room Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a durable EEEE Planning Room and connect it to ISEOL so every project is planned, executed, verified, and shown to the user as a detailed interactive organization map with reasons and evidence.

**Architecture:** Add a local SQLite-backed Planning Room service that creates deep or quick planning handoffs. Route all project execution through that handoff, then extend the existing project-view map with planning, agent, QA, ClaimLatch, and memory-promotion nodes. Store an append-only activity ledger linked to project revision, run, artifacts, commits, tests, and trust evidence.

**Tech Stack:** Python 3, FastAPI, Pydantic v2, SQLite, existing EEEE kernel/runtime, existing ISEOL plan bridge, existing ClaimLatch adapter/trust pipeline, existing desktop/static UI, pytest.

**Spec:** `docs/superpowers/specs/2026-10-07-planning-room-design.md`

## Global Constraints

- Planning Room is an EEEE built-in system capability, not an external plugin.
- Direct requests such as “Todo 앱 만들어줘” must run `quick planning`; no project may reach ISEOL without a planning handoff.
- ISEOL owns task decomposition, agent assignment, implementation, code review, QA, integration, and release orchestration.
- ClaimLatch verifies claims, evidence, hashes, test results, project/revision identity, release trust, and memory promotion; it does not replace ISEOL QA.
- User rules override project rules, approved handoff defaults, and agent judgment; safety/integrity policy is the only higher precedence.
- Planning and execution writes must preserve project revision and stale-write protections.
- Existing Todo vertical slice and existing project-map API must remain backward compatible.
- Mobile, external plugin marketplace, calendar adapters, portfolio generation, and new LLM providers are out of scope for this plan.

## Review Focus

- Direct requests must not bypass planning: `quick planning` creates an approved handoff before ISEOL runs.
- Approval and revision races must not create an execution from an unapproved or stale handoff.
- A detailed node must not claim evidence that belongs to another project, revision, task, or run.
- Missing reason/alternative/evidence data must be visible as incomplete or blocked, never silently treated as a completed explanation.
- Existing projects and legacy events must still render safely while new Planning/QA/ClaimLatch nodes are being introduced.

### Task 1: Planning contracts and durable SQLite storage

**Files:**
- Create: `apps/eeee/app/planning/__init__.py`
- Create: `apps/eeee/app/planning/models.py`
- Modify: `apps/eeee/app/storage/sqlite.py`
- Test: `apps/eeee/tests/planning/test_models.py`
- Test: `apps/eeee/tests/planning/test_storage.py`

**Interfaces:**
- Produces `PlanningSession`, `PlanningArtifact`, `PlanningDecision`, and `PlanningHandoff` Pydantic models.
- Produces `SQLiteStore.save_planning_session`, `get_planning_session`, `save_planning_artifact`, `list_planning_artifacts`, `append_planning_decision`, and `save_planning_handoff`.
- Every persisted record carries `project_id`, `project_revision`, and session identity.

- [ ] **Step 1: Write failing model tests**

  Add tests for the exact states `draft`, `interviewing`, `awaiting_approval`, `approved`, `handed_off`, and `blocked`; reject blank identity; reject an approved handoff without acceptance criteria, QA plan, and approval metadata.

- [ ] **Step 2: Run model tests to verify failure**

  Run: `pytest apps/eeee/tests/planning/test_models.py -v`

  Expected: FAIL because the planning package and contracts do not exist.

- [ ] **Step 3: Implement planning models**

  Define frozen, alias-compatible Pydantic models with explicit `mode` (`deep` or `quick`), revision, artifact references, approval metadata, and handoff schema version `planning-handoff.v1`.

- [ ] **Step 4: Write failing SQLite storage tests**

  Verify session/artifact/decision/handoff round trips, append-only decision ordering, project+revision filtering, and stale revision rejection using `StaleProjectRevision`.

- [ ] **Step 5: Run storage tests to verify failure**

  Run: `pytest apps/eeee/tests/planning/test_storage.py -v`

  Expected: FAIL because the tables and store methods do not exist.

- [ ] **Step 6: Add SQLite tables and store methods**

  Add idempotent tables for planning sessions, artifacts, decisions, and handoffs. Use one transaction per mutation; never update an existing decision or handoff in place. Keep legacy database initialization compatible.

- [ ] **Step 7: Run planning tests**

  Run: `pytest apps/eeee/tests/planning -v`

  Expected: PASS.

- [ ] **Step 8: Commit**

  `git add apps/eeee/app/planning apps/eeee/app/storage/sqlite.py apps/eeee/tests/planning && git commit -m "feat: add durable planning room contracts"`

### Task 2: Planning Room interview, quick planning, and approval service

**Files:**
- Create: `apps/eeee/app/planning/service.py`
- Modify: `apps/eeee/app/workflow/planner.py`
- Test: `apps/eeee/tests/planning/test_service.py`

**Interfaces:**
- `PlanningService.start(project: Project, request: RequestBrief, mode: Literal["deep", "quick"]) -> PlanningSession`
- `PlanningService.answer(session_id: str, answer: str, expected_revision: int) -> PlanningSession`
- `PlanningService.approve(session_id: str, expected_revision: int, actor: str) -> PlanningHandoff`
- `PlanningService.quick_plan(project: Project, request: RequestBrief, memory_ids: list[str], qa_baseline_ids: list[str]) -> PlanningHandoff`
- `PlanningService.get_session(session_id: str) -> PlanningSession`

- [ ] **Step 1: Write failing deep-planning tests**

  Assert that starting a deep session produces ordered questions, answering increments revision and appends a decision, incomplete artifacts remain `awaiting_approval`, and approval is rejected until required artifacts and acceptance criteria exist.

- [ ] **Step 2: Write failing quick-planning tests**

  Assert that a Todo request automatically produces requirements, FSD/default-design decisions, acceptance criteria, QA plan, task DAG, and a policy approval with `mode="quick"`.

- [ ] **Step 3: Write failing conflict tests**

  Assert that stale answer/approve calls fail with `StaleProjectRevision`, and that a new plan revision does not mutate an already handed-off plan.

- [ ] **Step 4: Run service tests to verify failure**

  Run: `pytest apps/eeee/tests/planning/test_service.py -v`

  Expected: FAIL because `PlanningService` is not implemented.

- [ ] **Step 5: Implement the service**

  Reuse `parse_request` for the initial intent, use deterministic defaults for quick mode, persist each generated artifact, and emit a single immutable handoff only from `approve`/`quick_plan`. Store the default design baseline and all selected alternatives in the decision log.

- [ ] **Step 6: Run service tests**

  Run: `pytest apps/eeee/tests/planning/test_service.py -v`

  Expected: PASS.

- [ ] **Step 7: Commit**

  `git add apps/eeee/app/planning apps/eeee/app/workflow/planner.py apps/eeee/tests/planning/test_service.py && git commit -m "feat: implement planning room interview and quick planning"`

### Task 3: ISEOL handoff integration and direct-request enforcement

**Files:**
- Modify: `apps/eeee/app/project_runtime/iseol_bridge.py`
- Modify: `apps/eeee/app/project_runtime/provisioner.py`
- Modify: `apps/eeee/app/kernel/capabilities.py`
- Modify: `apps/eeee/app/main.py`
- Test: `apps/eeee/tests/planning/test_handoff_integration.py`
- Test: `apps/eeee/tests/e2e/test_assistant_project_runtime.py`

**Interfaces:**
- Extend `IseolPlanBridge.create_plan(..., planning_handoff: PlanningHandoff) -> dict[str, Any]`.
- Extend `ProjectProvisioner.provision(..., planning_handoff: PlanningHandoff) -> ProjectProvisioningResult`.
- `ProjectExecutionCapability` receives a `PlanningService` and must call `quick_plan` before provisioning direct requests.

- [ ] **Step 1: Write failing handoff contract tests**

  Assert `execution-plan.json` contains `planningSessionId`, `projectRevision`, approval metadata, artifact references, and task DAG while preserving the existing ISEOL schema.

- [ ] **Step 2: Write failing direct-request test**

  Route “Todo 앱 만들어줘” through the kernel and assert a Planning session/handoff exists before the ISEOL child execution and the handoff revision matches the project revision.

- [ ] **Step 3: Write failing approval/revision test**

  Assert an unapproved deep session cannot provision and a stale handoff cannot reach ISEOL.

- [ ] **Step 4: Run integration tests to verify failure**

  Run: `pytest apps/eeee/tests/planning/test_handoff_integration.py apps/eeee/tests/e2e/test_assistant_project_runtime.py -v`

  Expected: FAIL because project provisioning currently builds an ISEOL plan directly from `RequestBrief`.

- [ ] **Step 5: Integrate planning into the kernel**

  Instantiate one `PlanningService` in `create_app`, inject it into `KernelService`/`ProjectExecutionCapability`, require a quick handoff for direct execution, and pass that handoff through provisioner and bridge. Preserve existing document sync, Todo QA, and memory behavior.

- [ ] **Step 6: Run focused and regression tests**

  Run: `pytest apps/eeee/tests/planning apps/eeee/tests/e2e/test_assistant_project_runtime.py apps/eeee/tests/project_runtime -v`

  Expected: PASS.

- [ ] **Step 7: Commit**

  `git add apps/eeee/app/main.py apps/eeee/app/kernel/capabilities.py apps/eeee/app/project_runtime apps/eeee/tests/planning apps/eeee/tests/e2e/test_assistant_project_runtime.py && git commit -m "feat: route project execution through planning handoff"`

### Task 4: Append-only Project Activity Ledger

**Files:**
- Create: `apps/eeee/app/activity/__init__.py`
- Create: `apps/eeee/app/activity/models.py`
- Create: `apps/eeee/app/activity/store.py`
- Modify: `apps/eeee/app/storage/sqlite.py`
- Modify: `apps/eeee/app/kernel/service.py`
- Modify: `apps/eeee/app/planning/service.py`
- Test: `apps/eeee/tests/activity/test_ledger.py`
- Test: `apps/eeee/tests/activity/test_required_reason_evidence.py`

**Interfaces:**
- `ActivityEvent` fields include `event_type`, project/revision/run/node identity, actor, summary, reason, alternatives, selected_because, inputs, outputs, evidence_refs, status, and timestamp.
- `ActivityLedger.append(event: ActivityEvent) -> ActivityEvent`
- `ActivityLedger.list(project_id: str, revision: str, cursor: int = 0) -> ActivityPage`
- `ActivityLedger.require_explanation(event: ActivityEvent) -> None`

- [ ] **Step 1: Write failing ledger tests**

  Assert append-only ordering, cursor pagination, project/revision/run filtering, immutable event retrieval, and required explanation fields for task/decision/commit/review/QA/trust events.

- [ ] **Step 2: Write failing evidence-link tests**

  Assert an event cannot be marked `completed` when its referenced file/commit/test evidence is absent, and legacy summary events remain readable as incomplete rather than being fabricated as verified.

- [ ] **Step 3: Run ledger tests to verify failure**

  Run: `pytest apps/eeee/tests/activity -v`

  Expected: FAIL because the activity package and table do not exist.

- [ ] **Step 4: Implement the ledger**

  Add a SQLite append-only table with a project+revision cursor and canonical JSON hash. Connect kernel lifecycle, PlanningService decisions, ISEOL handoffs, commits, QA reports, ClaimLatch audits, and memory promotion to event append calls.

- [ ] **Step 5: Run ledger tests**

  Run: `pytest apps/eeee/tests/activity -v`

  Expected: PASS.

- [ ] **Step 6: Commit**

  `git add apps/eeee/app/activity apps/eeee/app/storage/sqlite.py apps/eeee/app/kernel/service.py apps/eeee/app/planning apps/eeee/tests/activity && git commit -m "feat: record project activity with evidence"`

### Task 5: Expand the existing project map into the detailed organization graph

**Files:**
- Modify: `apps/eeee/app/project_view/models.py`
- Modify: `apps/eeee/app/project_view/service.py`
- Modify: `apps/eeee/app/api/routes.py`
- Modify: `apps/eeee/app/main.py`
- Test: `apps/eeee/tests/api/test_project_view_routes.py`
- Test: `apps/eeee/tests/project_view/test_organization_graph.py`

**Interfaces:**
- Extend `ProjectMapNode` with optional `reason`, `alternatives`, `selected_because`, `input_artifact_ids`, `output_artifact_ids`, `activity_cursor`, and `trust_blockers` aliases.
- Extend `ProjectMapSnapshot` with `organization_version` and `activity_cursor`.
- Add `ProjectViewService.get_activity(project_id, cursor, revision) -> ActivityPage`.
- Keep `GET /api/projects/{project_id}/map` and `GET /api/projects/{project_id}/map/events` backward compatible; add `GET /api/projects/{project_id}/activity`.

- [ ] **Step 1: Write failing graph tests**

  Assert a completed Todo project contains EEEE/Planning Room, ISEOL Coordinator, decomposed Agent nodes, Review/QA, ClaimLatch, and Memory Promotion nodes with correct parent-child edges and depth.

- [ ] **Step 2: Write failing integrity tests**

  Assert nodes only attach current-revision evidence, missing references produce warnings/unavailable status, blocked ClaimLatch produces a visible blocker, and legacy projects still produce a valid snapshot.

- [ ] **Step 3: Run graph tests to verify failure**

  Run: `pytest apps/eeee/tests/project_view apps/eeee/tests/api/test_project_view_routes.py -v`

  Expected: FAIL because the current map has only the ISEOL root and task-derived nodes.

- [ ] **Step 4: Implement graph projection**

  Project the Planning session/handoff, activity ledger, task leases, QA reports, ClaimLatch audits, and memory candidates into stable node IDs. Use explicit edges for `contains`, `dependency`, `handoff`, and `evidence`; never infer a trusted relationship from timestamps alone.

- [ ] **Step 5: Add the activity API and run tests**

  Run: `pytest apps/eeee/tests/project_view apps/eeee/tests/api/test_project_view_routes.py -v`

  Expected: PASS.

- [ ] **Step 6: Commit**

  `git add apps/eeee/app/project_view apps/eeee/app/api/routes.py apps/eeee/app/main.py apps/eeee/tests/project_view apps/eeee/tests/api/test_project_view_routes.py && git commit -m "feat: expose detailed project organization graph"`

### Task 6: Desktop/project UI for the organization map and drill-down records

**Files:**
- Modify: `apps/eeee/app/static/index.html`
- Modify: `apps/eeee/app/static/app.js`
- Modify: `apps/eeee/app/static/styles.css`
- Test: `apps/eeee/tests/ui_project_map.js`
- Test: `apps/eeee/tests/ui_planning_room.js`

**Interfaces:**
- Consume `GET /api/projects/{project_id}/map` and `/activity`.
- Render node status, current node, ClaimLatch/QA badges, and a selected-node detail panel without exposing raw provider chat.

- [ ] **Step 1: Write failing UI contract tests**

  Assert the project card opens a graph view, the graph shows the EEEE→Planning→ISEOL→QA→ClaimLatch hierarchy, clicking a node opens reason/commit/test/evidence details, and polling advances by cursor without duplicating events.

- [ ] **Step 2: Run UI tests to verify failure**

  Run: `node apps/eeee/tests/ui_project_map.js && node apps/eeee/tests/ui_planning_room.js`

  Expected: FAIL because the existing static UI has no planning graph/detail components.

- [ ] **Step 3: Implement the graph view**

  Add a readable card/graph layout using existing styles and no new frontend framework. Keep Korean as the default UI copy, preserve English selection, show active/blocked states clearly, and make the detail panel scrollable for long evidence and decision records.

- [ ] **Step 4: Implement polling and failure display**

  Use the API cursor, render stale/revision conflict as a visible warning, and show `WARN`/`BLOCK` without presenting the project as complete.

- [ ] **Step 5: Run UI tests**

  Run: `node apps/eeee/tests/ui_project_map.js && node apps/eeee/tests/ui_planning_room.js`

  Expected: PASS.

- [ ] **Step 6: Commit**

  `git add apps/eeee/app/static apps/eeee/tests/ui_project_map.js apps/eeee/tests/ui_planning_room.js && git commit -m "feat: show planning and execution organization map"`

### Task 7: ClaimLatch and memory promotion trace completion

**Files:**
- Modify: `apps/eeee/app/trust/pipeline.py`
- Modify: `apps/eeee/app/integrations/claimlatch_audit.py`
- Modify: `apps/eeee/app/coordinator/service.py`
- Modify: `apps/eeee/app/memory/pipeline.py`
- Test: `apps/eeee/tests/trust/test_planning_claims.py`
- Test: `apps/eeee/tests/memory/test_activity_promotion.py`
- Test: `apps/eeee/tests/e2e/test_todo_generation.py`

**Interfaces:**
- ClaimLatch audit results must accept planning and activity evidence refs.
- Memory promotion must require an ISEOL QA `PASS` and ClaimLatch `PASS` tied to the same project revision/run.

- [ ] **Step 1: Write failing trust tests**

  Assert planning claims, agent reasons, commit refs, QA reports, and release claims are sent to the existing ClaimLatch pipeline and that mismatched evidence produces `WARN`/`BLOCK`.

- [ ] **Step 2: Write failing memory tests**

  Assert only a fully verified project creates memory candidates containing the planning decision, troubleshooting, selected approach, failed alternatives, and reusable QA rule.

- [ ] **Step 3: Run trust/memory tests to verify failure**

  Run: `pytest apps/eeee/tests/trust/test_planning_claims.py apps/eeee/tests/memory/test_activity_promotion.py apps/eeee/tests/e2e/test_todo_generation.py -v`

  Expected: FAIL because planning/activity references are not yet part of the promotion payload.

- [ ] **Step 4: Integrate the shared trust identity**

  Require matching `projectId`, `projectRevision`, and `runId` for planning, QA, ClaimLatch, release, and memory events. Preserve existing advisory/required modes and never promote evidence from a stale revision.

- [ ] **Step 5: Run focused tests**

  Run: `pytest apps/eeee/tests/trust apps/eeee/tests/memory apps/eeee/tests/e2e/test_todo_generation.py -v`

  Expected: PASS.

- [ ] **Step 6: Commit**

  `git add apps/eeee/app/trust apps/eeee/app/integrations/claimlatch_audit.py apps/eeee/app/coordinator/service.py apps/eeee/app/memory apps/eeee/tests/trust apps/eeee/tests/memory apps/eeee/tests/e2e/test_todo_generation.py && git commit -m "feat: trace verified planning outcomes into memory"`

### Task 8: End-to-end verification and documentation

**Files:**
- Modify: `docs/architecture/eeee-platform.md`
- Modify: `docs/operations/local-runtime.md`
- Modify: `README.md`
- Create: `apps/eeee/tests/e2e/test_planning_to_todo.py`

- [ ] **Step 1: Write the live local E2E test**

  Start the local app with a fake deterministic agent runtime and bundled ClaimLatch adapter, submit “Todo 앱 만들어줘”, and assert Planning → ISEOL → scaffold → ISEOL QA → ClaimLatch → release/memory records and organization-map output.

- [ ] **Step 2: Run the E2E test to verify failure or expose missing links**

  Run: `pytest apps/eeee/tests/e2e/test_planning_to_todo.py -v`

  Expected: It either fails at the first missing integration or passes only when every durable link is present; fix the owning task before continuing.

- [ ] **Step 3: Update architecture and operations docs**

  Document the Planning Room modes, organization graph, activity ledger, local ClaimLatch requirements, cursor polling, and how to inspect a completed Todo project without exposing provider chat.

- [ ] **Step 4: Run the complete verification suite**

  Run: `scripts\verify-all.ps1 -Full -PythonPath C:\Users\user\Documents\eeee-platform-env\Scripts\python.exe`

  Expected: unified EEEE / ISEOL / ClaimLatch verification passes with no new failures; existing deprecation warnings may remain explicitly reported.

- [ ] **Step 5: Run repository hygiene checks**

  Run: `git diff --check` and the project’s existing package/test commands.

  Expected: no whitespace errors and all tracked tests pass.

- [ ] **Step 6: Commit documentation and E2E coverage**

  `git add docs README.md apps/eeee/tests/e2e/test_planning_to_todo.py && git commit -m "test: verify planning to todo project lifecycle"`

