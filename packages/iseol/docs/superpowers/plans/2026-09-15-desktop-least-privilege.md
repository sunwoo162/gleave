# Desktop Agent Least-Privilege Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Preserve Iseol test/build/file/Git/HTTP workflows while constraining project code to a dedicated Windows runner identity and workspace-owned process environment.

**Architecture:** Keep existing typed Desktop operations, but tag internal process operations as `test` or `build` and enforce purpose-specific command policy. Run the Desktop Agent under a required OS identity; test/build children receive a scrubbed environment and workspace-owned profile/temp roots. Windows setup scripts create the standard runner account and narrow ACL grants.

**Tech Stack:** TypeScript, Node.js child_process/fs/os/crypto APIs, node:test, PowerShell/Windows ACLs.

**Spec:** `docs/superpowers/specs/2026-09-15-desktop-least-privilege-design.md`

## Global Constraints
- Keep `RUN_TEST`, `RUN_BUILD`, typed Git, file, patch, and HTTP behavior available.
- Do not expose or advertise a generic process capability.
- Test/build child processes must not inherit unrelated application secrets.
- Recursive cleanup is limited to `<workspace>/.iseol/jobs/<digest>`.
- Agent startup fails closed when the configured execution user does not match the actual OS user.
- Do not push or clean the parent's `data/` or `web/web-workers/` directories.

---

### Task 1: Bound internal process operations by purpose

**Files:**
- Create: `src/desktop-agent/process-policy.ts`
- Modify: `src/desktop-agent/contracts.ts`
- Modify: `src/desktop-agent/operation-policy.ts`
- Modify: `src/chatgpt-web/intent-compiler.ts`
- Modify: `src/idea-lab/production-desktop-compiler.ts`
- Test: `tests/desktop-agent-contracts.test.ts`
- Test: `tests/chatgpt-web-intent-compiler.test.ts`
- Test: `tests/idea-lab-production-desktop-compiler.test.ts`

**Interfaces:**
- Produces `RunProcessPurpose = "test" | "build"`.
- Produces `assertBoundedProcessRequest(purpose, executable, args)`.
- `RunProcessOperation` gains required `purpose`.
- [ ] **Step 1: Write failing purpose-policy tests**

Add cases proving missing/unknown process purpose fails, `npm install`/`npm exec`/arbitrary Node scripts fail, and bounded test/build verbs pass.

- [ ] **Step 2: Run focused tests and observe RED**

Run: `node --import tsx --test tests/desktop-agent-contracts.test.ts tests/chatgpt-web-intent-compiler.test.ts tests/idea-lab-production-desktop-compiler.test.ts`

- [ ] **Step 3: Implement purpose tagging and command policy**

Map `RUN_TEST -> purpose: "test"` and `RUN_BUILD -> purpose: "build"`. Map deterministic Idea Lab TEST to `purpose: "test"`. Reject shells, install/exec commands, arbitrary Node entrypoints, unsafe absolute/path-traversal arguments, and Git through `RUN_PROCESS`.

- [ ] **Step 4: Run focused tests to GREEN**

- [ ] **Step 5: Commit**

`git commit -m "feat: bound desktop process purposes"`

### Task 2: Sandbox test/build process environment

**Files:**
- Modify: `src/desktop-agent/process-policy.ts`
- Modify: `src/desktop-agent/runtime.ts`
- Test: `tests/desktop-agent-runtime.test.ts`

**Interfaces:**
- Produces `processJobTempRoot(workspace, jobId)` using a digest, never raw job id path input.
- Produces `createSandboxedProcessEnv(baseEnv, tempRoot)`.
- Produces guarded cleanup that only removes descendants of `<workspace>/.iseol/jobs`.

- [ ] **Step 1: Write RED tests for secret stripping and redirected profile paths**

Spawn an approved test helper and assert a marker secret is absent while `HOME`, `USERPROFILE`, `APPDATA`, `LOCALAPPDATA`, `TEMP`, npm/Gradle/.NET caches resolve under the workspace job directory.

