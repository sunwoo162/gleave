# Iseol Discord Contextualization Design

## 1. Goal

Discord의 기존 프로젝트 기능을 제거하거나 새 명령 체계로 재작성하지 않고, 새 Iseol Project Workspace와 같은 `projectId / nodeId / runId` 좌표를 사용할 수 있도록 연결한다.

이번 단계의 핵심은 Discord를 별도 프로젝트 상태 저장소로 만들지 않는 것이다. 기존 `StoredProject`는 Discord 채널과 외부 연동을 유지하기 위한 legacy runtime record로 계속 사용하고, 장기 제품 구조와 개발 기록은 Project Workspace가 소유한다.

## 2. Current state

현재 프로젝트에는 서로 목적이 다른 두 모델이 존재한다.

- `StoredProject` (`data/projects.json`): Discord guild/category/channel, frontend/backend repository, Figma/Notion/Calendar 연결 정보.
- `ProjectWorkspace` (`Project Model store`): promoted prototype Genesis, product tree, Run linkage, permanent history.

또한 `resolveProjectWorkContext()`가 `projectId / nodeId / runId` 관계를 검증하지만, Discord의 기존 명령과 polling 서비스는 아직 `StoredProject`를 직접 읽는다.

기존 `Iseol Project Context Resolver Design`은 `StoredProject -> ProjectContext` read model을 설계했지만 아직 production code로 구현되지 않았다.

## 3. Design decision

두 모델을 강제로 하나로 합치지 않는다. 대신 작은 compatibility layer를 추가한다.

```text
Discord interaction / polling event
          |
          v
DiscordProjectContextResolver
  |- StoredProject context (required for legacy project action)
  |- DiscordProjectBinding (optional)
  `- ProjectWorkContext (optional, validated)
          |
          +-> existing Discord/provider behavior
          `-> Project Workspace history/status when bound
```

## 4. Why explicit binding is required

`StoredProject.id`는 Discord 프로젝트 생성 시 random ID이고, `ProjectWorkspace.id`는 prototype promotion identity에서 생성된다. 현재 두 ID 사이에 신뢰할 수 있는 공통 키가 없다.

프로젝트 이름이나 repository URL을 이용한 자동 매칭은 금지한다. 이름 중복, repository 교체, frontend/backend 분리, archived prototype 때문에 잘못된 Project Workspace에 기록을 붙일 수 있기 때문이다.

따라서 연결은 다음 record로 명시한다.

```ts
export type DiscordProjectBinding = {
  version: 1;
  guildId: string;
  storedProjectId: string;
  projectId: string;
  defaultNodeId: string;
  createdAt: string;
  updatedAt: string;
};
```

`defaultNodeId`의 초기값은 Project Workspace의 root node다. binding은 프로젝트 데이터를 복제하지 않고 두 identity를 연결하는 coordination metadata일 뿐이다.

동일한 `(guildId, storedProjectId)`는 하나의 active Project Workspace에만 연결할 수 있다. 이미 다른 workspace에 연결된 binding 변경은 명시적 rebind action이 필요하며 자동으로 덮어쓰지 않는다.

## 5. Legacy ProjectContext

기존 resolver spec의 아이디어를 production read model로 구현한다.

`StoredProject`에서 다음 정보만 파생한다.

- project identity and guild/category
- frontend/backend repository refs
- Discord log channels
- Calendar/Figma/Notion integration refs

이 read model은 저장되지 않고 매 요청마다 현재 `StoredProject`에서 파생된다.

## 6. DiscordProjectContext

상위 Discord 기능은 `StoredProject`를 직접 해석하지 않고 다음 aggregate context를 소비한다.

```ts
export type DiscordProjectContext = {
  legacy: ProjectContext;
  binding?: DiscordProjectBinding;
  work?: ProjectWorkContext;
};
```

resolver 입력은 최소한 `guildId + storedProjectId`다. 선택적으로 `nodeId`와 `runId`를 받을 수 있다.

검증 순서:

1. `StoredProject` 조회
2. `guildId` 일치 확인
3. binding 조회
4. binding이 있으면 `ProjectWorkspace` 존재 확인
5. requested/default node를 `resolveProjectWorkContext()`로 검증
6. runId가 있으면 해당 node에 실제 attach된 Run인지 검증

binding이 없는 legacy 프로젝트는 `legacy` context만 반환하고 기존 Discord 기능을 계속 사용할 수 있다. 새 Project Workspace 기능만 unavailable로 표시한다.

binding이 존재하지만 workspace/node 관계가 깨졌다면 조용히 legacy-only로 downgrade하지 않는다. stale/corrupt binding으로 취급하고 Project Workspace mutation/history recording을 차단한다.

## 7. Discord project UX

