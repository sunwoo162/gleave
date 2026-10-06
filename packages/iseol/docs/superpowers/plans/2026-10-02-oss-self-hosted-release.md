# NPC 셀프호스팅 오픈소스 출시 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** NPC를 AGPL-3.0 기반의 재현 가능한 셀프호스팅 오픈소스 제품으로 배포할 수 있게 만든다.

**Architecture:** 기존 Node/TypeScript 서버와 React/Vite 사용자 UI를 유지하면서 배포 경계를 문서·환경변수·컨테이너·CI로 명확히 한다. 외부 연동은 현재의 opt-in 구조를 보존하고, Docker는 `npm start`와 동일한 빌드 산출물을 실행한다.

**Tech Stack:** Node.js, TypeScript, npm, Vite, Docker, GitHub Actions, existing test runner.

**Spec:** `docs/superpowers/specs/2026-10-02-oss-self-hosted-release-design.md`

## Global Constraints

- AGPL-3.0 라이선스를 사용한다.
- 기본 설치에서 Discord·GitHub·Figma·Notion·Google·Vercel·AI 연동은 비활성이다.
- AI Broadcast Room/방송실 기능은 구현·문서·배포 대상에서 제외한다.
- 시크릿·브라우저 프로필·운영 데이터·테스트 산출물은 Git과 Docker 이미지에 포함하지 않는다.
- main에서 직접 작업하지 않고 `codex/oss-release-foundation` 브랜치에서만 변경한다.
- 각 작업은 TDD, 검증, 커밋 단위로 완료한다.

## Review Focus

- 토큰이 비어 있는 클린 환경에서 시작 시 외부 API 호출이나 비밀값 오류가 발생하지 않는가 — Task 2 계약 테스트.
- Docker 컨테이너가 예상하지 못한 host/path를 데이터 루트로 사용하지 않는가 — Task 3 이미지·health 테스트.
- 로그·오류 응답에 Authorization/토큰이 노출되지 않는가 — Task 2 보안 테스트.
- README가 실제 현재 제품 경로와 방송실 제외 범위를 설명하는가 — Task 1 문서 계약 테스트.
- CI가 메모리 안전한 테스트 러너와 UI 빌드를 모두 실행하는가 — Task 4 workflow 계약 테스트.

---

### Task 1: 공개 저장소 메타데이터와 제품 문서

**Files:**
- Create: `LICENSE`
- Create: `CONTRIBUTING.md`
- Create: `SECURITY.md`
- Create: `CODE_OF_CONDUCT.md`
- Modify: `package.json`
- Modify: `README.md`
- Test: `tests/open-source-release-contract.test.ts`

**Interfaces:**
- Produces: 공개 저장소 라이선스·기여·보안 문서와 `private: false` 패키지 메타데이터.

- [ ] **Step 1: Write the failing contract tests** — `LICENSE`, 필수 문서, `package.json.private === false`, README의 Docker/환경변수/방송실 제외 문구를 검증한다.
- [ ] **Step 2: Run the focused contract test** — `node --import tsx --test tests/open-source-release-contract.test.ts`; Expected: missing-file/private/document failures.
- [ ] **Step 3: Add the public metadata and rewrite the README** — 현재 NPC 사용자 제품, Discord 자동화, 설치, 환경변수, 연동 opt-in, 데이터 디렉터리, 테스트, 보안 경계를 실제 명령어로 설명한다.
- [ ] **Step 4: Run the focused contract test** — Expected: PASS.
- [ ] **Step 5: Commit** — `docs: prepare repository for open source release`.

### Task 2: 기본 비활성 연동과 시크릿 안전 계약

**Files:**
- Modify: `.env.example`
- Modify: relevant startup/config modules only if the contract exposes a gap
- Test: `tests/open-source-runtime-safety.test.ts`

**Interfaces:**
- Consumes: existing environment loaders and service startup paths.
- Produces: deterministic configuration validation and redacted operational diagnostics.

