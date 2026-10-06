# Iseol Calendar and Code Review Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add project Google Calendar controls, GitHub schedule synchronization, and concise Gemini-style automatic PR reviews to Iseol.

**Architecture:** Keep the existing centralized Discord bot. Add focused Calendar, GitHub event, review-domain, and persistence services; a small signed GitHub webhook HTTP endpoint dispatches schedule/review events without coupling them to Discord UI code. External auth remains environment-only.

**Tech Stack:** Node.js ESM, TypeScript 7, discord.js 14, Octokit, `googleapis`, `@google/genai`, `zod`, Node built-in test runner + `tsx`.

**Spec:** `docs/superpowers/specs/2026-09-01-iseol-calendar-code-review-design.md`

## Global Constraints
- PR output is a short `이설 Code Review` summary plus only high-confidence, actionable inline comments.
- Normal reviews target 0-5 inline comments and never post numeric score tables.
- Google/GitHub/Gemini credentials never enter project data or Git.
- Calendar writes are remote-first; local mappings persist only after the remote mutation succeeds.
- Review dedupe key is repository + PR number + HEAD SHA.
- First version never blocks or merges pull requests.

---

### Task 1: Test harness and configuration

**Files:**
- Modify: `package.json`
- Modify: `.env.example`
- Modify: `src/config.ts`
- Create: `tests/config.test.ts`
**Interfaces:**
- Produces `config.googleClientId`, `config.googleClientSecret`, `config.googleRefreshToken`, `config.googleRedirectUri`, `config.geminiApiKey`, and `config.githubWebhookSecret` as optional secrets.
- Produces `npm test` using `tsx --test tests/**/*.test.ts`.

- [ ] **Step 1: Write failing config tests** verifying optional integration secrets default to empty strings and never make legacy startup config stricter.
- [ ] **Step 2: Run** `npm test -- tests/config.test.ts` and confirm the new fields are absent/failing.
- [ ] **Step 3: Add** dependencies `googleapis`, `@google/genai`, `zod`; add the test script and optional environment variables.
- [ ] **Step 4: Run** `npm test -- tests/config.test.ts` and `npm run build`.
- [ ] **Step 5: Commit** `chore: add calendar and review integration config`.

### Task 2: Calendar domain and Google Calendar service

**Files:**
- Create: `src/services/calendar/google-calendar.ts`
- Create: `src/services/calendar/calendar-state.ts`
- Create: `tests/calendar-state.test.ts`

**Interfaces:**
- `GoogleCalendarService.createProjectCalendar(name): Promise<{ id: string; url: string }>`
- `createEvent(calendarId, input): Promise<CalendarEventRef>` / `updateEvent` / `deleteEvent` / `listEvents`.
- State API stores project/event mappings only, never OAuth credentials.

- [ ] **Step 1: Write failing tests** for create/update/delete mapping semantics and stable external keys.
- [ ] **Step 2: Run** the calendar state tests and confirm missing-module failures.
- [ ] **Step 3: Implement** atomic JSON persistence plus Google OAuth2 Calendar API wrapper with Asia/Seoul defaults.
- [ ] **Step 4: Run** calendar tests and build.
- [ ] **Step 5: Commit** `feat: add google calendar service and state`.
### Task 3: Discord project schedule channel and controls

**Files:**
- Modify: `src/commands/project.ts`
- Modify: `src/index.ts`
- Modify: `src/services/projects.ts`
- Create: `src/services/calendar/calendar-discord.ts`
- Create: `tests/calendar-discord.test.ts`

**Interfaces:**
- Project creation persists `calendarId`, `calendarUrl`, `calendarChannelId`, `calendarPanelMessageId`.
- `handleCalendarInteraction(interaction)` owns button/modal/select flows for add/view/update/delete and issue creation entry points.

- [ ] **Step 1: Write failing pure tests** for custom-id parsing, date/time validation, and compact panel rendering.
- [ ] **Step 2: Run** the Discord calendar tests and confirm failures.
- [ ] **Step 3: Implement** schedule channel provisioning, pinned panel, modal handlers, and remote-first event mutations.
- [ ] **Step 4: Run** calendar tests and build.
- [ ] **Step 5: Commit** `feat: add project schedule channel controls`.

