# Gleave production completion plan

> **Execution note:** Follow the TDD loop for every implementation task: write a failing test, run it to observe the failure, implement the smallest coherent change, then run the focused and full verification suites.

## Goal

Finish the local-first Gleave platform so EEEE is the durable personal-assistant source of truth, ISEOL is the internal project-execution coordinator, ClaimLatch (`claimlatch-v0.2.0`) guards claims and external actions, Notion is the project-document system of record, GitHub/ISEOL review is a first-class project evidence source, and Mobile can remotely control and observe Desktop without owning secrets or state.

## Non-goals

- No hosted account, central database, or mandatory login.
- No Discord project-space orchestration in the core path.
- No provider tokens in the Mobile client.
- No claim that native Android/iOS packaging is complete until a real mobile build target exists; the first completion target is the separately deployable remote client contract.

## Tasks

### Task 1 — Implement the real Notion document adapter and project sync boundary

**RED**

- Add adapter tests for create/read/update requests, API-version headers, normalized error handling, and disabled-token behavior using an in-process HTTP transport.
- Add route/service tests proving a blocked ClaimLatch action makes zero external requests and that a successful sync persists the Notion page reference.

**GREEN**

- Implement a small typed Notion REST adapter behind an interface; keep base URL and API version configurable for deterministic tests.
- Add durable project-document references to the local SQLite store.
- Add EEEE project-document sync service and API boundary with idempotent project identity/revision metadata.
- Gate every Notion write with `TrustGate.verify_action` and expose safe connector status when no token is configured.

**VERIFY**

- Run focused Notion/project-runtime/API tests, then the full EEEE suite.

### Task 2 — Make ClaimLatch a mandatory release boundary for claims, actions, and memory promotion

**RED**

- Add tests for PASS/WARN/BLOCKED outcomes on assistant actions, project evidence ingestion, and memory promotion.
- Prove BLOCKED paths do not persist external completion or promote memory.

**GREEN**

- Centralize the trust decision envelope and wire it into assistant routing, connector writes, project evidence ingestion, and memory promotion.
- Preserve auditable `claimlatch-v0.2.0` profile metadata alongside the engine version for every persisted decision.

**VERIFY**

- Run trust, assistant, memory, project, and restart-persistence tests plus the full suite.

### Task 3 — Connect ISEOL GitHub CI/code-review outcomes to EEEE project evidence

**RED**

- Add a shared `github-review-result.v1` contract test covering project id, head SHA, review status, CI checks, findings, and source provenance.
- Add EEEE ingestion tests for stale revision rejection, accepted evidence persistence, and TrustGate blocking.
- Add ISEOL bridge tests proving a completed review can post the contract to the local EEEE endpoint when configured.

**GREEN**

- Add durable project-evidence storage and an EEEE ingestion route.
- Add a typed ISEOL-to-EEEE local bridge client and connect it to the existing exact-head-SHA review/polling completion path without making it mandatory for legacy standalone ISEOL use.
- Publish accepted review/CI evidence to the Desktop event stream.

**VERIFY**

- Run Python evidence tests, ISEOL build/tests, and a local end-to-end bridge test.

### Task 4 — Make Desktop↔Mobile events cover the real assistant/project lifecycle

**RED**

- Add tests for route-start, route-complete, project-sync, review-evidence, trust-block, and error events.
- Add reconnect/last-event behavior tests for the stream contract.

**GREEN**

- Inject the bridge event sink into canonical EEEE services instead of publishing only from mobile-specific routes.
- Keep events redacted and bounded; never emit provider tokens or full sensitive prompt content.
- Add a typed Mobile client package that pairs, sends commands, reads state, and consumes the Desktop event stream.

**VERIFY**

- Run mobile/API/E2E tests and a TypeScript build for the client package.

### Task 5 — Finish separately deployable Desktop and Mobile release boundaries

**RED/GREEN**

- Add explicit package metadata, environment examples, launch instructions, and extraction checks for `apps/desktop` and `apps/mobile`.
- Document the pairing trust model, local-only mode, approved tunnel mode, and secret ownership.
- Keep the aggregate repository as the development monorepo while making each app independently buildable.

**VERIFY**

- Run repository hygiene, Python compile, ISEOL build, mobile build, and the unified verification script.

### Task 6 — Final review and completion audit

- Review the diff for accidental Discord core dependencies, secret leakage, unguarded external writes, and misleading completion claims.
- Update architecture/operations docs and the SDD ledger with exact verification commands and outputs.
- Run the full verification suite from a clean working tree and only then mark the plan complete.

## Completion criteria

- Notion sync, GitHub review evidence, assistant actions, and memory promotion all pass through auditable ClaimLatch decisions.
- ISEOL review/CI results can reach EEEE and appear in Desktop/Mobile state/events.
- Mobile remains a thin paired remote client and never becomes the source of truth.
- EEEE/ISEOL/ClaimLatch unified verification passes from the aggregate repository.
