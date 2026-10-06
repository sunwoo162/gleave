# Iseol Web Control Plane Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Add a secure first Iseol Web surface that exposes Idea Lab prototypes and promoted Project Workspaces from the same durable Core state.

**Architecture:** Keep the existing GitHub webhook server unchanged. Add a separate Node HTTP control-plane server that defaults to loopback-only access, serves a static no-build dashboard, and routes API calls through pure testable handlers over Project Model/Harness stores. Public binding requires an explicit web token.

**Tech Stack:** TypeScript 7, Node.js 22 `node:http`, vanilla HTML/CSS/JS, existing Project Model/Harness stores, `node:test`, no new runtime dependencies.

**Spec:** `docs/superpowers/specs/2026-09-07-iseol-product-architecture-design.md`

## Global Constraints

- Read `docs/HARNESS_ENGINEERING.md` before every implementation task.
- Iseol Web has two top-level responsibilities: Idea Lab and Project Workspace.
- Idea Lab shows deployed unrelated prototypes and lets the user open their deployment URLs.
- Project Workspace renders promoted project Genesis, Project Tree, History, and Run relationships from durable Core state.
- Web and Discord never maintain separate project truth.
- Existing webhook behavior, Discord commands, provider integrations, and legacy `data/projects.json` remain unchanged.
- External/public web binding must fail closed without authentication.
- All commits use English Conventional Commit-style messages.

---
## File structure

- `src/project-model/prototype-store.ts` — add prototype listing for Idea Lab.
- `src/project-model/workspace-store.ts` — add workspace listing for Project Workspace.
- `src/web-control-plane/contracts.ts` — API request/response and server configuration types.
- `src/web-control-plane/view-model.ts` — compose prototype/project/history/run data into browser-safe JSON.
- `src/web-control-plane/router.ts` — pure route handler for read APIs and authenticated promotion.
- `src/web-control-plane/server.ts` — Node HTTP adapter, security/bind checks, static asset serving.
- `web/index.html` — two-mode dashboard shell.
- `web/app.js` — fetch/render Idea Lab and Project Workspace.
- `web/styles.css` — responsive dashboard styling.
- `tests/web-control-plane-*.test.ts` — store listing, routing, auth, and view-model coverage.

### Task 1: Listable Idea Lab and Project Workspace stores

**Files:**
- Modify: `src/project-model/prototype-store.ts`
- Modify: `src/project-model/workspace-store.ts`
- Create: `tests/web-control-plane-store-listing.test.ts`
- Modify: `package.json`

**Interfaces:**
- Produces: `listPrototypeCandidates(root)`, `listProjectWorkspaces(root)`.

- [x] Write failing tests proving deterministic listing, missing directories returning `[]`, and malformed unrelated files being ignored only when they are not JSON candidates/workspaces.
- [x] Run focused tests and confirm RED.
- [x] Implement sorted listing by `createdAt` then ID while retaining exact stored snapshots.
- [x] Run focused tests plus build and confirm PASS.
- [x] Commit as `feat: list iseol web project state`.

### Task 2: Browser-safe Web view models

**Files:**
- Create: `src/web-control-plane/contracts.ts`
- Create: `src/web-control-plane/view-model.ts`
- Create: `tests/web-control-plane-view-model.test.ts`

**Interfaces:**
- Produces: `buildIdeaLabView(modelRoot)`, `buildProjectWorkspaceView(modelRoot, harnessRoot, projectId)`.

- [x] Write failing tests for prototype cards, deployment links, project tree/history, Genesis Runs, and missing-project `null`.
- [x] Prove view models expose no policy source contents, environment variables, or credentials.
- [x] Run focused tests and confirm RED.
- [x] Implement view models using Project Model stores/history and Harness Run snapshots only where needed.
- [x] Run focused tests plus build and confirm PASS.
- [x] Commit as `feat: build iseol web view models`.
### Task 3: Pure Web API router and promotion auth

**Files:**
- Create: `src/web-control-plane/router.ts`
- Create: `tests/web-control-plane-router.test.ts`

**Interfaces:**
- Produces: `routeWebControlPlaneRequest(request, deps)` returning status, headers, and JSON/text body without opening a socket.
- Routes: `GET /api/idea-lab`, `GET /api/projects/:id`, `POST /api/prototypes/:id/promote`.