### Task 4: GitHub schedule synchronization

**Files:**
- Modify: `src/services/github.ts`
- Create: `src/services/github-schedule-sync.ts`
- Create: `src/services/github-webhook.ts`
- Create: `tests/github-schedule-sync.test.ts`

**Interfaces:**
- `syncMilestone(project, payload)` upserts a mapped calendar event only when `due_on` exists.
- `createLinkedIssue(...)` creates the GitHub issue first, Calendar event second, then persists the explicit mapping.
- Webhook dispatch is idempotent by stable external key.

- [ ] **Step 1: Write failing tests** for milestone upsert idempotence and issue/calendar mapping.
- [ ] **Step 2: Run** schedule sync tests and confirm failures.
- [ ] **Step 3: Implement** Octokit issue/milestone helpers, synchronization rules, and webhook payload normalization.
- [ ] **Step 4: Run** tests and build.
- [ ] **Step 5: Commit** `feat: sync github schedules with calendar`.
### Task 5: Review domain, Gemini provider, and clean GitHub posting

**Files:**
- Create: `src/services/review/review-types.ts`
- Create: `src/services/review/review-state.ts`
- Create: `src/services/review/review-filter.ts`
- Create: `src/services/review/review-render.ts`
- Create: `src/services/review/gemini-review-provider.ts`
- Create: `src/services/review/github-review.ts`
- Create: `tests/review-domain.test.ts`

**Interfaces:**
- `ReviewResult = { summary: string[]; findings: ReviewFinding[] }` is provider-independent.
- `filterReviewFindings(result, changedLines)` removes low-confidence, duplicate, out-of-diff findings and caps ordinary inline comments at five.
- `GitHubReviewService.reviewPullRequest(project, repository, pullNumber, headSha)` posts one review per SHA.

- [ ] **Step 1: Write failing tests** for schema parsing, diff changed-line validation, confidence filtering, duplicate collapse, five-comment cap, and zero-finding rendering.
- [ ] **Step 2: Run** review tests and confirm missing implementations fail.
- [ ] **Step 3: Implement** strict Zod schema, Gemini structured JSON generation, patch parsing, normalized filtering, concise Korean review rendering, Octokit review posting, and SHA persistence.
- [ ] **Step 4: Run** review tests and build.
- [ ] **Step 5: Commit** `feat: add gemini style pull request reviews`.

### Task 6: Signed webhook server and Discord completion notifications

**Files:**
- Modify: `src/services/webhook-server.ts`
- Modify: `src/index.ts`
- Modify: `src/services/projects.ts`
- Create: `tests/github-webhook.test.ts`

**Interfaces:**
- HTTP route verifies `X-Hub-Signature-256` with `GITHUB_WEBHOOK_SECRET` before dispatch.
- `pull_request` opened/reopened/synchronize routes to review service; milestone events route to calendar sync.
- Review completion/failure sends one compact message to the matching frontend/backend log channel.

- [ ] **Step 1: Write failing tests** for HMAC verification, unsupported event rejection, and pull-request action filtering.
- [ ] **Step 2: Run** webhook tests and confirm failures.
- [ ] **Step 3: Implement** signed HTTP endpoint and isolated dispatch with bounded error handling.
- [ ] **Step 4: Run** all tests and build.
- [ ] **Step 5: Commit** `feat: dispatch signed github automation webhooks`.

### Task 7: Integration verification and documentation

**Files:**
- Modify: `README.md`
- Modify: `.env.example`

- [ ] **Step 1: Run** `npm test`.
- [ ] **Step 2: Run** `npm run build`.
- [ ] **Step 3: Run** `git diff --check` and inspect secrets are absent from tracked files.
- [ ] **Step 4: Document** Google OAuth setup, GitHub webhook secret/endpoint, Gemini API key, permissions, and schedule/review behavior.
- [ ] **Step 5: Commit** `docs: document calendar and review automation`.
