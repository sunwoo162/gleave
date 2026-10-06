# Iseol Product Architecture Design

## 1. Product definition

Iseol is an AI development orchestration system that helps a user discover ideas, turn selected ideas into real projects, and operate those projects through a disciplined development process.

Iseol has two primary product modes:

1. **Idea Lab** — repeatedly produce and deploy completely different web-product ideas so the user can try them.
2. **Project Workspace** — after the user selects one deployed web product, promote it into a long-lived project and manage its structure, history, development, reviews, integrations, and releases.

The same harness engine is reused in both modes. The difference is whether the harness starts from zero or extends an existing canonical codebase.

## 2. Core principles

- ChatGPT Web is the primary reasoning and conversational worker.
- Iseol is the supervisor, source of truth, and project orchestrator.
- Desktop Agent is the execution hand for files, terminal, local servers, Git, tests, and browser work.
- Discord is the remote-control and notification surface for established projects.
- Iseol Web is the visual control center for Idea Lab and Project Workspace.
- A user should normally start one Run once; Iseol should continue until the target is reached or a real human decision is required.
- A broken browser session, process, network connection, or desktop agent must not destroy the Run.

## 3. Idea Lab

Idea Lab exists to discover *what to build*.

The goal is not to create visual variants of the same product. It is to generate many substantially different web-product ideas, implement each far enough to be meaningfully experienced, test them, and deploy them.

Typical flow:

```text
idea seed / constraints
  -> idea generation
  -> idea selection for prototype production
  -> implementation harness
  -> build/test
  -> deployment
  -> user tries deployed web
  -> keep producing more ideas
```

Prototype candidates are intentionally lightweight in project-management overhead. They do not automatically become full Iseol projects.

A prototype is promoted only when the user explicitly chooses it as a project worth developing further.

Candidate metadata should include at minimum: identity, short concept, repository/worktree reference, harness run references, deployment URL, build/test status, created time, and promotion state.

## 4. Promotion into Project Workspace

When a prototype is selected, Iseol creates a canonical project from that exact codebase rather than regenerating it.

Promotion performs four jobs:

1. Freeze the selected repository/branch/deployment as the project genesis reference.
2. Import the selected prototype's existing harness history into the project's permanent history.
3. Create project structure and integration state for future work.
4. Enable the Discord project controls and full Project Workspace UI.

Rejected prototypes may remain archived as experiments, but they do not receive full project-management treatment by default.

The selected project then evolves incrementally:

```text
canonical codebase
  + new requirement
  -> feature/task structure
  -> AI Run
  -> branch/worktree
  -> implementation
  -> test/review
  -> PR/CI
  -> merge/deploy/verify
  -> project history update
```

Project development must extend the existing codebase through normal Git history. Rebuilding the project from scratch for each request is explicitly out of scope.

## 5. Iseol Web

Iseol Web has exactly two top-level product responsibilities.

### 5.1 Idea Lab surface

The Idea Lab shows produced prototypes and lets the user open their deployed URLs and experience them. It is a discovery surface, not the permanent project record.

The user can inspect basic prototype metadata and promote a chosen prototype into a Project Workspace.

### 5.2 Project Workspace surface

Project Workspace is the long-lived project operating system. It begins when a prototype is promoted, then imports that prototype's prior history as **Genesis** and records all future work continuously.

The Workspace should expose:

- project overview and health
- project tree
- features and tasks
- AI Runs and recovery state
- Git commits, branches, PRs, reviews, and CI
- Figma, Notion, and Calendar links/state
- deployments and verification
- decisions and blockers
- complete chronological history

The web UI is therefore both a control center and an auditable development record.

## 6. Project tree

The project tree is the structural view of the established project. It must represent meaningful product and development units rather than mirror the filesystem.

Example:

```text
Project
├─ Genesis
├─ Authentication
│  ├─ Login
│  ├─ Signup
│  └─ Session
├─ Profile
│  ├─ View
│  └─ Edit
└─ Notifications
```

Each node can own requirements, tasks, AI Runs, decisions, related Figma/Notion references, branches, commits, PRs, reviews, deployments, and history events.

