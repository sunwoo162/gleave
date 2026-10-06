# Project Workspace diff-aware preview

## Goal

Complete the locally verifiable Project Workspace file-viewing slice from the ISEOL product direction without weakening owner/team ACLs, path containment, text-size bounds, or the read-only UI boundary.

## Scope

- Detect a bounded unified diff only after an authenticated user requests a real workspace file.
- Return structured diff metadata while preserving the original bounded content.
- Render additions, deletions, context, and hunk headers distinctly in the existing readable work surface.
- Keep binary, invalid UTF-8, secret-like, oversized, symlink, and unsafe-path files unavailable; never decode or display them.
- Verify service, API contract, UI contract, isolated browser flow, builds, full product regression, and root regression.

## Out of scope

- Editing, applying, staging, committing, or reverting patches.
- Reading the operational Runtime workspace or replaying UNKNOWN requests.
- External AI/provider calls, connector mutations, deployment, push, or approved-art source changes.
- A final visual redesign beyond the existing approved project-workspace information hierarchy.

## Checklist

- [x] Add RED service/API/UI tests for diff metadata and binary-safe messaging.
- [x] Implement a bounded unified-diff parser and extend the file preview contract compatibly.
- [x] Render the structured diff in the Project Workspace with accessible labels and read-only messaging.
- [x] Extend the isolated browser fixture to exercise a real diff file.
- [x] Run focused tests, both builds, product/root regressions, browser E2E, and safety checks.
- [x] Update the feature inventory and autonomous development log with exact evidence and boundaries.

## Verification record

- RED: the new service test observed no diff metadata and therefore failed before implementation.
- GREEN: focused project service/API/UI checks passed `41/41`.
- `npm.cmd run build` and `npm.cmd run user-ui:build` passed; the UI build retained only the existing Vite native-config and chunk-size warnings.
- `npm.cmd run test:iseol-user-product` passed `295/295`; `npm.cmd test` passed `669/669`.
- Full isolated browser E2E passed the real Local Agent project flow, including `change.patch` selection, structured `+1 추가` diff rendering, `image.bin` binary-blocker rendering without byte exposure, account isolation, reload persistence, and responsive `[390,768,1024,1440]` coverage across `13` routes.
- The first browser pass caught a strict selector collision caused by the new read-only explanatory copy; the selector was narrowed to the file-size metadata span and the complete E2E rerun passed.
- Safety: operational Runtime PID `1708`, Desktop Agent PID `22416`, ports `18890`/`18891`, configured dataRoot, stale lock PID `55000`, UNKNOWN records, external services, approved design sources, and AI Broadcast Room files were untouched. No process restart, external request, deployment, push, or data deletion occurred.
