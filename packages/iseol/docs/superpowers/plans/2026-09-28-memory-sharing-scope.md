# ISEOL personal-memory sharing scope

## Goal

Implement the product-spec requirement that a user can choose the sharing scope of a personal memory, while preserving private-by-default storage and fail-closed team access.

## Scope

- Keep every memory owner-scoped and private unless the owner explicitly selects active teams.
- Persist selected team ids on the owner record; never copy memory contents into team storage.
- Allow active human team members to read only memories explicitly shared with that team.
- Feed shared memories into the existing team-context section of Personal AI only when the authenticated member has team-document context enabled.
- Revoke access immediately when the owner removes a team, the viewer leaves/is removed, or the owner unshares the team.
- Add the sharing controls to the existing Memory Vault without redesigning the approved shell.

## Safety boundaries

- No operational Runtime/Agent changes, UNKNOWN replay, external provider calls, deployment, push, data deletion, or AI Broadcast Room work.
- No memory sharing by default; no public-team visibility is sufficient without active membership.
- Legacy memory JSON without sharing metadata remains private and is normalized in memory.

## TDD checklist

- [x] RED: add service/API/UI tests for explicit sharing, active-member ACL, revocation, and AI team-context inclusion.
- [x] GREEN: implement durable sharing metadata, team ACL, authenticated routes, AI context projection, and Memory Vault controls.
- [x] Add isolated two-account browser coverage for share, reload, team access, and post-leave revocation.
- [x] Verify focused tests, TypeScript, user UI build, product regression, root regression, diff validation, and full isolated browser E2E.
- [x] Record evidence and remaining operational/design/model boundaries in the inventory and development log.

## Verification record

- RED was reproduced before implementation: the new service methods and UI contract were absent.
- A follow-up RED case reproduced stale-scope re-saving after the owner left a team; the replacement-scope membership check now fails closed.
- Focused memory, AI-context, isolation, and UI coverage passed `19/19` after the ACL hardening.
- `npm.cmd run build` and `npm.cmd run user-ui:build` passed; the UI build retained only existing Vite warnings.
- Focused browser coverage passed `memory-sharing`; full isolated browser E2E passed all reported journeys, two-account isolation, reload persistence, and responsive `[390,768,1024,1440]` coverage across `13` routes. The shared-memory path verified team join, owner-selected sharing, member visibility, and post-leave revocation.
- `npm.cmd run test:iseol-user-product` passed `288/288`; `npm.cmd test` passed `668/668`; `git diff --check` reported only existing LF/CRLF normalization warnings and no diff errors.
- Operational Runtime PID `1708`, Desktop Agent PID `22416`, configured dataRoot, stale lock PID `55000`, UNKNOWN records, external providers/connectors, approved design originals, and AI Broadcast Room scope were left untouched.
