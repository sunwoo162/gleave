# NPC Agent Profile Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Rename the user-facing product brand to NPC while adding an owner-scoped, configurable AI agent profile whose common bot name remains 이설.

**Architecture:** Keep NPC as the product/platform label and keep 이설 as the generic name for an individual AI bot. Store one default agent profile per authenticated user under the existing private platform root, expose it through an authenticated user API, and render the configured display name in AI Chat and Settings. Existing conversations, memories, Runtime, and project execution remain unchanged.

**Tech Stack:** TypeScript, Node.js JSON durable stores, existing HTTP routers, React/Vite user UI, Node test runner.

**Spec:** The approved conversation design: NPC is the platform; 이설 is the generic bot term; each user can customize an agent name, avatar URL, personality, tone, and role.

## Global Constraints

- Preserve existing user/session ownership checks and private storage boundaries.
- Do not change Runtime, Desktop Agent, ChatGPT Web, or project execution behavior.
- Use the existing JSON durable-store pattern with atomic replacement.
- A missing profile must resolve to the default name `이설` without requiring migration.
- Avatar customization is URL-based in this slice; file upload/storage is deferred.

## Review Focus

- A user must never read or update another user's agent profile; covered by the profile isolation test.
- Invalid profile text or unsafe avatar URLs must be rejected; covered by the profile validation test.
- Existing users without a profile must receive a stable default profile; covered by the default profile test.
- A missing optional service must return an honest unavailable response rather than crash routing; covered by the router test.
- Existing AI Chat and user UI builds must continue to compile; covered by focused test/build verification.

---

### Task 1: Agent profile domain

**Files:**
- Create: `src/ai-agent/contracts.ts`
- Create: `src/ai-agent/store.ts`
- Create: `src/ai-agent/service.ts`
- Test: `tests/ai-agent-profile.test.ts`

**Interfaces:**
- Produces `AiAgentProfile`, `AiAgentProfilePatch`, `AiAgentProfileService`, and `createAiAgentProfileService(root, options?)`.
- The service exposes `getProfile(principal)` and `updateProfile(principal, patch)`.

- [x] **Step 1: Write the failing domain tests**

  Add tests for default profile creation, owner isolation, validation, and update persistence.

- [x] **Step 2: Run the domain tests and verify they fail**

  Run `node --import tsx --test tests/ai-agent-profile.test.ts`.
  Expected: FAIL because `src/ai-agent/service.ts` does not exist yet.

- [x] **Step 3: Implement the contracts, atomic store, and service**

  Use `users/<userId>/ai-agent/profile.json`, validate names and text lengths, allow only `http:`, `https:`, and `data:image/` avatar URLs, and return the default profile when the file is absent.

- [x] **Step 4: Run the domain tests and verify they pass**

  Run `node --import tsx --test tests/ai-agent-profile.test.ts`.

### Task 2: Authenticated profile API

**Files:**
- Create: `src/ai-agent/router.ts`
- Modify: `src/web-control-plane/server.ts`
- Modify: `src/runtime/iseol-runtime-services.ts`
- Modify: `scripts/iseol-user-ui-isolated-server.ts`
- Test: `tests/ai-agent-profile-api.test.ts`

**Interfaces:**
- Adds `GET /api/user/agent` and `PATCH /api/user/agent`.
- Adds `aiAgentProfileService` to the web control-plane and runtime service wiring.

- [x] **Step 1: Write the failing API tests**

  Add tests for authenticated GET/PATCH, unauthenticated rejection, two-user isolation, and 503 when the service is not configured.

- [x] **Step 2: Run the API tests and verify they fail**

  Run `node --import tsx --test tests/ai-agent-profile-api.test.ts`.
  Expected: FAIL because the route and server dependency do not exist yet.

- [x] **Step 3: Implement the router and service wiring**

  Follow the existing `UserRequest` bearer authentication pattern and route only the exact `/api/user/agent` path before the personal-world fallback.

- [x] **Step 4: Run the API tests and verify they pass**

  Run `node --import tsx --test tests/ai-agent-profile-api.test.ts`.

### Task 3: User-facing NPC branding and profile controls

**Files:**
- Modify: `user-ui/src/api/userApi.ts`
- Modify: `user-ui/src/pages/Settings.tsx`
- Modify: `user-ui/src/pages/AIChat.tsx`
- Modify: `user-ui/src/components/Navigation.tsx`
- Modify: `user-ui/src/pages/Landing.tsx`
- Modify: `user-ui/src/pages/Auth.tsx`
- Modify: `user-ui/src/pages/Onboarding.tsx`
- Modify: `user-ui/src/pages/Portfolio.tsx`
- Modify: `user-ui/src/pages/PortfolioScreen.tsx`
- Modify: `user-ui/src/pages/PublicPortfolio.tsx`
- Test: existing user UI contract suite and `npm run user-ui:build`

**Interfaces:**
- Adds `AiAgentProfile` API types and `getAiAgentProfile`/`updateAiAgentProfile` helpers.
- Adds an AI profile editor under Settings → AI 설정.
- Uses the configured profile name in AI Chat; falls back to 이설.
- Changes current public product labels from ISEOL to NPC while preserving the bot term 이설.

- [x] **Step 1: Add API helpers and UI profile state**

- [x] **Step 2: Add the editable profile card**

  Include name, avatar URL, personality, tone, and role with bounded inputs and truthful save/error states.

- [x] **Step 3: Render the configured name in AI Chat**

- [x] **Step 4: Update current product branding labels**

  Do not rewrite historical import/spec text or internal filenames in this slice.

- [x] **Step 5: Build the UI and run focused contracts**

  Run `npm --prefix user-ui run build` and the existing AI Chat, Settings, static, and navigation contract tests.

### Task 4: Documentation and regression verification

**Files:**
- Modify: `docs/ISEOL_PRODUCT_SPEC.md`
- Modify: `docs/ISEOL_ARCHITECTURE.md`
- Modify: `docs/ISEOL_FEATURE_INVENTORY.md`

- [x] **Step 1: Document NPC naming and agent profile boundaries**

- [x] **Step 2: Run focused domain/API/UI tests**

- [x] **Step 3: Run `npm run build` and the repository test command**

- [x] **Step 4: Review the diff and report any pre-existing failures separately**