- [x] Write failing tests for Idea Lab read, Project Workspace read, 404s, method rejection, and prototype promotion.
- [x] Require a matching bearer token for mutation when a configured token exists; reject missing/incorrect tokens with `401`.
- [x] Run focused tests and confirm RED.
- [x] Implement route parsing with decoded single-segment IDs and no path traversal.
- [x] Promotion calls existing `promotePrototype` and returns the canonical workspace.
- [x] Run focused tests plus build and confirm PASS.
- [x] Commit as `feat: route iseol web control plane api`.

### Task 4: Secure HTTP server adapter

**Files:**
- Create: `src/web-control-plane/server.ts`
- Create: `tests/web-control-plane-server.test.ts`
- Modify: `src/config.ts`
- Modify: `src/index.ts`

**Interfaces:**
- Produces: `resolveWebControlPlaneConfig(env)`, `startWebControlPlaneServer(options)`.

- [x] Write failing tests proving default host is `127.0.0.1`, public bind without token is rejected, and public bind with token is accepted.
- [x] Test HTTP adapter response size limits, JSON request parsing, API delegation, and static-file content types without touching the GitHub webhook server.
- [x] Run focused tests and confirm RED.
- [x] Add optional `ISEOL_WEB_HOST`, `ISEOL_WEB_PORT`, `ISEOL_WEB_TOKEN`, `ISEOL_MODEL_ROOT`, and `ISEOL_RUN_ROOT` config values.
- [x] Start the control plane from `ClientReady` independently of GitHub webhook secret configuration.
- [x] Run focused tests plus build and confirm PASS.
- [x] Commit as `feat: serve secure iseol web control plane`.

### Task 5: Two-mode browser dashboard

**Files:**
- Create: `web/index.html`
- Create: `web/app.js`
- Create: `web/styles.css`
- Create: `tests/web-control-plane-static.test.ts`

**Interfaces:**
- Consumes the Task 3 APIs.
- Produces two visible surfaces: `Idea Lab` and `Project Workspace`.

- [x] Write static contract tests for both top-level modes, prototype deployment links, project tree/history containers, token input, and promotion control.
- [x] Run focused tests and confirm RED.
- [x] Implement Idea Lab cards with title/concept/deployment status/open link/promote action.
- [x] Implement Project Workspace with Genesis summary, product tree, Run references, and chronological history.
- [x] Store an explicitly entered web token only in browser local storage and send it as bearer auth for mutation; never embed a server token in static assets.
- [x] Add loading, empty, unauthorized, and error states.
- [x] Run focused tests plus build and confirm PASS.
- [x] Commit as `feat: add iseol web project dashboard`.

## Phase verification

- [x] Re-read `docs/HARNESS_ENGINEERING.md`.
- [x] Run all `tests/web-control-plane-*.test.ts` tests.
- [x] Run `npm test`.
- [x] Run `npm run build`.
- [x] Run `git diff --check`.
- [x] Confirm existing webhook, Discord command, provider, and legacy project-store files only changed where explicitly planned (`src/config.ts`, `src/index.ts`).
- [x] Start the server on loopback with temporary roots and verify `/`, `/api/idea-lab`, and a missing project response manually.
- [x] Record verification counts and execution notes in this plan.

## Phase completion gate

The phase is complete only when the browser can switch between Idea Lab and Project Workspace, open deployed prototype URLs, promote a prototype through an authenticated API, render the promoted project's Genesis/Tree/History from durable Core state, and the server refuses unsafe public exposure without a token.

## Execution notes

- Implemented the Web Control Plane in isolated branch `feat/iseol-web-control-plane`.
- Added deterministic prototype/project listing over the durable Project Model stores.
- Added sanitized Web view models that expose policy digests but never Harness policy contents, source paths, environment values, tokens, or credentials.
- Added API routes for Idea Lab, Project Workspace lookup, and authenticated idempotent prototype promotion.
- Added an independent Node HTTP server with loopback default binding, mandatory token for non-loopback binding, 64 KiB mutation body limit, JSON validation, and static-root traversal protection.
- Added the two-mode browser dashboard for Idea Lab and Project Workspace with deployment links, promotion, Genesis, Project Tree, Run state, History, token storage, and responsive states.

### Verification evidence

- Web Control Plane focused tests: **19/19 passed**.
- Full repository tests: **117/117 passed**.
- `npm run build`: **passed**.
- `git diff --check`: **passed**.
- Unplanned changes under existing `src/services`, `src/commands`, `src/interactions`, and `data/projects.json`: **0**.
- Loopback smoke: `/` = **200**, `/api/idea-lab` = **200**, missing project = **404**, seeded prototype count = **1**, dashboard HTML contained `Idea Lab`.
- Public binding without `ISEOL_WEB_TOKEN` is rejected by both config resolution and direct server startup.
