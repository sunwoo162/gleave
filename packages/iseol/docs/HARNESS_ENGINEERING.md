# Iseol Harness Engineering

This document defines the global execution discipline for every Iseol development Run. Project-specific harness guidance and `AGENTS.md` files may add stricter rules, but they do not replace these invariants.

## Mandatory preflight

Before analysis or any development side effect, a Run must:

1. read this global harness document completely;
2. read the target repository's `docs/HARNESS_ENGINEERING.md` when present;
3. read the target repository's `AGENTS.md` when present;
4. record source paths and SHA-256 digests;
5. persist the resulting policy snapshot;
6. become `ready` only after those steps succeed.

Missing mandatory global guidance fails closed. A Run must never silently continue without its required policy.

## Execution invariants

- Durable Run state is the source of truth; a ChatGPT conversation is a replaceable worker.
- Meaningful stage transitions and external side effects require checkpoints/evidence.
- Completion claims require configured test, review, CI, deployment, and verification evidence.
- External side effects such as PR creation and deployment must be idempotent or reconciled before retry.
- Recovery inspects current Git/provider reality before repeating commands.
- Repeated identical failures use bounded retry and then replan/escalation; infinite retry loops are forbidden.
- Missing or unknown required contract versions fail before mutation.
- Inferred configuration never grants write, GitHub, deployment, or destructive permission silently.
- Secrets, raw tokens, and credentials are never written to Run evidence or policy snapshots.

## Human intervention boundary

Routine reversible work should continue automatically. Iseol pauses only for material product decisions, missing authorization, destructive or irreversible operations, paid actions, or other explicitly protected boundaries.

## Git, commit, and pull request policy

- Commit messages created by Iseol must be written in English and should use a concise Conventional Commit-style prefix such as `feat:`, `fix:`, `refactor:`, `test:`, `docs:`, or `chore:`.
- Before push or PR creation, read the target repository's Git/PR rules and `.github/pull_request_template.md` when present.
- If a repository PR template exists, preserve its headings, order, and language instead of replacing it with an Iseol-specific format.
- If no repository PR contract exists, use a concise title in the form `<type> : <short English description>` and a body covering changes, reason, implementation, impact, verification, and target branch.
- Normal development targets the repository's configured base branch; when no stricter project rule exists, prefer `develop`. Direct `main` integration is reserved for explicit release/hotfix policy.
- Push or PR creation must not happen while required harness verification is failing. Merge and deployment require their configured completion gates to pass.
- Existing CI/CD remains authoritative. Do not add or duplicate a Harness-only workflow merely to satisfy Iseol when the repository already has an appropriate pipeline.
- A Run may authorize routine push, PR, merge, and deployment up front; Iseol must not ask for repetitive approval at every stage unless project-local policy or a protected human-intervention boundary requires it.

## Project-specific policy

A target project's harness document contains repository-specific invariants such as build commands, supported surfaces, protected directories, deployment boundaries, and quality gates. Those rules remain owned by that project.

The effective Run policy is the ordered combination of this global document and all discovered project-local guidance, with provenance retained for audit and recovery.

## Progress notification journal concurrency

- The Discord progress notification journal is one JSONL file per project.
- Durable locking for notification delivery and adapter dispatch is therefore keyed by project journal identity, not by individual event ID.
- Tests must cover different event IDs contending for the same project journal so a new event cannot bypass an in-flight journal read/append operation.

## Daily scrum reminder delivery concurrency

- Daily scrum reminder delivery is coordinated by project and Seoul date, because the reminder state records one successful notification per project per date.
- The durable delivery lock must cover the check, Discord send, and successful state mark as one critical section so concurrent pollers cannot send duplicate `@everyone` reminders.
- A failed Discord send must release the lock without recording the date, allowing a later poll to retry the reminder.

## Contest feed delivery concurrency