The tree gives Discord and Web a shared project coordinate system: a code review, Git log, Figma link, or AI task is attached to the relevant node instead of existing as an unrelated bot command.

The tree is mutable as the project becomes more concrete. Iseol may propose structural changes, but destructive reorganizations of established project history require explicit user approval.

## 7. Mandatory harness-engineering preflight

Every Iseol development Run — both Idea Lab prototype production and Project Workspace development — must begin with a mandatory harness preflight before any analysis, code change, test creation, branch mutation, PR action, or deployment action.

Iseol maintains a global `docs/HARNESS_ENGINEERING.md` that defines common execution discipline. A target repository may additionally provide its own `docs/HARNESS_ENGINEERING.md` with project-specific invariants. Both layers are read when the project-specific document exists.

The preflight sequence is:

```text
Run requested
  -> read Iseol global HARNESS_ENGINEERING.md completely
  -> locate/read target project HARNESS_ENGINEERING.md when present
  -> read project AGENTS.md and relevant local rules
  -> resolve project context
  -> compile effective Run policy
  -> record loaded document hashes/versions
  -> only then begin development work
```

If the mandatory global harness-engineering guidance cannot be found or read, the Run must not silently continue as if the policy did not exist. It enters a recoverable blocked state and reports the missing prerequisite. A configured project-specific harness document is handled the same way if it becomes unavailable.

The harness-engineering guidance is authoritative for execution discipline; project-local AGENTS.md may add stricter project rules but must not weaken global safety, recovery, verification, or audit requirements.

Iseol records which harness-engineering document version/hash was loaded for every Run so later history can explain which execution policy governed the work.

## 8. AI execution model

ChatGPT Web is treated as an execution worker, not as durable state. Iseol owns the durable Run state and may attach one or more ChatGPT conversations to the same Run.

A normal execution path is:

```text
Discord/Web action
  -> Run creation
  -> harness preflight
  -> context compilation
  -> ChatGPT Web session launch/resume
  -> desktop/tool execution
  -> checkpoint updates
  -> next stage automatically
```

The initial prompt must contain the goal, current project context, effective harness policy, current Run stage, required completion criteria, and relevant prior decisions.

Iseol must not interpret a conversational statement such as "implementation complete" as Run completion. Completion is determined by the Run state machine and explicit target criteria.

If a ChatGPT conversation becomes unavailable or unsuitable, Iseol creates or reuses another conversation and injects a recovery prompt generated from durable Run state.

## 9. Run state machine

A Project Workspace development Run is durable and stage-driven. The default software-delivery path is:

```text
PREFLIGHT
-> CONTEXT
-> ANALYZE
-> PLAN
-> IMPLEMENT
-> TEST
-> SELF_REVIEW
-> COMMIT
-> PR
-> CI
-> MERGE
-> DEPLOY
-> PRODUCTION_VERIFY
-> DONE
```

Stages may be skipped only when the effective harness policy proves they are not applicable; skips are recorded with reasons.

The Run Supervisor, not the ChatGPT conversation, decides whether another stage remains. It automatically advances successful Runs instead of waiting for repeated user messages such as "go", "continue", or "next".

A Run can also enter `WAITING_EXTERNAL`, `WAITING_AGENT`, `RECOVERING`, `BLOCKED_USER`, `FAILED_RETRYABLE`, `FAILED_FINAL`, `PAUSED`, or `CANCELLED`.

The terminal success condition is explicit and normally includes deployment plus verification, not merely local implementation.

## 10. Checkpoints and recovery

Every meaningful transition writes a durable checkpoint. At minimum, checkpoints cover stage transitions, repository/worktree identity, branch, relevant file changes, test/build outcomes, commits, PRs, CI runs, deployment identifiers, decisions, blockers, and conversation/session references.

Recovery follows this order:

1. load durable Run state
2. inspect current external reality (Git working tree, GitHub, CI, deployment, agent availability)
3. reconcile state rather than blindly repeating the last command
4. rebuild the minimum context needed for the current stage
5. launch or resume a ChatGPT Web worker
6. continue from the first unfinished verified step

