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

## Source repositories

The imported source revisions and exclusions are recorded in repository-manifest.json. The original source folders remain preserved outside this aggregate repository.

## Current status

The aggregate repository baseline is being assembled first. The highest-priority implementation work is:

1. ClaimLatch local Adapter.
2. EEEE persistent memory storage, retrieval, and promotion.
3. ISEOL independent QA results connected to EEEE memory.

