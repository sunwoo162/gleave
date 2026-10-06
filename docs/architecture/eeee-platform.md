# EEEE Platform Architecture

`eeee-platform` is one local-first open-source project. EEEE, ISEOL, and ClaimLatch are internal parts of that project, not three products the user must operate separately.

## Product boundary

```text
사용자 요청
   ↓
EEEE Assistant Kernel
   ├─ 상황·의도 해석
   ├─ 비휘발성 기억 검색
   ├─ 최적 capability·connector 선택
   ├─ 계획·승인·자동화
   └─ 사용자에게 결과 보고
          ↓
   Project 요청일 때만
          ↓
Unified Project Runtime
   ├─ Project Profile / revision
   ├─ local workspace / GitHub
   ├─ ISEOL project execution
   ├─ Discord project space
   ├─ Google Calendar schedule
   ├─ Desktop / Mobile surface
   └─ project memory / QA baseline
          ↓
ISEOL
   ├─ task decomposition
   ├─ dynamic Agent teams
   ├─ parallel execution and handoff
   ├─ independent QA
   └─ integration / release
          ↓
Global Trust Layer
   ├─ ClaimLatch integration profile v0.2.0
   ├─ deterministic verification
   ├─ evidence ledger
   ├─ release gate
   └─ memory promotion gate
```

## EEEE chooses the tool

EEEE is the top-level personal assistant. The request is not assumed to be a development request.

| User intent | EEEE capability | Connected tool |
|---|---|---|
| 일정, 약속, 알림, 루틴 | `personal-secretary` | Google Calendar / local scheduler |
| 앱, 서비스, 기능, 프로젝트 | `project-execution` | Project Runtime + ISEOL |
| 문서, 정보, 요약, 검색 | `knowledge-documents` | local files / memory |
| 팀 소통, 프로젝트 방 | `communication` | Discord adapter |
| 바탕화면, 휴대폰, 알림 | `presence` | Desktop widget / Mobile bridge |

Capabilities are registered through a descriptor and selected by the EEEE router. A new capability does not require adding another project-specific branch to the kernel.

## One project creation flow

`ProjectProvisioner` turns one natural-language request into one durable Project Runtime.

1. Issue a stable `projectId` and current `projectRevision`.
2. Parse goal, scope, constraints, schedule, acceptance criteria, and user preferences.
3. Retrieve matching EEEE memories and QA baselines.
4. Create the local workspace and Project Profile.
5. Compose the ISEOL project team and task decomposition policy.
6. Prepare Calendar, Discord, GitHub, and Desktop/Mobile connector plans.
7. Mark missing credentials as `awaiting_configuration`, never as completed.
8. Persist the profile, connector states, provenance, and idempotency keys in local SQLite.

Low-risk inferred values can be filled automatically. High-impact values such as public messages, deletion, deployment, or external writes remain planned until policy and ClaimLatch approval allow them.

## ClaimLatch placement

ClaimLatch is a cross-cutting trust service, not another Agent and not only a final QA step.

- EEEE answer/report gate: verifies AI claims before presenting them as trusted.
- Action gate: verifies Calendar, Discord, GitHub, deployment, and message actions before side effects.
- ISEOL result gate: verifies Agent reports and outcome identity.
- Release gate: combines ClaimLatch, deterministic verification, and independent QA for one project/revision.
- Memory promotion gate: only a completed, independently verified, ClaimLatch-PASS outcome can create trusted memory.

ClaimLatch and deterministic QA answer different questions:

- ClaimLatch asks whether an AI claim or requested action satisfies evidence and policy.
- Deterministic QA asks whether the actual command, file, test, artifact, and revision prove the result.
- Release Gate requires both to agree on the same project identity and revision.

The platform integration profile is `claimlatch-v0.2.0`. Audit records also preserve the actual bundled engine version separately; this is currently `0.3.86` in `packages/claimlatch/package.json` and must be resolved explicitly in the release manifest.

## Local-first operation

The local EEEE process and SQLite database are the source of truth. No EEEE login or hosted control plane is required.

- Desktop is the default local control surface.
- Mobile connects through a paired local bridge or an explicitly approved local sync path.
- Calendar, Discord, and GitHub are optional connectors using credentials supplied by the user.
- Missing connectors remain inspectable as `planned` or `awaiting_configuration`.
- Connector operations use project identity, revision, audit events, and idempotency keys.

## Repository map

```text
apps/eeee/                      EEEE kernel, API, memory, trust, local runtime
packages/iseol                  project execution and Agent organization
packages/claimlatch             bundled ClaimLatch engine
integrations/contracts          versioned cross-runtime schemas
integrations/claimlatch-adapter local ClaimLatch HTTP boundary
docs/                           architecture, operations, specs, plans
scripts/                        local verification and release checks
```

The detailed requirements and implementation sequence are in [`2026-10-06-eeee-personal-assistant-platform-design.md`](../superpowers/specs/2026-10-06-eeee-personal-assistant-platform-design.md) and [`2026-10-06-eeee-personal-assistant-platform-plan.md`](../superpowers/plans/2026-10-06-eeee-personal-assistant-platform-plan.md).