Operations with external side effects must be idempotent or guarded by reconciliation. For example, PR creation checks for an existing Run-linked PR first, and deployment checks whether the target commit is already deployed.

Process crashes, ChatGPT tab loss, browser restart, network interruption, and Desktop Agent disconnects are recoverable conditions, not automatic Run failures.

After a Desktop Agent reconnects, Iseol searches for incomplete eligible Runs and resumes them according to policy.

## 11. Discord role

Discord becomes most important after a prototype is promoted into a Project Workspace. It is the project's remote control, approval surface, and notification channel.

Existing Iseol bot capabilities remain first-class and are attached to project/tree context rather than removed:

- Git log and repository status
- pull requests and issues
- code review
- CI/build status
- Figma
- Notion
- Google Calendar
- deployment status
- project channels and alerts
- AI Run start/pause/resume/cancel controls

Discord should optimize for quick actions and concise status. Detailed structure, audit history, long logs, and cross-project analysis belong in Iseol Web.

A Discord action that starts development creates the same durable Run model as a Web action. Discord and Web are two control surfaces over the same Iseol Core, never separate project states.

## 12. Autonomy and approval boundaries

The default is autonomous continuation. Iseol should not request approval for routine reversible development work merely because a stage changed.

Routine autonomous actions include analysis, branch/worktree creation, code edits, tests, local builds, ordinary commits, PR creation/update, CI observation, non-destructive preview deployment, and recovery of an already authorized Run.

User intervention is reserved for genuinely material decisions or unavailable credentials/permissions, including destructive data migration, irreversible production operations, paid purchases, secret acquisition, external account authorization, or ambiguous product decisions whose alternatives materially change intended behavior.

When human input is required, the Run enters `BLOCKED_USER`, preserves all progress, sends a concise Discord/Web decision card, and resumes automatically after the decision is recorded.

Broad user delegation increases operational autonomy but does not erase these explicit safety and irreversibility boundaries.

## 13. Harness architecture carried forward

Iseol adopts the proven contract-first ideas from the existing Bloom Harness while avoiding Bloom-specific product invariants.

The reusable foundation is:

- versioned project manifest
- deterministic task packs
- common agent input/output contract
- structured evidence contract
- durable Run artifact store
- completion gates based on evidence
- interrupted-run reconciliation
- evaluation/benchmark harness

Project-specific invariants remain in each project's harness-engineering guidance and manifest. Iseol never assumes that a BloomBouquet repository rule applies to an unrelated project.

For every Run, the effective policy snapshot records both the global Iseol harness version and the target project's harness document/manifest version or digest.

Unknown required contract versions fail closed before side effects. Inferred configuration is marked as inferred and must never silently grant write, GitHub, or deployment permission.

## 14. Run artifacts and evidence

A successful Run is not defined by prose. Claims must be backed by structured evidence.

A durable Run stores or references:

```text
request
policy/manifest snapshot
selected task pack
plan and stage state
event stream
conversation/session references
command/test/build evidence
file/commit/PR evidence
review/CI evidence
deployment/verification evidence
blockers and decisions
final result/retrospective
```

Secrets and raw credentials are never persisted in Run evidence. Large logs are stored separately and referenced by path/digest.

Completed evidence and policy snapshots are append-oriented so Project History can explain exactly what happened and recovery can reconstruct the Run without relying on conversational memory.

The Project Workspace renders this structured evidence into human-readable timelines, tree-node history, status cards, and decision records.

## 15. Figma and external integration policy

Integrations are adapters behind Iseol Core. GitHub, Figma, Notion, Calendar, deployment providers, Discord, and Desktop Agent must not define project state independently.

Figma reads use a cache-first policy:

1. reuse Run/project-local cached context when still valid;
2. deduplicate identical in-flight reads;
3. inspect existing code/assets/tokens when sufficient;
4. make the minimum necessary provider read;
5. on provider rate limit, do not retry aggressively;
6. use valid stale context when policy permits and label it stale;
7. otherwise block only the work requiring unavailable Figma data.

Iseol must not attempt to bypass provider quotas or restrictions. The goal is to remove waste through caching, batching, deduplication, and clear fallback behavior.

Provider responses relevant to a Run become evidence or cached context with provenance and timestamps, not untracked conversational facts.

