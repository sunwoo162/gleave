# Gleave 저장소 규칙

## 저장소 경계

이 저장소는 EEEE, ISEOL, ClaimLatch adapter, Desktop shell을 하나의 제품으로 관리합니다. `apps/eeee` 내부의 기존 앱 전용 설정은 호환성을 위해 유지하지만, Aggregate Repository의 CI·PR·CODEOWNERS는 반드시 루트 `.github`를 기준으로 합니다.

## 커밋

커밋은 하나의 논리적 변경 단위로 작성합니다.

```text
feat: add todo project scaffold
fix: reject stale release revision
test: cover responsive todo flow
refactor: isolate agent path permissions
docs: define release evidence contract
chore: update dependency metadata
```

본문에는 사용자 영향이 있거나 revision/ClaimLatch 계약이 바뀌는 경우 이유와 검증 명령을 추가합니다.

## PR

PR은 파일 단위가 아니라 사용자에게 전달되는 수직 기능 단위로 만듭니다. Agent 하나의 내부 수정마다 PR을 만들지 않습니다.

PR 승인 전에는 다음이 필요합니다.

- 최신 통합 revision 기준 테스트
- 독립 QA 결과
- UTF-8/secret/path-boundary 검사
- ClaimLatch report와 receipt
- release manifest 또는 명확한 “아직 release 대상 아님” 표시

## 완료 판정

Agent의 자연어 완료 보고는 증거가 아닙니다. 실행 로그, artifact path, revision, QA evidence, ClaimLatch receipt가 모두 있어야 최종 완료로 판정합니다.

## 생성 프로젝트

프로젝트 생성 요청은 기본적으로 FSD 구조와 Stayfolio-derived `DESIGN.md`를 사용합니다. 사용자가 디자인·기술 스택·구조를 명시하면 사용자 요구사항이 기본값보다 우선합니다.