기존 `/project create`와 `/project delete`는 유지한다. 다음 subcommand를 추가한다.

- `/project bind` — 현재 Discord project와 promoted Project Workspace를 명시적으로 연결.
- `/project status` — legacy integration 상태 + linked Workspace/tree/Run 상태를 한 카드로 표시.

`bind`는 guild 내 StoredProject와 active Project Workspace를 각각 autocomplete로 선택하도록 한다. 이미 연결된 project는 현재 binding을 명확히 보여준다.

`status`는 binding이 없으면 기존 GitHub/Figma/Notion/Calendar 연결 상태만 보여주고 `Project Workspace 연결 필요`를 표시한다.

연결된 `status` 카드에는 최소한 다음을 표시한다.

- Project Workspace name/status
- selected/default tree node and node status
- attached Run IDs
- attached Run이 있으면 stage/status/updatedAt
- frontend/backend repository
- Figma/Notion/Calendar 연결 여부
- deployment/Genesis reference link when available

이번 단계에서는 Run start/resume/cancel side effect를 실행하지 않는다. 상태 카드는 다음 Desktop Execution Bridge가 붙을 수 있는 context-aware control surface까지만 준비한다.

## 8. Existing capability contextualization

기존 기능의 provider behavior는 유지하고, 성공/실패 결과에 Project Workspace context를 덧붙인다.

우선 적용 대상:

1. Calendar button/modal actions
2. GitHub Issue + Calendar linked creation
3. GitHub PR review polling result
4. Figma version/comment notification
5. Notion update notification
6. GitHub commit/log notification where project identity is already known

기존 user-level `/github connect/profile/disconnect`는 프로젝트 기능이 아니므로 이 phase에서 contextualize하지 않는다.

Project Workspace binding이 없으면 기존 behavior만 실행한다. binding이 있으면 동일 action 결과를 Project History에도 append한다.

Provider mutation의 성공 여부와 History append는 분리한다. 예를 들어 Google Calendar 일정 생성이 성공한 뒤 History 기록 실패가 발생해도 provider action을 다시 실행하지 않는다. History recording은 stable action identity로 idempotent하게 재시도한다.

## 9. Project History extensions

현재 `ProjectHistoryEventType`에 Discord/integration event를 additive하게 확장한다.

예상 type:

- `discord-project-bound`
- `discord-action-recorded`
- `integration-action-recorded`
- `review-recorded`

추가 optional metadata는 최소 구조만 둔다.

```ts
{
  source?: "discord" | "github" | "figma" | "notion" | "calendar";
  action?: string;
  reference?: string;
  nodeId?: string;
  runId?: string;
}
```

이 metadata는 secret/token/raw provider payload를 저장하지 않는다. 사용자에게 의미 있는 요약과 provider reference만 남긴다.

후속 lineage invariant: GitHub commit/PR은 단순 History append 시각만 저장하지 않고 provider가 제공하는 실제 lifecycle timestamp도 보존한다. commit은 `committedAt`, PR은 가능한 경우 `openedAt`, `mergedAt`, `closedAt`을 유지하며, Project Tree/History UI는 이 시간 정보를 해당 commit/PR lineage와 함께 표시한다.

History event ID는 같은 외부 action을 재처리해도 중복 append되지 않도록 deterministic key에서 생성하거나 append 전에 중복 검사한다.

## 10. Node and Run context rules

Project-level legacy action은 binding의 `defaultNodeId`에 기록할 수 있다.

더 구체적인 node/run context가 interaction custom ID 또는 explicit command option으로 전달되면 반드시 `resolveProjectWorkContext()`를 통과해야 한다.

다음 inference는 금지한다.

- 여러 active Run 중 임의로 하나 선택
- 이름이 비슷한 tree node 자동 선택
- repository path만 보고 feature node 추측

명확한 node/run 정보가 없으면 default root node까지만 기록한다. 정확도보다 잘못된 lineage를 만들지 않는 것이 우선이다.

## 11. Binding lifecycle

Binding store는 Project Model root와 별도의 Discord coordination namespace에 둔다. legacy `data/projects.json` 형식을 변경하지 않는다.

예시:

```text
data/discord-project-bindings/
  <guildId>-<storedProjectId>.json
```

실제 구현에서는 ID validation과 atomic temp+rename write를 사용한다.

Discord project 삭제 시 binding도 정리한다. Project Workspace 자체는 삭제하지 않는다. Discord 연결 해제는 permanent project history를 파괴하는 작업이 아니기 때문이다.

Project Workspace archive 시 binding은 남길 수 있지만 status 카드에서 archived 상태를 명확히 표시하고 새 mutable action 연결은 정책에 따라 제한한다.

## 12. Error handling