- The general contest feed delivery lock is keyed by guild, while an audience-specific feed lock is keyed by guild and audience filter.
- A feed poll must acquire its delivery lock before reading the latest state, then perform external Discord publication and `postedKeys`/`remindedKeys` persistence within that critical section.
- A poll waiting behind another long-running poll must re-read the current state after lock acquisition instead of continuing with its original snapshot.

## GitHub commit feed synchronization

- The GitHub-linked commit feed sync is one external side-effect transaction across state read, Discord commit-log publication, and seen-event/commit persistence.
- A durable sync lock must cover the entire feed run so separate bot processes cannot publish the same linked commit before either process records its seen state.
- The existing in-process polling guard is complementary; it does not replace the durable lock required for multi-process deployment.

## GitHub automation polling synchronization

- GitHub automation polling treats PR review publication, milestone calendar synchronization, and poll-state persistence as one multi-process synchronization boundary.
- The durable sync lock must cover the complete polling run, while the existing in-process `running` guard remains a fast local optimization rather than the correctness boundary.
- A waiting or restarted poll must observe the persisted poll state after the previous run releases the lock before producing further external side effects.

## Figma and Notion integration polling

- Figma version/comment notifications and Notion edit notifications share one ProjectStore integration-polling boundary because each external send is followed by a project cursor update.
- The scheduler must hold the durable polling lock across project discovery, external Discord notification, and cursor persistence so another bot process cannot replay the same provider change.
- The in-process scheduler guard remains useful for avoiding local overlap, but correctness depends on the durable lock shared by all processes.

## GitHub review side-effect synchronization

- CI artifact reviews and signed-webhook AI reviews use the same durable lock keyed by repository, pull request number, and head SHA.
- The review lock covers the `hasReviewed` check, GitHub review publication, and successful review-state mark so concurrent workers cannot both pass the check and publish duplicate reviews.
- Review-state file locking remains responsible for atomic state reads and writes; the per-review lock protects the longer external side-effect transaction across independent bot processes.

## GitHub milestone calendar synchronization

- Milestone calendar synchronization is locked by its canonical calendar external key (`project`, repository, source, and milestone number).
- The mapping lock covers the state lookup, Calendar create/update/delete call, and mapping upsert/remove so concurrent polls cannot create duplicate events for one milestone.
- Calendar mapping file locking still protects atomic state changes; the per-mapping lock protects the longer external Calendar side-effect transaction.

## Contest feed setup synchronization

- General contest setup uses the guild delivery lock, while audience-specific setup uses the guild and audience-filter delivery lock already used by feed polling.
- Setup must re-read feed state after acquiring the lock and keep channel creation, state persistence, and the initial 안내 message in the same critical section.
- This prevents concurrent setup commands from creating duplicate contest categories or channels across independent bot processes.

## Discord channel ensure synchronization

- Project discussion and contest preparation announcement channel repair use a shared durable ensure-lock helper.
- The lock scope is the owning guild and category, so a retry or second bot process re-fetches channels after waiting and only creates missing channels.
- Different categories remain independent, while the check, Discord channel creation, and position adjustment for one category are serialized.

## Contest vote finalization synchronization

- Contest vote handling uses a durable lock keyed by vote ID in addition to the local in-process duplicate-click guard.
- The lock covers the fresh vote read, majority decision, preparation-room channel creation, vote-state update, and related Discord notifications.
- A worker waiting behind another process therefore observes the finalized vote before attempting another preparation-room side effect.

## Daily scrum channel setup synchronization

- `/scrum create` uses the shared Discord channel ensure lock keyed by the project guild and category.
- The command re-fetches the daily scrum channel after acquiring the lock and creates it only when still missing.
- Channel creation, discussion-channel position adjustment, and the initial usage message are kept inside the same critical section.

## Project creation synchronization

- `/project create` uses a durable lock keyed by the guild and the NFKC-normalized, case-insensitive project name.
- After acquiring the lock, the command re-reads the project store and Discord categories before creating the category, preventing duplicate project spaces across bot processes.
- The lock remains held through category/channel setup, integration side effects, and project persistence so a concurrent request cannot begin the same external setup from an old snapshot.