- [ ] **Step 1: Write failing tests** — empty optional integration configuration must report disabled state; diagnostics must not contain token values or Authorization headers.
- [ ] **Step 2: Run focused tests** — Expected: fail only where the current startup contract is undocumented or leaks values.
- [ ] **Step 3: Implement the smallest config/diagnostic changes** — preserve current opt-in behavior; never add fallback credentials or external calls.
- [ ] **Step 4: Run focused tests and build** — `node --import tsx --test tests/open-source-runtime-safety.test.ts`; `npm run build`.
- [ ] **Step 5: Commit** — `fix: harden default self-hosted runtime configuration`.

### Task 3: Docker distribution and health boundary

**Files:**
- Create: `Dockerfile`
- Create: `docker-compose.example.yml`
- Create: `scripts/docker-healthcheck.mjs`
- Modify: server shutdown entrypoint only if required by tests
- Test: `tests/docker-release-contract.test.ts`

**Interfaces:**
- Consumes: `npm run build`, `npm start`, `WEBHOOK_PORT`, and the existing data/runtime roots.
- Produces: non-root production image, `/health` probe, `/app/data` volume contract, graceful SIGTERM behavior.

- [ ] **Step 1: Write failing Docker contract tests** — assert image stages, non-root user, exposed port, data volume, healthcheck, and example compose env behavior.
- [ ] **Step 2: Run focused tests** — Expected: missing Docker artifacts fail.
- [ ] **Step 3: Implement Docker files and healthcheck** — build UI and TypeScript in builder stage, copy only runtime artifacts, run as non-root, keep optional integrations disabled unless configured.
- [ ] **Step 4: Build and smoke-test image** — `docker build -t npc:release-candidate .`; run with empty optional env and verify health endpoint; skip only if Docker is unavailable and record the concrete limitation.
- [ ] **Step 5: Commit** — `feat: add self-hosted Docker distribution`.

### Task 4: CI, release checks, and clean-room verification

**Files:**
- Create: `.github/workflows/ci.yml`
- Create: `.github/workflows/release.yml` or a release checklist workflow if tags are manually promoted
- Create: `scripts/check-release-readiness.mjs`
- Modify: `package.json`
- Test: `tests/release-readiness-contract.test.ts`

**Interfaces:**
- Consumes: `npm ci`, existing batched `npm test`, `npm run build`, `npm run user-ui:build`, browser E2E command.
- Produces: one documented release-readiness command and CI workflow that never requires production secrets for pull requests.

- [ ] **Step 1: Write failing contract tests** — verify workflow commands, secret-free PR path, release script checks clean tree/required files/forbidden files, and no Broadcast Room release reference.
- [ ] **Step 2: Run focused tests** — Expected: missing workflow/script checks fail.
- [ ] **Step 3: Implement workflow and readiness script** — use npm cache, bounded test runner, artifact upload only for diagnostics, and explicit secret requirements only for protected release jobs.
- [ ] **Step 4: Run readiness and all verification commands** — `node scripts/check-release-readiness.mjs`; `npm run build`; `npm run user-ui:build`; `npm test`; `npm run test:iseol-user-product`; `npm run test:iseol-browser-e2e`.
- [ ] **Step 5: Commit** — `ci: add release readiness gates`.

### Task 5: Release candidate audit and PR handoff

**Files:**
- Modify: `CHANGELOG.md` or create if absent
- Create: `docs/release/v1.0.0-rc-checklist.md`

- [ ] **Step 1: Run secret scan and forbidden-scope scan** — inspect tracked files and generated manifests; expected zero credentials and zero active Broadcast Room implementation references.
- [ ] **Step 2: Run clean-room install** — clone/archive the branch into a fresh directory, run `npm ci`, build, start with empty optional env, and verify health.
- [ ] **Step 3: Complete release checklist** — record exact commands and results without copying secret values.
- [ ] **Step 4: Commit release notes and checklist** — `docs: add v1 release candidate checklist`.
- [ ] **Step 5: Push, open PR using the required Korean template, verify UTF-8 body, request review, merge after approval, and delete the feature branch.**

