# Iseol ChatGPT Web Bridge Design

## 1. Purpose

The ChatGPT Web Bridge connects durable Iseol Runs to ChatGPT Web as a replaceable reasoning worker while preserving Iseol Core as the source of truth and Desktop Agent as the only local execution hand.

The bridge owns session lifecycle, prompt compilation, structured reasoning results, recovery, and handoff into the existing Desktop Execution Bridge. A ChatGPT conversation never directly mutates repository state or decides that a Run is complete.

## 2. Goals

This phase must provide:

- durable ChatGPT Web worker session records;
- versioned reasoning-turn contracts;
- prompt compilation from Run, policy, project context, evidence, and prior decisions;
- structured DesktopIntent output instead of raw execution commands;
- validation and compilation of accepted intents into DesktopTaskPack values;
- a HybridStageExecutor that delegates reasoning and deterministic execution to the correct worker;
- same-stage reasoning/execution loops;
- session-loss detection and generation-based recovery;
- a browser-adapter boundary that can change without changing Run semantics;
- deterministic fake-worker E2E before any live browser automation.

Existing Harness, Desktop Agent, Discord, Web Control Plane, and Project Model behavior remain authoritative and additive.

## 3. Non-goals

This phase deliberately does not implement:

- an unrestricted browser-to-shell bridge;
- direct ChatGPT file, Git, deployment, or secret access;
- Idea Lab autonomous idea generation;
- provider-specific deployment automation beyond existing adapters;
- perfect browser UI resilience across every future ChatGPT layout;
- model API migration as a replacement for ChatGPT Web;
- destructive repository operations not already authorized by the Desktop protocol.

The first production target is a recoverable reasoning bridge that can drive one normal feature or bug-fix Run through bounded Desktop intents.

## 4. Component topology

```text
Discord / Iseol Web
        |
        v
Iseol Core
  |- Run Supervisor
  |- Prompt Compiler
  |- Web Worker Session Store
  |- Reasoning Turn Store
  |- HybridStageExecutor
  |- Intent Validator / Task Compiler
  `- Recovery Manager
        |
        +-> ChatGPT Web Browser Adapter
        `-> Desktop Execution Bridge -> Desktop Agent
```

Core owns identity, policy, stage, session generation, turn history, accepted intents, and completion decisions. ChatGPT Web supplies reasoning only. Desktop Agent performs accepted physical execution only.

## 5. Stage ownership

The initial ownership split is explicit:

```text
ChatGPT Web reasoning:
ANALYZE
PLAN
IMPLEMENT
SELF_REVIEW

Desktop Agent deterministic execution:
CONTEXT inspection when required
TEST
COMMIT
local verification

Existing provider adapters:
PR
CI
MERGE
DEPLOY
PRODUCTION_VERIFY
```

Reasoning stages may request bounded Desktop work and continue within the same stage after the result returns. Stage transitions remain controlled only by Run Supervisor completion rules.

## 6. Web worker session contract

A durable worker session record stores coordination metadata, not conversation truth:

```ts
WebWorkerSession {
  version: 1;
  sessionId: string;
  runId: string;
  stage: HarnessStage;
  generation: number;
  conversationRef?: string;
  policySha256: string;
  status: "starting" | "ready" | "busy" | "lost" | "closed";
  createdAt: string;
  lastTurnAt?: string;
  closedAt?: string;
}
```

Only one active generation may own a Run stage. A replacement session increments `generation`; late output from an older generation is rejected.

Raw browser cookies, authentication tokens, full conversation HTML, and credentials are never persisted in this record.

## 7. Reasoning turn contract

Each accepted reasoning exchange becomes a durable turn:

```ts
ReasoningTurn {
  version: 1;
  turnId: string;
  sessionId: string;
  runId: string;
  stage: HarnessStage;
  generation: number;
  promptSha256: string;
  responseSha256: string;
  summary: string;
  decisions: string[];
  desktopIntentIds: string[];
  outcome: "continue" | "stage-complete" | "blocked-user" | "retryable";
  recordedAt: string;
}
```

Large raw prompt/response bodies are stored separately only when policy allows and are referenced by digest. Harness evidence and Project History receive concise summaries and stable references, not full hidden reasoning transcripts.