## Project name uniqueness invariant

- `ProjectStore.save` enforces one NFKC-normalized, case-insensitive project name per guild inside the durable file mutation lock.
- A duplicate name is rejected before the record is persisted, while the same name remains valid in a different guild.
- This storage invariant complements the `/project create` lifecycle lock and protects alternate callers that bypass the Discord command.

## Deterministic full-suite execution

- The default `npm test` command runs the complete test list with `--test-concurrency=1`.
- This keeps Windows/Desktop Agent integration tests from contending for shared process, socket, and temporary-file resources.
- Focused tests may still opt into their own concurrency when their fixtures are isolated, but the repository-wide gate remains deterministic.

## Project deletion synchronization

- `/project delete` uses a durable lock keyed by guild and project ID, so concurrent requests for one project share the same critical section even when they arrive through different target text.
- After acquiring the lock, the command re-reads the project store and Discord channels before deleting external webhooks, calendars, channels, bindings, and stored state.
- A request waiting behind a completed deletion observes the missing project and does not repeat external cleanup side effects from its stale pre-lock snapshot.

## Contest audience category synchronization

- Audience-specific contest feed setup uses a guild-scoped Discord channel lock for the shared `🏆 공모전` category.
- The category ensure critical section re-reads cached and fetched Discord channels before creating the category, so filters with independent delivery locks reuse one category.
- The audience delivery lock remains filter-scoped for independent feed channels, while only the shared category side effect is serialized across filters.

## Shared contest category synchronization

- Base `/contest setup` and audience-specific feed setup share the guild-scoped `contest-category` lock for the common `🏆 공모전` category.
- Both paths re-read Discord channels inside that lock and reuse an existing category, including one created by the other service.
- Base feed rollback deletes the category only when the base setup created it; a pre-existing shared category is preserved when channel setup fails.

## Project discussion repair synchronization

- Startup and post-command project discussion repair shares the project deletion lock keyed by guild and project ID.
- Repair re-reads the stored project after acquiring that lock and skips channel creation when deletion has already removed the project.
- The Discord category/channel ensure lock remains nested for channel-level duplicate prevention, while the lifecycle lock coordinates repair with project deletion.

## Scrum channel creation synchronization

- `/scrum create` shares the project deletion lock keyed by guild and project ID before entering its daily-scrum channel ensure lock.
- The command re-reads the project after acquiring the lifecycle lock and exits before Discord channel creation when deletion has already completed.
- The nested channel lock still deduplicates concurrent scrum requests for a live project, while the outer lifecycle lock coordinates creation with project deletion.

## Scrum channel deletion synchronization

- `/scrum delete` shares the project deletion lock keyed by guild and project ID with project deletion and `/scrum create`.
- The command re-reads the project after acquiring the lifecycle lock and exits before Discord channel or record cleanup when deletion has already completed.
- Channel deletion and daily-scrum record cleanup stay inside the same lifecycle critical section, so stale requests cannot perform external cleanup for a removed project.

## Scrum write synchronization

- `/scrum write` shares the project deletion lock keyed by guild and project ID before reading the daily-scrum channel or record state.
- The command re-reads the project after acquiring the lifecycle lock and exits before message delivery or record persistence when deletion has already completed.
- Existing message edits, new message sends, and daily-scrum record saves remain inside the same lifecycle critical section, preventing stale writes for a removed project.

## Daily scrum reminder synchronization

- The background daily reminder keeps its once-per-project-and-date delivery lock and also acquires the project deletion lock keyed by guild and project ID.
- It re-reads the project after acquiring the lifecycle lock and skips channel lookup, reminder delivery, and reminder-date persistence when deletion has already completed.
- A live project may finish one reminder before deletion enters the critical section, but stale reminder snapshots cannot create post-deletion Discord or store side effects.

## Contest guild delivery synchronization

