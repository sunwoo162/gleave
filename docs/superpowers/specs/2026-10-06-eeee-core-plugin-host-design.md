# EEEE Core and Plugin Host Design

## Status

Approved conversational design. This document is the architectural authority
for the local Gleave body: EEEE, ISEOL, ClaimLatch, durable state, and the
lightweight Plugin Host. Plugin implementations remain outside this project.

## Intent

Gleave is a local-first personal assistant whose required body is small,
reliable, and useful without optional integrations. EEEE is the user-facing
assistant. ISEOL is the built-in project-execution capability selected by EEEE.
ClaimLatch v0.2.0 is the global trust boundary for AI outputs, actions,
release, and memory promotion.

Optional services such as Google Calendar, Notion, GitHub, Discord, Slack,
mobile clients, and future user-created tools are separate plugins. The core
must not contain their implementation or require their credentials. The core
contains only a lightweight Plugin Host and stable contracts so EEEE can find,
explain, connect, invoke, monitor, and disconnect them at the user's request.

## Success criteria

1. A clean local installation starts EEEE, ISEOL, ClaimLatch integration,
   durable memory/state, the Desktop assistant, and the project view without
   installing optional plugins.
2. The user can say, for example, `구글 캘린더 연결해줘`; EEEE discovers the
   matching plugin, explains requested permissions, asks for approval, guides
   authentication if needed, health-checks the connection, and registers the
   plugin capability.
3. A plugin can be added or removed without changing or rebuilding the EEEE
   core.
4. A project request such as `Todo 앱 만들어줘` creates a project and opens
   its visual organization-map view. The map shows task nodes, dependencies,
   current location, commits, ClaimLatch, QA, evidence, and failures.
5. Every internal or plugin action uses one execution envelope carrying project
   identity, revision, permissions, status, evidence, and trust receipts.
6. The system never claims that a plugin action occurred when the plugin is
   missing, disconnected, unconfigured, denied, or failed.
7. No hosted login service or mandatory central server is introduced.

## Non-goals for the core increment

- Implementing Google Calendar, Notion, GitHub, Discord, Slack, or mobile
  plugin business logic inside Gleave.
- Building a public plugin marketplace or hosted account service.
- Making plugin installation silently grant permissions or external access.
- Moving ISEOL or ClaimLatch into optional plugins; both are part of the body.
- Making portfolio generation a core subsystem. It will consume the same
  project evidence contracts as a later capability/plugin.

## Layered architecture

```text
User
  │ natural language or capability click
  ▼
EEEE Assistant UI
  │ local API
  ▼
EEEE Core Kernel
  ├─ Context / Intent
  ├─ Memory
  ├─ Capability Registry
  ├─ Planner / Action Engine
  ├─ Policy / Approval
  ├─ Event Bus / Notifications
  └─ Evidence Store
       │
       ├────────────── Built-in capabilities ──────────────┐
       │                                                   │
       │  Project Execution → ISEOL                        │
       │  Personal Secretary                               │
       │  Knowledge / Documents                            │
       │                                                   │
       └────────────── Plugin Host ────────────────────────┘
                              │ manifest + local protocol
                              ▼
                    Optional external plugins

All branches pass through:
ClaimLatch → Deterministic QA → Release / Memory Gates
```

### EEEE Core Kernel

The kernel owns intent interpretation, context and memory retrieval,
capability selection, policy checks, user approvals, action lifecycle,
notifications, event publication, and durable evidence references. It does not
implement provider-specific APIs.

### Built-in capabilities

Built-in capabilities are shipped with the body because they define the
product's essential behavior:

- `project-execution`: provisions a Project Runtime and delegates project work
  to ISEOL;
- `personal-secretary`: handles assistant-level planning and local reminders;
- `knowledge-documents`: searches and manages local knowledge and memory;
- `presence`: controls the Desktop surface and future local device bridge.

Each capability uses the same registry and execution envelope as a plugin, but
its implementation is part of the core distribution.

### ISEOL project execution

ISEOL remains a built-in capability implementation, not a plugin. It owns the
project organization and dynamically creates the work structure for a request:

```text
ISEOL Coordinator
  ↓
Task Decomposer
  ↓
Agent Team Factory
  ↓
Specialist Agents
  ↓
Review / Independent QA
  ↓
Integration / Release
```

The user-facing project map is a visual representation of this project task
structure. It is not the EEEE core organization chart and is not a flat run
history list.

### ClaimLatch trust core

ClaimLatch v0.2.0 remains a required cross-cutting body component. It verifies:

- AI claims and summaries before they are reported as facts;
- tool/action requests before side effects;
- ISEOL agent results against the current project revision;
- release decisions together with deterministic QA;
- evidence before project experience is promoted to durable memory.

The ClaimLatch adapter, policy, audit store, and release/memory gates ship with
the core. A future plugin cannot bypass them.

## Shared execution contract

Every capability and tool invocation produces an `ExecutionEnvelope` with:

```text
executionId
requestId
projectId (optional for assistant-only actions)
projectRevision (optional until a project exists)
capabilityId
toolId
actor
inputSchemaVersion
input
status
output
sideEffectLevel
requiredApproval
evidenceIds
claimLatchReceiptId
qaReportId
startedAt / completedAt
error
```

