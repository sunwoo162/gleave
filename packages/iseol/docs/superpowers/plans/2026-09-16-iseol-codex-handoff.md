# Iseol Codex Handoff

Use this file as the entry point for Codex execution.

## Required reading order

1. `docs/HARNESS_ENGINEERING.md`
2. `docs/superpowers/specs/2026-09-16-iseol-product-completion-design.md`
3. `docs/superpowers/plans/2026-09-16-iseol-product-completion.md`
4. this handoff file

Use `superpowers:subagent-driven-development` or `superpowers:executing-plans` and execute the master plan task-by-task. Use TDD for every behavior change. Do not open or merge a pull request unless explicitly requested by the user.

## Current branch and checkpoint

Branch: `feat/calendar-code-review`

Relevant commits before this handoff:

- `cf6002fe5440ab60bfcfec86b96c566cd2db8198` — regression test for structured reasoning retry.
- `89e08f1511fde28897aedd274c90672ea8082b67` — generic malformed structured output remains retryable; repeated malformed patch transport remains fail-closed.
- `deb2303bfce732f4a8e6b8409087e3627593364d` — complete product design.
- `ba7ff72780e917d44059bd391bf433c2f5525124` — complete implementation plan.

Latest targeted result before handoff:

```text
25 tests
24 pass
1 fail
```

The failing test is:

```text
Idea Lab retries after structured-result rejection budget instead of permanently failing
```

The current failure is:

```text
Error: ChatGPT Web effective policy digest mismatch
```

This is a **test fixture defect**, not a reason to change `recoverWebWorkerSession()` or relax policy verification.

## First action: finish Task 1 exactly

Modify only `tests/idea-lab-reasoning-budget-retry.test.ts` first.

Change:

```ts
import { mkdtemp } from "node:fs/promises";
```

to:

```ts
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
```

Immediately after creating the temp root, create a real Harness file:

```ts
await mkdir(join(root, "docs"), { recursive: true });
await writeFile(
  join(root, "docs", "HARNESS_ENGINEERING.md"),
  "# Test Harness\n\nOnly operate inside this fixture.\n",
  "utf8",
);
```

Do this **before** calling `bootstrap.createProduction()`.

When moving the generated Run to IMPLEMENT, preserve the real generated preflight:

```ts
await saveHarnessRun(root, {
  ...run,
  state: {
    ...run.state,
    stage: "IMPLEMENT",
    status: "READY",
    completedStages: ["PREFLIGHT", "CONTEXT", "ANALYZE", "PLAN"],
  },
});
```

Delete the manual fake preflight containing:

```ts
effectiveSha256: "policy"
```

Then run:

```powershell
node --import tsx --test `
  tests/idea-lab-reasoning-budget-retry.test.ts `
  tests/idea-lab-production-runtime-driver.test.ts
```

Do not touch production code unless this still fails for a new, reproduced production reason.

If targeted tests pass, immediately run:

```powershell
npm.cmd test
npm.cmd run build
git diff --check
```

Then commit:

```powershell
git add tests/idea-lab-reasoning-budget-retry.test.ts
git commit -m "test: use real policy for reasoning retry recovery"
```

Then run the fresh live smoke from new isolated roots as specified in the master plan. Product implementation starts only after `restart=verified` and `EXIT_CODE=0`.

## Exact architectural clarifications

### Frontend static path

`web/` contains ChatGPT Web worker/session runtime state. Never use it as a Vite output directory and never run a frontend build that empties it.

Use:

```text
apps/iseol-web/dist
```

Change the Web Control Plane static configuration from `webRoot` to a dedicated `staticRoot` whose default is:

```ts
resolve(process.cwd(), "apps", "iseol-web", "dist")
```

### Exact Project Work service signatures

Use these signatures instead of shorthand/ellipsis in the master plan:

```ts
export async function createProjectWorkRequest(input: {
  root: string;
  projectId: string;
  nodeId: string;
  objective: string;
  requestId: string;
  at: string;
}): Promise<ProjectWorkRequest>;

export async function retryProjectWorkRequest(input: {
  root: string;
  projectId: string;
  workId: string;
  at: string;
}): Promise<ProjectWorkRequest>;

export async function cancelProjectWorkRequest(input: {
  root: string;
  projectId: string;
  workId: string;
  at: string;
}): Promise<ProjectWorkRequest>;
```

A repeated `createProjectWorkRequest()` with the same `requestId` and identical identity returns the existing request. The same `requestId` with conflicting project/node/objective must fail with a conflict that the Web router maps to HTTP `409`.

### Exact Discord command location

Create one product command module:

```text
src/commands/iseol.ts
```

Register it through the existing command-registration pattern in `src/register-commands.ts` and the existing interaction dispatch pattern. Do not overload the legacy `project.ts` command with the complete Iseol product surface.

The command exposes subcommands:

```text
/iseol idea
/iseol projects
/iseol status
/iseol history
```

### Promotion regression test call

Use the real exported function input rather than shorthand:

```ts
const first = await promotePrototype({
  modelRoot: root,
  harnessRoot: root,
  prototypeId: candidate.id,
  promotedAt: "2026-09-16T00:00:00.000Z",
});
const second = await promotePrototype({
  modelRoot: root,
  harnessRoot: root,
  prototypeId: candidate.id,
  promotedAt: "2026-09-16T00:00:01.000Z",
});
assert.equal(second.id, first.id);
```

## Execution rules

- Continue from Task 1 through Task 10 without redesigning the product architecture.
- Stop and investigate before changing architecture if three attempted fixes for the same reproduced defect fail.
- Every task gets a fresh test run before a success claim.
- Commit each task independently with an English Conventional Commit.
- Do not create a PR.
- Do not merge branches.
- Do not delete repositories, branches, or unrelated files.
- Do not read, print, request, or persist credentials/environment secrets.
- Do not expose raw chain-of-thought in Web, API, logs, Discord, or persisted product history.

## Final acceptance

Do not call the product complete until all of these are demonstrated in one fresh acceptance cycle:

```text
Idea → multiple runnable prototypes → preview → promotion → Project Workspace
→ new work request → real code change → tests/build → canonical commit
→ deployment/verification when configured → Discord status → Web tree/history
→ process restart → same durable identities recovered
```

The final product statement is:

> 아이디어를 입력하면 이설이 여러 실행 가능한 결과물을 만들고, 마음에 드는 하나를 프로젝트로 확정하면 이후 개발·테스트·커밋·배포의 전 과정을 계속 수행하고 기록한다.
