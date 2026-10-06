# Iseol Project Context Resolver Design

## Goal

이설의 기존 `StoredProject` 데이터를 웹, Discord interaction, 자동화 워크플로우가 공통으로 사용할 수 있는 읽기 전용 `ProjectContext`로 변환한다.

기존 `projects.json` 저장 형식과 프로젝트 생성/수정/삭제 흐름은 변경하지 않는다.

## Scope

이번 단계에서 추가하는 것은 `ProjectContextResolver`뿐이다.

포함:
- `StoredProject` → `ProjectContext` 변환
- `projectId + guildId` 기반 안전한 조회
- frontend/backend 저장소 선택 헬퍼
- Calendar/Figma/Notion/Discord 연결 상태 표현
- 단위 테스트와 회귀 테스트

제외:
- GitHub Issue 실제 생성
- Calendar 일정 실제 생성
- GPT 실행 요청
- 웹 API/HTTP endpoint
- 새 JSON/DB 저장소

## Data Model

`ProjectContext`는 기존 데이터를 복제 저장하지 않고 요청 시 파생한다.

```ts
export type ProjectContext = {
  projectId: string;
  name: string;
  guildId: string;
  categoryId: string;
  organization: string;
  repositories: {
    frontend: RepositoryRef;
    backend: RepositoryRef;
  };
  integrations: {
    calendar: { id?: string; url?: string; channelId?: string };
    figma: { url?: string; fileKey?: string; channelId?: string };
    notion: { url?: string; pageId?: string; channelId?: string };
  };
  channels: {
    frontendLogId?: string;
    backendLogId?: string;
  };
};
```

## Resolver Interface

핵심 API는 두 개로 제한한다.

```ts
export async function resolveProjectContext(
  projectId: string,
  guildId: string,
): Promise<ProjectContext | null>;

export function selectProjectRepository(
  context: ProjectContext,
  side: "frontend" | "backend",
): RepositoryRef;
```

`resolveProjectContext`는 먼저 `findProject(projectId)`를 사용하고, 조회된 프로젝트의 `guildId`가 요청한 `guildId`와 다르면 `null`을 반환한다.

이 검증은 Discord 서버 간 projectId 재사용/노출 시 다른 서버의 프로젝트 정보를 읽지 못하게 하는 경계다.

`selectProjectRepository`는 임의 문자열을 받지 않고 union 타입만 받는다. 잘못된 저장소 선택 문자열 파싱은 상위 interaction/API 계층의 책임으로 둔다.

## Data Flow

```text
Discord/Web/Automation caller
        ↓
projectId + guildId
        ↓
ProjectContextResolver
        ↓
findProject(projectId)
        ↓
guildId 검증
        ↓
ProjectContext 반환
```

모든 값은 현재 `StoredProject`에서 즉시 파생하므로 별도의 동기화 작업이 없다.

프로젝트가 수정되면 다음 resolver 호출부터 새 값이 반영되고, 삭제되면 `null`이 반환된다.

## Error Handling

- 존재하지 않는 projectId → `null`
- 다른 guild의 projectId → `null`
- 선택적 integration 값 누락 → 해당 필드를 `undefined`로 유지
- 저장소 선택 → `frontend | backend` 타입으로 제한
- 파일 read 오류를 resolver에서 새 방식으로 삼키지 않는다. 기존 `findProject` 동작을 유지한다.

## Testing

새 테스트는 `tests/project-context.test.ts`에 둔다.

필수 케이스:
- StoredProject의 필수/선택 필드가 정확히 ProjectContext로 매핑됨
- 같은 guildId에서 context 조회 성공
- 다른 guildId에서 조회 거부
- 존재하지 않는 projectId에서 `null`
- frontend/backend 저장소 선택 결과가 정확함
- 기존 프로젝트 저장 형식은 변경되지 않음

테스트는 실제 파일 저장소를 직접 오염시키지 않도록 순수 변환 함수와 resolver 의존성 주입 경계를 분리한다.

## Future Boundary: Action Dispatcher

다음 단계의 `ActionDispatcher`는 `ProjectContext`만 소비한다.

Dispatcher가 `projects.json`을 직접 읽거나 `StoredProject`를 직접 해석하지 않게 해, Discord와 웹이 동일한 권한/프로젝트 경계를 공유하게 한다.

예상 action key:
- `project.status.read`
- `github.issue.create`
- `calendar.event.create`
- 이후 `web.gpt.request`

이번 spec에서는 dispatcher 구현을 포함하지 않는다.