## 8. Reasoning result envelope

The browser adapter must return a versioned structured result:

```ts
ReasoningTurnResult {
  version: 1;
  runId: string;
  stage: HarnessStage;
  generation: number;
  summary: string;
  decisions: string[];
  intents: DesktopIntent[];
  outcome: "continue" | "stage-complete" | "blocked-user" | "retryable";
  blockerReason?: string;
}
```

A prose statement such as "done" has no completion meaning unless the structured result says `stage-complete` and Core completion requirements are satisfied.

## 9. DesktopIntent contract

ChatGPT Web cannot emit arbitrary shell or filesystem commands. It emits one of a small set of intent kinds:

```text
READ_CONTEXT
PROPOSE_PATCH
RUN_TEST
RUN_BUILD
GIT_INSPECT
REQUEST_COMMIT
CHECK_HTTP
```

Each intent contains `intentId`, `runId`, `stage`, `workspaceRoot`, `policySha256`, and kind-specific bounded arguments. Paths remain workspace-relative unless the existing Desktop protocol explicitly permits otherwise.

Intents never contain:

- raw shell scripts;
- arbitrary secret/environment reads;
- force push/reset/clean/delete-branch requests;
- direct provider credentials;
- unbounded browser automation instructions;
- deployment mutation bypassing provider adapters.

Unknown intent kinds or versions fail closed before Desktop job creation.

## 10. Intent validation and Task Pack compilation

Core validates each intent against:

1. active Run identity and stage;
2. current Web session generation;
3. effective policy digest;
4. target workspace;
5. stage-allowed intent kinds;
6. Desktop protocol capability and operation vocabulary.

Accepted intents are compiled into the existing `DesktopTaskPack`. The compiler never broadens requested access. `PROPOSE_PATCH` becomes guarded `APPLY_PATCH`; test/build intents become structured `RUN_PROCESS`; commit intent becomes `GIT_COMMIT` only after commit policy requirements are satisfied.

A rejected intent becomes a structured reasoning feedback item. ChatGPT may replan within the same stage, but the invalid operation is never dispatched.

## 11. Prompt Compiler

Prompt compilation is deterministic from durable state. The initial prompt contains only the minimum context required for the active stage:

- objective and Run identity;
- current stage and completion criteria;
- effective Harness policy summary plus policy digest;
- project/tree context and relevant prior decisions;
- recent stage evidence and Desktop results;
- explicit allowed DesktopIntent vocabulary;
- recovery marker when this is a replacement generation.

The compiler must not depend on hidden conversation memory. Given the same durable inputs and compiler version it produces the same canonical prompt payload and digest.

Sensitive credentials and raw environment dumps are excluded. Large code/context is referenced or selectively embedded according to bounded context rules.

## 12. HybridStageExecutor

`HybridStageExecutor` implements the existing `HarnessStageExecutor` interface and becomes a routing executor rather than a second Supervisor.

```text
execute(run)
  -> determine owner for current stage
  -> reasoning stage: WebReasoningExecutor
  -> deterministic desktop stage: DesktopExecutor
  -> provider stage: existing adapter executor
  -> return normal HarnessStageExecutionResult
```

The Hybrid executor never mutates Run state directly. It returns `completed`, `waiting-external`, `waiting-agent`, `blocked-user`, `retryable-failure`, or `final-failure` to the existing Run Supervisor.

## 13. Same-stage reasoning/execution loop

A reasoning stage can contain multiple bounded turns:

```text
ChatGPT turn
  -> validate intents
  -> execute Desktop job(s)
  -> persist Desktop evidence
  -> compile feedback prompt
  -> next ChatGPT turn
  -> ...
  -> structured stage-complete
```

The loop has bounded turn and Desktop-job budgets. Repeated identical reasoning failures or repeated rejected intents trigger replan/escalation instead of infinite looping.

## 14. Browser adapter boundary

The browser adapter translates Iseol domain operations into ChatGPT Web UI interactions. It is intentionally narrow:

```text
openOrResumeSession(session, prompt)
submitTurn(session, prompt)
awaitStructuredResult(session, timeout)
probeSession(session)
closeSession(session)
```