## 16. Core component boundaries

```text
Discord / Iseol Web
        |
        v
Iseol Core
  |- Project Registry
  |- Idea Lab
  |- Project Tree
  |- Context Builder
  |- Harness Policy Resolver
  |- Prompt Compiler
  |- Run Supervisor
  |- Checkpoint/Recovery Manager
  |- Evidence/History Store
  `- Integration Adapters
        |
        +-> ChatGPT Web Bridge
        +-> Desktop Agent
        +-> GitHub
        +-> Figma
        +-> Notion
        +-> Calendar
        `-> Deploy providers
```

Iseol Core owns identity and orchestration. UI clients issue commands and render state. Adapters translate provider APIs into Iseol events/evidence. Workers perform execution but do not own durable Run truth.

## 17. Delivery sequence

Implementation is incremental so existing bot functionality remains usable throughout migration.

1. **Harness policy foundation** — add Iseol harness guidance, project manifest/policy resolver, Run contracts, evidence model, and mandatory preflight.
2. **Durable Run core** — Run store, stage state machine, events, checkpoints, completion gates, reconciliation, and recovery.
3. **Project model** — prototype promotion, Genesis import, Project Tree, feature/task ownership, and shared context IDs.
4. **Web foundation** — Idea Lab and Project Workspace over the same Core APIs/state.
5. **Discord contextualization** — attach existing Git log, review, Figma, Notion, Calendar, CI, and deployment controls to Project/Tree/Run context.
6. **Desktop execution bridge** — authenticated agent presence, repository execution, heartbeat, disconnect/reconnect recovery.
7. **ChatGPT Web bridge** — launch/resume conversations, compile prompts, detect session loss, inject recovery context, and hand progress back to Run Supervisor.
8. **Idea Lab production loop** — generate multiple distinct web ideas, implement/test/deploy prototypes, then support explicit promotion.
9. **Evaluation and hardening** — interrupted-run, duplicate-side-effect, failing-CI, deployment, permission, and long-running E2E benchmarks.

No phase removes working Iseol capabilities merely to fit the new architecture. Existing behavior is migrated behind the new Core progressively.

## 18. Testing and evaluation

The architecture requires more than unit tests. Required coverage includes:

- contract/schema validation tests
- harness-preflight fail-closed tests
- state-machine transition tests
- checkpoint persistence/reload tests
- duplicate PR/deploy prevention tests
- ChatGPT/session-loss recovery tests using controlled fakes before live automation
- Desktop Agent disconnect/reconnect tests
- provider rate-limit/cache fallback tests
- Discord/Web shared-state tests
- prototype promotion and Genesis import tests
- production verification/completion-gate tests

Stable benchmark Runs should measure completion rate, human intervention count, recovery success, duplicate-side-effect count, verification pass rate, review escapes, runtime, and provider/model/tool cost where observable.

Live E2E is introduced after deterministic local contract/recovery tests pass. Test repositories and preview/sandbox deployments are preferred until production-side behavior is proven safe.

## 19. Success criteria

The target architecture is working when:

- Idea Lab can hold multiple unrelated deployed web prototypes and open them for real use.
- A selected prototype can be promoted without regenerating its codebase.
- Promotion imports its prior implementation/deployment history as Genesis.
- Project Workspace can represent ongoing product structure through a mutable project tree.
- Existing Discord project capabilities operate against that same project/tree/Run state.
- every development Run proves that harness-engineering guidance was read before work began.
- one authorized Run can progress through implementation, review, CI, deployment, and verification without repeated "continue" prompts.
- worker/session/agent interruption can recover from durable state instead of starting the task over.
- duplicate external side effects are prevented during recovery.
- completion requires structured evidence for the configured quality/deployment gates.
- Web provides an understandable record of both the selected project's Genesis and all subsequent development.

## 20. YAGNI and first-production target

The first useful production target is not perfect autonomous software engineering. It is a reliable Project Workspace Run that completes a common feature or bug-fix flow with durable state, minimal human intervention, and safe recovery. Idea generation scale and sophisticated browser automation are expanded only after that core is trustworthy.