- Base contest polling, audience-specific polling, and `/contest repost` share a guild-scoped durable delivery lock.
- The shared lock is nested outside each feed's own delivery/state lock, so independent audience state remains isolated while Discord publication is serialized per guild.
- Manual reposts cannot publish concurrently with scheduled feed polling for the same guild, preventing duplicate contest messages and vote records from overlapping publisher paths.

## GitHub commit feed lifecycle synchronization

- GitHub commit feed polling shares the project deletion lock keyed by guild and project ID for each frontend/backend repository sync.
- It re-reads the project after acquiring the lifecycle lock and skips GitHub lookup, Discord commit-log delivery, and seen-state updates when deletion has already completed.
- A live project may finish one repository sync before deletion enters the critical section, but stale polling snapshots cannot publish post-deletion commit activity.

## GitHub automation polling lifecycle synchronization

- GitHub automation polling shares the project deletion lock keyed by guild and project ID while installing review workflows and syncing pull requests/milestones.
- It re-reads the project after acquiring the lifecycle lock and skips GitHub review, Discord notification/history, and calendar milestone side effects when deletion has already completed.
- A live project may finish one polling cycle before deletion enters the critical section, but stale snapshots cannot continue automation side effects after deletion.

## Project deletion daily scrum cleanup

- `/project delete` clears the deleted project's daily-scrum records and reminder cursor after the project store deletion succeeds, while remaining inside the project deletion lifecycle lock.
- Daily-scrum cleanup failures are reported as bounded warnings alongside other external cleanup failures, without hiding the completed project store deletion.
- The cleanup removes both per-user daily-scrum records and the per-project reminder date, so deleted projects cannot retain durable daily-scrum state.

## GitHub webhook lifecycle synchronization

- GitHub `pull_request` and `milestone` webhook dispatch shares the project deletion lock keyed by guild and project ID before PR review, Discord notification, or Calendar milestone synchronization.
- It re-reads the project after acquiring the lifecycle lock and skips webhook side effects when the project was deleted while the repository snapshot was being resolved.
- A live webhook may complete while deletion is waiting for the critical section, but a stale webhook snapshot cannot perform post-deletion automation work.

## Project integration polling lifecycle synchronization

- Figma version/comment polling and Notion update polling share a project deletion lock keyed by guild and project ID for the complete project integration cycle.
- They re-read the project after acquiring the lifecycle lock and skip Discord notification, cursor update, and Project History side effects when deletion has already completed.
- A live integration cycle may finish before deletion enters the critical section, but stale Figma/Notion snapshots cannot continue post-deletion polling work.

## Calendar project lifecycle synchronization

- Discord Calendar view and modal actions share the project deletion lock keyed by guild and project ID before reading external events or performing Calendar/GitHub/history side effects.
- They re-read the project after acquiring the lifecycle lock and stop when deletion has completed, so stale interactions cannot create, update, delete, or list external project calendar state.
- A live Calendar action may finish before deletion enters the critical section, but stale modal/button snapshots cannot perform post-deletion work.

## Guild reset project lifecycle synchronization

- `!관리자권한초기화` acquires a durable guild-scoped project lifecycle lock before reading projects, deleting external hooks/channels, and clearing guild records.
- Project creation and deletion acquire the same guild lock before their project-specific locks, so reset, create, delete, and project polling cannot overlap with a stale project snapshot.
- The shared lock order is guild lifecycle first and project-specific lifecycle second, preventing a concurrent project deletion from being cleared or externally cleaned up out of order during guild reset.

## Project join lifecycle synchronization

- Project join buttons and modals acquire the project deletion lock keyed by guild and project ID before constructing the modal or sending a GitHub Organization invitation.
- They re-read the project after acquiring the lock and stop when deletion has completed, so stale interactions cannot invite a member using an obsolete Organization snapshot.
- A live invitation may finish before deletion enters the critical section, but a stale join interaction cannot perform post-deletion GitHub side effects.

## Project command lifecycle synchronization