No Harness store, Project Model, or Desktop job mutation is implemented inside the browser adapter. UI selectors, browser profiles, tab handles, and ChatGPT-specific navigation remain adapter internals.

The first implementation uses a fake adapter for deterministic tests. Live browser automation is introduced only after contract/recovery tests pass and must remain replaceable.

## 15. Session loss and recovery

A session is considered lost when the adapter proves the conversation/tab cannot be resumed, authentication is unavailable, the structured result deadline expires after connection loss, or the browser process generation is gone.

Recovery sequence:

1. mark the old session generation `lost`;
2. preserve all accepted turns/intents/evidence;
3. load current durable Run state and external/Desktop reality;
4. compile a recovery prompt from the first unfinished verified step;
5. create generation `N+1` for the same Run/stage;
6. resume reasoning without creating a replacement Run.

Late output from generation `N` is rejected after generation `N+1` becomes active. If the old session later becomes reachable it may be closed, but it cannot regain execution ownership.

## 16. Recovery prompt

The recovery prompt includes:

- Run objective and current stage;
- current policy digest and applicable policy summary;
- accepted prior decisions;
- completed evidence and verified Desktop/provider reality;
- unresolved blocker or failed intent summary;
- explicit instruction to continue from the unfinished step rather than repeat verified side effects.

It does not require the old conversation transcript to reconstruct correctness.

## 17. Failure classification

Failures map into existing Harness meanings:

- browser/session temporarily unavailable -> `waiting-external` or recoverable session replacement;
- Desktop Agent unavailable for an accepted intent -> `waiting-agent`;
- user decision required -> `blocked-user`;
- malformed/unsupported reasoning result -> `retryable-failure` with bounded retry;
- stale policy/session generation mismatch -> reject result and recover/recompile;
- repeated invalid structured output after retry budget -> `failed-final` for the stage configuration;
- protected or unauthorized mutation intent -> `blocked-user` or final configuration failure according to policy.

A browser error never silently downgrades authorization or bypasses Desktop guards.

## 18. Durable stores

The bridge introduces append-oriented coordination state under the Harness root:

```text
web-workers/
  sessions/<sessionId>.json
  runs/<runId>/turns.jsonl
  runs/<runId>/intents/<intentId>.json
```

Stores use safe IDs, atomic JSON writes for mutable session/intent envelopes, and append-only turn history. Browser credentials and cookies are excluded.

The Harness Run store remains execution truth. Web-worker records are subordinate coordination artifacts used for audit and recovery.

## 19. Project History and timeline integration

Meaningful ChatGPT reasoning outcomes are recorded as Run/history references with timestamps, not hidden chain-of-thought. The durable record includes summaries, decisions, intent references, worker generation, and `recordedAt`.

Project Tree/History also preserves real provider lifecycle times for GitHub lineage:

- commit: `committedAt`;
- PR: `openedAt`;
- merge: `mergedAt`;
- close: `closedAt`.

History append time is not a substitute for provider event time. Web Workspace renders reasoning turns, Desktop jobs, commits, PR lifecycle, deployments, and verification on one chronological timeline when those timestamps are available.

## 20. Security invariants

The following are mandatory:

- ChatGPT Web cannot invoke Desktop transport directly;
- every mutation intent passes Core validation and Desktop Workspace Guard;
- policy digest and session generation are checked before accepting a turn or intent;
- browser cookies/tokens never enter Harness evidence or Project History;
- raw model hidden reasoning is not required or stored as durable project truth;
- unknown intent/result/session versions fail closed;
- no unrestricted shell field exists in Web reasoning contracts;
- provider mutations continue through existing authenticated adapters;
- stale or late browser output cannot overwrite a newer generation;
- Desktop indeterminate mutations are reconciled before any retry.

## 21. Observability

Iseol Web/Discord may expose:

- active reasoning stage and worker generation;
- session ready/busy/lost state;
- last accepted turn time;
- summarized decisions;
- pending/accepted/rejected Desktop intents;
- Desktop job status and evidence references;
- recovery generation count and blocker reason.

They must not expose browser authentication material, raw hidden reasoning, or unrestricted prompt/response dumps by default.

## 22. Testing strategy

Tests are layered:

1. reasoning/session/intent contract validation;
2. atomic session and append-only turn stores;
3. deterministic prompt compiler snapshots/digests;
4. intent-to-Task-Pack compiler and policy rejection tests;
5. HybridStageExecutor routing tests;
6. fake browser adapter same-stage loop tests;
7. session-loss generation recovery tests;
8. late old-generation result rejection;
9. Desktop Agent offline/indeterminate interaction tests;
10. temporary-repository E2E using fake ChatGPT worker + real Desktop bridge.

Live browser automation is not the first test. The phase first proves deterministic recovery with a fake worker and temporary Git repository. A live ChatGPT Web smoke is added only after those tests are green and must avoid production repository side effects until the browser adapter is proven stable.

## 23. Required recovery scenarios

The suite must explicitly prove:

- reasoning stage starts with no prior conversation;
- same-stage Desktop intent completes and its result feeds the next reasoning turn;
- browser disappears before response -> new generation resumes same Run;
- browser disappears after returning an intent but before Core records it -> intent identity prevents duplicate dispatch;
- old generation returns late after replacement -> result rejected;
- Desktop Agent disconnects during a reasoning-requested mutation -> Run waits/reconciles without duplicate mutation;
- policy changes after prompt compilation -> stale result/intents rejected before mutation;
- user blocker survives session replacement and remains `BLOCKED_USER` until resolved.

## 24. Compatibility and migration

The bridge is additive. Runs without a configured ChatGPT Web worker continue to use existing test/fake executors. Deterministic stages continue using DesktopExecutor directly.

No existing Discord, Web Control Plane, provider polling, Project Model, or Desktop protocol behavior is removed merely to introduce Web reasoning.

The existing `HarnessStageExecutor` interface remains the Supervisor boundary. Hybrid execution is introduced behind that interface so Run Supervisor does not become browser-specific.

## 25. Implementation sequence

Implementation proceeds in this order:

1. versioned Web worker/session/turn/intent contracts;
2. durable session/turn/intent stores;
3. deterministic Prompt Compiler;
4. intent validation and DesktopTaskPack compiler;
5. fake Browser Adapter contract;
6. WebReasoningExecutor same-stage loop;
7. HybridStageExecutor routing;
8. generation/session-loss recovery;
9. fake-worker + real Desktop bridge E2E;
10. production browser adapter boundary and controlled live smoke.

Each unit uses an isolated worktree, TDD, and English Conventional Commit-style commits.

## 26. Production browser adapter boundary

The production adapter may use browser automation capable of opening ChatGPT Web, selecting or resuming a conversation, submitting a compiled prompt, and reading a structured response. The adapter must not expose generic browser control to reasoning contracts.

Authentication is user-managed. If ChatGPT Web authentication is missing or requires material user interaction, the Run enters the appropriate waiting/blocking state instead of attempting credential extraction or bypass.

Selectors/navigation are versioned adapter details. Adapter breakage must be diagnosable without corrupting Run state, accepted intents, or Desktop jobs.

## 27. Phase completion criteria

The ChatGPT Web Bridge phase is complete only when all of the following are proven:

- a preflight-ready reasoning stage can create a durable Web worker session;
- Prompt Compiler produces policy-bound deterministic input from durable Run state;
- fake ChatGPT Web worker can return a valid structured turn result;
- accepted Desktop intents compile into existing guarded DesktopTaskPack values;
- a reasoning-requested repository mutation executes only through Desktop Agent;
- Desktop results can feed another reasoning turn in the same stage;
- structured `stage-complete` advances through existing Supervisor rules;
- lost browser session creates a new generation and resumes the same Run;
- stale/late generation results and stale-policy intents are rejected;
- duplicate mutation is prevented across browser/Desktop interruption;
- prior Iseol tests remain green;
- a temporary-repository E2E succeeds before controlled live ChatGPT Web smoke.

## 28. Next phase boundary

After this phase, Iseol has a durable path from requirement -> ChatGPT Web reasoning -> validated Desktop intent -> guarded Desktop execution -> evidence -> automatic Supervisor continuation.

The following Idea Lab production-loop phase can then reuse this exact reasoning/execution path to generate, implement, test, deploy, and present distinct prototype candidates without creating a separate execution system.
