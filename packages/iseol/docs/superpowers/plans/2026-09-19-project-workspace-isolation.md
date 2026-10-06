# Project Workspace Runtime Isolation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Keep one Iseol Runtime while giving Project Workspace runs independent durable roots, ownership checks, and restart recovery.

**Architecture:** Idea Lab/DOGFOOD retain their current model, Run, worker, and Desktop result roots. Project Workspace receives explicit model, Run, worker, and Desktop state roots passed through the Runtime host and web router. The shared Desktop Agent connection remains single-owner; only registry connectivity is shared.

**Tech Stack:** TypeScript, Node.js test runner, existing Iseol Runtime/Harness/WebWorker/Desktop bridge.

**Spec:** Approved in the current conversation; repository root has no AGENTS.md.

## Global Constraints

- Do not modify or retry DOGFOOD-01 durable state.
- Do not create a second Runtime supervisor or Desktop Agent for the same browser/control-plane resources.
- Preserve strict Desktop/path validation and idempotent mutation recovery.
- Do not persist credentials or browser profile contents.

## Review Focus

- Missing Project roots disable Project execution instead of falling back to DOGFOOD roots.
- Project routes never read or write Idea Lab roots when Project roots are configured.
- Project recovery scans only Project Run records and never retries FAILED_FINAL.
- Desktop job/result lookup cannot cross Project state roots.
- Existing Idea Lab executor registration and recovery remain unchanged.

### Task 1: Add explicit Project roots and host persistence

Modify runtime root/config types and `scripts/iseol-runtime-host.ts`; add tests for loading, saving, and env propagation.

### Task 2: Route Project Workspace operations through Project roots

Add optional Project roots to the web server/router and use them only for Project APIs; retain fallback behavior for existing tests and legacy deployments.

### Task 3: Isolate Project executor and recovery

Require complete Project roots for runtime registration, construct the executor with Project Run/worker/Desktop state roots, and scan only Project Runs.

### Task 4: Verify cross-project isolation and regression behavior

Add deterministic tests covering root separation, restart recovery, no cross-project mutation, no FAILED_FINAL retry, and Idea Lab regression.

### Task 5: Run full verification and optional isolated live dogfood

Run focused tests, full npm test, build, diff-check, syntax check, then inspect the live runtime before creating an isolated PROJECT-DOGFOOD-01.