- `/project bind` and `/project status` acquire the project deletion lock keyed by guild and stored project ID before creating bindings, recording Project History, or projecting Workspace status.
- The command paths re-read the stored project after acquiring the lock and stop when deletion has completed, so stale binding/history writes and stale status responses are not produced.
- Binding creation, its history fact, and status projection share one stored-project lifecycle boundary, while their nested Workspace/Run locks retain their existing ordering.

## Guild reset Project Workspace binding cleanup

- `!관리자권한초기화` removes valid Discord↔Project Workspace binding files only from the target guild directory, using each binding's durable lock.
- Binding files for other guilds remain untouched, and deleted binding counts are included in the reset's stored-record total and operator report.
- Missing binding directories and invalid filenames fail closed without broadening cleanup beyond the validated guild-scoped path.

## Project Workspace progress notification lifecycle synchronization

- Project Workspace Discord progress notifications resolve a stored project binding under the project deletion lock and re-read the project before resolving log channels.
- The lifecycle guard remains held through the Discord channel send, so a stale progress event cannot publish to a deleted project's log channel.
- Missing bindings, deleted projects, and deleted channels fail closed without accepting a Discord delivery.

## GitHub commit feed state lifecycle synchronization

- GitHub commit feed cursor state is retained only for project/repository keys whose project lifecycle pass was admitted under the project deletion lock.
- If a project is deleted while polling waits for its lifecycle lock, the skipped project key is excluded from the final durable state replacement instead of being restored from the initial snapshot.
- This keeps deleted project cursor state from surviving a concurrent polling cycle or being reused by later reconciliation.

## Project deletion polling state cleanup

- `/project delete` clears the deleted project's GitHub commit feed and automation milestone cursor state after the project deletion lock is released.
- Each state store performs project-scoped removal under its own polling sync lock and reports cleanup failures as deletion warnings.
- Keeping polling sync cleanup outside the project deletion critical section avoids reversing the polling lock order and prevents a delete/poll deadlock.

## Guild reset polling state cleanup

- `!관리자권한초기화` clears GitHub commit feed and automation milestone cursor state for removed guild projects after the guild lifecycle lock is released.
- Cleanup runs under each polling store's sync lock, preserves other guild projects, and reports cleanup failures as reset warnings.
- Keeping polling cleanup outside the guild lifecycle critical section avoids reversing the polling lock order and prevents a reset/poll deadlock.

## Project deletion Calendar mapping cleanup

- `/project delete` clears local Calendar issue/milestone mappings after the StoredProject record is deleted.
- Local mapping cleanup is independent from external Google Calendar deletion, so missing credentials or a remote deletion failure cannot leave deleted-project mappings behind.
- Cleanup removes only the deleted project's mappings and preserves mappings belonging to other projects.

## Manual Calendar event mapping cleanup

- Calendar modal event deletion removes the matching local mapping after the external event deletion succeeds.
- Matching is scoped by `projectId`, `calendarId`, and `eventId`, so shared event IDs across projects cannot remove unrelated mappings.
- Mapping cleanup remains under the Calendar state store's durable file lock and leaves other events untouched.

## Guild reset Calendar mapping cleanup

- `!관리자권한초기화` clears local Calendar mappings for projects removed with the guild after the guild lifecycle lock is released.
- Cleanup is scoped to the removed project IDs, so Calendar mappings for other guilds and projects remain intact.
- Calendar cleanup failures are reported through the reset summary warnings without reversing the guild reset lock order.

## Discord progress bridge journal replay

- The Discord progress bridge subscribes before replaying the durable Web Product event journal, so events published during replay are not lost.
- Replay and live events for the same Project are delivered through a project-scoped queue before entering the durable notification journal lock.
- Restart replay relies on the durable delivery record to suppress already accepted events while allowing events that were not delivered before shutdown to recover.

## Web token session-storage boundary

