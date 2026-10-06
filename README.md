# EEEE Platform

Local-first personal assistant platform combining:

- EEEE: the user's personal assistant, project portfolio, approval layer, and persistent memory.
- ISEOL: the Harness Coordinator that owns Agent organization, task decomposition, execution, integration, QA, and Agent evaluation.
- ClaimLatch: the evidence-backed reliability gate for factual claims, Agent reports, final reports, and memory candidates.

The platform is designed to run on one local computer without a hosted login or central server. Discord, desktop widget, mobile clients, calendar, and other channels are adapters around the local core rather than the core itself.

## Repository layout

~~~text
apps/eeee                 Python EEEE application
packages/iseol            TypeScript ISEOL Agent runtime
packages/claimlatch       ClaimLatch verification engine
integrations/contracts    Versioned cross-runtime contracts
integrations/claimlatch   Local ClaimLatch adapter
docs                      Architecture, plans, and operations
scripts                   Local repository and verification scripts
~~~

## Core trust flow

~~~text
EEEE request
  -> Project Brief
  -> ISEOL Agent teams
  -> independent QA and deterministic evidence
  -> ClaimLatch report verification
  -> Project Outcome Report
  -> EEEE persistent memory candidate
  -> approved/scoped memory used by the next project
~~~

Code behavior is verified deterministically. Natural-language factual claims and release reports are verified through ClaimLatch. A verification failure never becomes a trusted release or active memory rule.

ClaimLatch text verification returns the versioned `VerificationEnvelopeV1`. EEEE stores the request payload hash, report ID, optional receipt ID, policy version, adapter version, ClaimLatch version, project revision, and full envelope in the same local SQLite database as project state and memory. Replaying one subject at the same revision with a different payload or policy metadata is rejected; a stale revision is rejected before the adapter is called when a current-revision resolver is configured.

ISEOL QA is an independent release gate, not an Agent completion message. `QaPlan` creates QA-0 through QA-5 checks, `QaOrchestrator` requires executable command evidence, `EvidenceLedger` records exit status and stdout/stderr hashes, and `ReleaseGate` requires matching current revisions across QA, deterministic verification, and ClaimLatch before release.

## Source repositories

The imported source revisions and exclusions are recorded in repository-manifest.json. The original source folders remain preserved outside this aggregate repository.

## Current status

The first local vertical slice is implemented. The completed P0 path includes:

1. ClaimLatch local Adapter with versioned envelopes and durable audit records.
2. EEEE persistent memory storage, retrieval, promotion, and stale-outcome rejection.
3. ISEOL independent QA planning, executable evidence ledger, stale-revision checks, and release gate.

The desktop companion is an always-on-top PySide6 widget with tray hide/restore/quit behavior. EEEE owns the local API, approvals, project memory, and user-facing state; ISEOL owns Agent decomposition, Workstream/team composition, execution, handoffs, integration, QA, and evaluation.

## Local setup

Requirements: Python 3.12+, Node.js 20+, npm, and Windows PowerShell for the helper scripts.

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -e ".\apps\eeee[dev,desktop]"
Push-Location .\packages\iseol; npm ci; Pop-Location
Push-Location .\integrations\claimlatch-adapter; npm ci; Pop-Location
```

Start the local EEEE API and widget:

```powershell
.\scripts\dev-up.ps1
Push-Location .\apps\eeee
..\..\.venv\Scripts\python.exe -m app.desktop
Pop-Location
```

Run the focused unified verification, or the full EEEE suite:

```powershell
.\scripts\verify-all.ps1
.\scripts\verify-all.ps1 -Full
```

No hosted login or central server is required. Optional Discord, mobile, calendar, and future channel adapters connect to the local core. Never commit `.env`, credentials, runtime databases, `node_modules`, virtual environments, `dist`, or `__pycache__`.

## Upstream attribution

The aggregate preserves the source projects as separate imported components. Their original repositories, licenses, remotes, branches, commits, and excluded runtime files are recorded in [`repository-manifest.json`](repository-manifest.json). The source folders remain preserved outside this checkout as upstream references.