- StoredProject not found / guild mismatch → Discord action returns existing project-not-found style response.
- binding missing → legacy behavior continues; Workspace-only UI shows unbound state.
- binding points to missing workspace/node → fail closed for Project Workspace history/mutation and surface stale binding.
- Run reference not attached to selected node → reject that work context.
- provider action failure → record no success history; existing provider error handling remains authoritative.
- provider success + history write failure → do not repeat provider action; retry only history append.

Binding write/rebind is a coordination mutation and must be explicit. No background poller may silently create a binding from fuzzy matching.

## 13. Security and authorization

Discord guild isolation remains mandatory. Every resolver path checks `guildId` before exposing legacy project data or accepting a binding mutation.

`/project bind` follows the existing project-management permission boundary used by `/project create/delete`.

Custom IDs are treated as untrusted input. Any embedded project/node/run ID must be parsed with strict ID patterns and then resolved against durable state.

No OAuth secret, GitHub token, Figma token, Notion token, Calendar credential, or Harness policy body is rendered in status cards or Project History.

## 14. Shared-state guarantee

Web and Discord never maintain separate copies of Project Workspace state.

Discord status reads:

```text
DiscordProjectBinding
   -> ProjectWorkspace store
   -> ProjectWorkContext resolver
   -> Harness Run store
```

Iseol Web already reads the same Project Workspace/Harness stores. Therefore a tree status or Run stage change becomes visible to both surfaces without synchronization jobs.

Legacy integration data such as Discord channel IDs remains in `StoredProject` because Web does not own those provider-specific runtime handles.

## 15. Testing strategy

Required deterministic coverage:

- StoredProject -> legacy ProjectContext mapping
- guild mismatch rejection
- binding create/read/rebind protection/delete
- bound/unbound/stale DiscordProjectContext resolution
- node/run validation through `resolveProjectWorkContext()`
- `/project status` rendering for legacy-only and bound projects
- binding autocomplete isolation by guild
- Calendar action behavior unchanged when unbound
- bound Calendar/GitHub/review/Figma/Notion actions append one Project History event
- repeated event handling does not duplicate History
- provider success followed by History failure does not repeat provider mutation in the retry path
- Web and Discord views observe the same Project Workspace/Run state
- existing project create/delete, Calendar, review polling, and provider tests remain green

No real GitHub/Figma/Notion/Calendar mutation is required for unit tests. Existing provider adapters are injected/faked at the new contextual recording boundary.

## 16. Implementation boundaries

Likely new modules:

- `src/services/project-context.ts` — legacy StoredProject read model
- `src/discord-project/binding-store.ts` — explicit identity binding
- `src/discord-project/context-resolver.ts` — legacy + Workspace aggregate resolver
- `src/discord-project/status-card.ts` — Discord Project Workspace status rendering
- `src/discord-project/history-recorder.ts` — idempotent integration/action history append

Likely modified modules:

- `src/commands/project.ts`
- `src/services/calendar/calendar-discord.ts`
- `src/services/github-automation-polling.ts`
- Figma/Notion polling notification paths
- `src/project-model/contracts.ts`
- `src/interactions/interaction-router.ts` only if new component custom IDs require routing

Existing provider services remain authoritative and should not be rewritten merely to fit the new context layer.

## 17. Alternatives considered

### A. Replace StoredProject with ProjectWorkspace

Rejected. ProjectWorkspace does not currently own Discord category/channel IDs or the frontend/backend integration layout. A forced migration would risk breaking working bot behavior and violate the incremental migration rule.

### B. Auto-match by project name or repository

Rejected. It is convenient but can attach history to the wrong workspace. Explicit binding is safer and auditable.

### C. Compatibility bridge with explicit binding

Selected. It preserves working behavior, creates a narrow migration seam, and lets Web/Discord share durable Project Workspace state immediately when a binding exists.

## 18. Out of scope

This phase does not implement:

- Desktop Agent command execution
- ChatGPT Web launch/resume
- autonomous Run start/resume/cancel side effects
- automatic repository-to-tree feature inference
- destructive Project Tree reorganization
- replacement of `StoredProject` persistence
- removal or redesign of existing Discord capabilities

Those remain later delivery phases.

## 19. Success criteria

Discord contextualization is complete when:

1. existing project-scoped Discord behavior works without a Project Workspace binding;
2. an admin can explicitly bind a Discord StoredProject to an active Project Workspace;
3. `/project status` renders the same Workspace/tree/Run truth that Web reads;
4. invalid guild/project/node/run combinations fail closed;
5. bound Calendar/GitHub review/Figma/Notion project events become durable Project History without duplicate recording;
6. provider actions are not repeated solely because Project History recording failed;
7. existing Discord/provider regression tests remain green;
8. no existing project feature is removed to achieve contextualization.