- Web and operator bearer tokens in the Control Plane UI are stored only in `sessionStorage` and remain scoped to the current browser tab.
- On startup, legacy `localStorage` token keys are removed without being read or migrated; token values are never copied into durable server state.
- Static and Chromium acceptance tests verify token separation, legacy cleanup, and the existing authenticated Web and operator flows.

## Guild reset GitHub account link cleanup

- `!관리자권한초기화` removes GitHub account links scoped to the reset guild under the account-link store's durable file lock.
- Links for other guilds remain intact, and the removed-link count is included in the reset's cleared-record summary.
- The guild reset integration test verifies target/other guild isolation in `data/github-users.json`.

## User UI route bundle loading

- User UI pages are loaded per route through lazy imports, while the application keeps the existing route/component mapping and renders a bounded Suspense fallback during chunk loading.
- The production Vite build keeps the initial JavaScript chunk at roughly 318 KB and emits separate page chunks instead of one roughly 695 KB bundle.
- The route contract suite and the full NPC user-product regression suite remain the acceptance boundary; this optimization does not claim live browser performance measurements.

## Isolated browser team-project ACL lock boundary

- The isolated browser server injects both the public team-access callback and the lock-aware team-access callback into `UserProjectService`.
- Team project creation and team transitions re-check access while the durable Team membership lock is held; those checks must use the lock-aware callback so they do not recursively acquire the same lock.
- The full isolated browser E2E verifies private team project visibility before membership, after recruitment acceptance, and through the related team transition flows.
- `npm run test:iseol-browser-e2e` and `npm run test:iseol-user-product` remain the acceptance boundary for this integration wiring.

## Browser contract guard for team-project lock wiring

- The isolated browser project-runtime contract test checks that `teamService.canAccessWithinMembershipLock` remains connected to `UserProjectService`.
- This fast source contract catches a missing lock-aware callback before the longer private-team ACL browser journey runs.
- The contract guard complements, rather than replaces, the full `npm run test:iseol-browser-e2e` and `npm run test:iseol-user-product` acceptance suites.

## Social profile lock transient retry boundary

- Social profile durable lock acquisition retries a transient Windows `EPERM`/probe `ENOENT` race while the configured wait deadline remains.
- The lock still removes only a matching owner token and does not weaken stale-owner cleanup or authorization boundaries.
- Social profile/privacy/safety tests and the full user-product regression suite remain the acceptance boundary.

## AI Chat conversation lock transient retry boundary

- AI Chat conversation lock acquisition retries a transient Windows `EPERM`/probe `ENOENT` race while the configured wait deadline remains.
- Conversation owner-token cleanup and authenticated user isolation remain unchanged; the retry does not broaden access or hide unexpected probe errors.
- AI Chat persistence, attachment, Runtime, project-context, full user-product, and isolated browser E2E suites remain the acceptance boundary.

## Team membership lock transient retry boundary

- Team membership durable lock acquisition retries a transient Windows `EPERM`/probe `ENOENT` race while the configured wait deadline remains.
- Lock-held ACL rechecks, active human membership rules, owner-token cleanup, and team data isolation remain unchanged.
- AI Team, recruitment, study, team chat, personal memory sharing, project transition, full user-product, and isolated browser E2E suites remain the acceptance boundary.

## Private memory lock transient retry boundary

- Private memory durable lock acquisition retries a transient Windows `EPERM`/probe `ENOENT` race while the configured wait deadline remains.
- User-owned memory, active-team sharing, AI Runtime context, and owner-token cleanup boundaries remain unchanged; unexpected probe errors are not hidden.
- Private memory/AI context, full user-product, and isolated browser E2E suites remain the acceptance boundary.

## Remaining binding and social lock transient retry boundary

- Discord project binding and social friend-request/report durable locks retry a transient Windows `EPERM`/probe `ENOENT` race while the configured wait deadline remains.
- Project ownership, friendship privacy, private reports, profile visibility, and owner-token cleanup boundaries remain unchanged.
- Discord binding/social targeted tests and the full user-product and isolated browser E2E suites remain the acceptance boundary.