The envelope is persisted locally and published to the event bus. A plugin
must return structured output and evidence references; free-form text alone is
not a successful tool result.

## Plugin boundary

### Plugin manifest

The core only reads a plugin manifest and invokes the declared protocol. A
manifest contains:

- `id`, `version`, and display metadata;
- capabilities and actions provided;
- input and output schema references;
- local process command or local/remote API endpoint;
- requested permissions and side-effect level;
- authentication requirements;
- ClaimLatch policy identifier;
- memory read/write policy;
- health-check endpoint and protocol version.

Plugin implementations live in their own repository, package, or local
directory. They are not imported by the Gleave core at build time.

### Plugin lifecycle

```text
User asks to connect a plugin
  ↓
Discover manifest
  ↓
Show capability, publisher/source, permissions, and authentication needs
  ↓
User approves
  ↓
Install or register outside the core
  ↓
Authenticate through the plugin's declared flow
  ↓
Health check
  ↓
ClaimLatch validates registration/action policy
  ↓
Register capability in EEEE
  ↓
Use / monitor / disconnect from the assistant UI
```

EEEE may automate the lifecycle, but it must pause for approval before
installing unknown code, granting external permissions, sending data, or
creating an external side effect. If no suitable plugin exists, EEEE reports
that it is unavailable instead of silently creating one or pretending it is
connected.

### Protocol choice

The first core implementation uses a versioned local JSON protocol over a
loopback HTTP or subprocess boundary. The contract must be transport-neutral:
the same manifest and envelope can later be implemented with JSON-RPC, MCP, or
another local transport without changing EEEE capability code. Plugins may be
in-process only for trusted development fixtures; production plugin execution
defaults to an isolated process.

## User experience

### Assistant surface

The Desktop assistant shows installed and available capabilities, not the
implementation details of the core:

```text
EEEE
  ├─ 프로젝트 만들기
  ├─ 일정 관리
  ├─ 문서 정리
  ├─ GitHub 연결
  ├─ 캘린더 연결
  └─ 연결된 플러그인 관리
```

The user can click a capability or express the same intent in natural
language. EEEE routes both entry points through the same kernel API.

### Project creation and project map

When the user clicks `프로젝트 만들기` and writes `Todo 앱 만들어줘`, EEEE:

1. selects the built-in `project-execution` capability;
2. provisions a local Project Runtime with a default Documents workspace;
3. delegates planning and execution to ISEOL;
4. opens that project's visual map view;
5. streams task state, current work, commits, changed files, ClaimLatch,
   independent QA, evidence, failures, and retries into the map.

The map uses status and depth to distinguish completed, current, waiting,
blocked, and failed nodes. Clicking a node opens its execution envelope,
troubleshooting, commit, QA, and evidence details.

## Local communication and persistence

The Desktop shell and browser project view communicate with the local EEEE
runtime over loopback HTTP and event polling/streaming. Internal capability and
tool boundaries use the same request/response contracts even when they execute
in-process. SQLite stores project identity, revisions, execution envelopes,
events, evidence, ClaimLatch audit records, memory state, plugin registrations,
and plugin health status.

The core must work with zero external plugins. Missing integrations are
represented as `available`, `not_installed`, `awaiting_authentication`,
`connected`, `disabled`, or `failed`, never as a successful side effect.

## Security and trust rules

- Plugin discovery metadata is untrusted input and cannot alter core policy.
- Unknown plugin code requires explicit user approval before installation or
  execution.
- Permissions are declared, displayed, persisted, and checked per action.
- Secrets are held by the plugin boundary or local secret store and are not
  sent to EEEE event logs or project artifacts.
- ClaimLatch policy and deterministic QA are mandatory for high-risk actions,
  release, and memory promotion.
- Plugin failures are isolated and reported as plugin failures, not kernel
  failures, whenever the core remains healthy.
- Uninstalling or disabling a plugin removes its active capability registrations
  but preserves a local audit record and project evidence.

## Delivery boundaries

The first implementation phase delivers only the body:

1. normalize the EEEE capability/ tool contracts;
2. consolidate ISEOL project execution behind the built-in capability;
3. make ClaimLatch and deterministic QA a single visible trust pipeline;
4. persist execution envelopes, evidence, memory, and plugin registrations;
5. implement the assistant capability surface and project organization map;
6. implement a lightweight Plugin Host with manifest validation and a fake
   local plugin fixture for contract tests.

Actual Calendar, Notion, GitHub, Discord, Slack, and mobile plugins are later
repositories and are not part of this body build.

## Acceptance criteria

- A clean installation can create and run a sample project without plugins.
- The Desktop assistant can route a project request and show its project map.
- ISEOL task state and Git/QA/ClaimLatch evidence appear in the selected map
  nodes.
- An installed fake plugin can be discovered, approved, health-checked,
  registered, invoked, disconnected, and removed without core code changes.
- A denied permission or failed health check prevents the plugin action and is
  visible to the user.
- Existing ClaimLatch, memory, project, desktop, and mobile tests remain green.
- The body can later load a real plugin from a separate repository using only
  the published manifest and execution contract.