- [ ] **Step 2: Write RED cleanup escape test**

Prove cleanup rejects workspace root, parent paths, AppData-like absolute paths, and caller-controlled locations.

- [ ] **Step 3: Implement scrubbed env, job temp creation, and guarded cleanup**

Only inherit required OS/toolchain locator variables; never inherit `NODE_OPTIONS` or unrelated credentials.

- [ ] **Step 4: Run runtime tests to GREEN and commit**

`git commit -m "feat: isolate desktop process environment"`
### Task 3: Require dedicated OS execution identity

**Files:**
- Modify: `src/desktop-agent/agent-service.ts`
- Test: `tests/desktop-agent-bootstrap.test.ts`

**Interfaces:**
- `DesktopAgentClientConfig` gains `executionUser: string`.
- `resolveDesktopAgentClientConfig` reads required `ISEOL_DESKTOP_AGENT_EXECUTION_USER`.
- Persistent Agent compares `os.userInfo().username` to configured user before connecting.

- [ ] **Step 1: Write RED config and identity tests**

Prove a missing execution user is rejected, a mismatched actual OS user prevents `connect`, and a matching identity connects.

- [ ] **Step 2: Write RED capability test**

Capture the Agent hello and assert capabilities are exactly `files`, `test`, `build`, `git`, `http`, with no generic `process`.

- [ ] **Step 3: Implement identity guard and typed capability advertisement**

Use Node OS identity, not an environment variable, as the authority.

- [ ] **Step 4: Run bootstrap tests to GREEN and commit**

`git commit -m "feat: require desktop runner identity"`

### Task 4: Add Windows runner and ACL setup

**Files:**
- Create: `scripts/windows/setup-iseol-runner.ps1`
- Create: `scripts/windows/start-iseol-runner.ps1`
- Create: `tests/desktop-agent-windows-hardening.test.ts`

- [ ] **Step 1: Write RED structural script tests**

Assert setup requires elevation, creates/reuses a non-admin local account, never adds Administrators membership, grants Modify only to explicit workspace roots, grants RX only to explicit source/policy roots, and prompts securely for credentials.

- [ ] **Step 2: Implement setup script**

Use `New-LocalUser`, `Read-Host -AsSecureString`, and explicit `icacls` grants. Only grant traverse on parent directories needed to reach configured roots.

- [ ] **Step 3: Implement launcher**

Use `Get-Credential`/`Start-Process -Credential`; do not persist a password. Launch only the Desktop Agent with an Agent-only env file.

- [ ] **Step 4: Run script structure tests to GREEN and commit**

`git commit -m "feat: add isolated windows desktop runner"`
### Task 5: Verification and integration

**Files:** all files changed above.

- [ ] **Step 1: Run focused Desktop/ChatGPT/Idea Lab tests**

Run the affected test files directly with `node --import tsx --test`.

- [ ] **Step 2: Run the repository's official suite**

Use the package.json official test file list with the same `.env` handling used by the parent checkout. Record the pre-existing stale `idea-lab-production-desktop-compiler.test.ts` jobId expectation separately if it is outside the official suite.

- [ ] **Step 3: Run TypeScript build and `git diff --check`**

- [ ] **Step 4: Security spot checks**

Verify no generic `process` capability remains in Agent hello, no child inherits a marker secret, unsafe process verbs fail closed, and runner mismatch fails before connect.

- [ ] **Step 5: Local integration**

Fast-forward merge verified commits into `feat/calendar-code-review`. Do not push. Do not delete or clean parent `data/` or `web/web-workers/`.

## Self-review
- Spec coverage: purpose-bound process, scrubbed child env, workspace-owned temp cleanup, OS identity, ACL setup, typed capabilities, and verification are all mapped to tasks.
- Placeholder scan: no deferred implementation placeholders remain.
- Type consistency: `RunProcessPurpose`, `purpose`, and `executionUser` names are consistent across producer/runtime/bootstrap tasks.
