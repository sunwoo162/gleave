# 웹앱 프로젝트 런타임 운영

EEEE는 사용자가 `로그인 기능이 있는 Todo 웹앱 만들어줘`처럼 한 문장으로 요청해도, 프로젝트를 단순 목업으로 끝내지 않는다.

## 실행 경계

1. 요청을 `runtimeProfile=web_app`으로 분류한다.
2. EEEE가 프론트엔드, API, 저장소, 인증 계약, 로컬 실행 문서를 함께 생성한다.
3. 생성된 API를 실제 프로세스로 실행하고 health/session/Todo 흐름을 확인한다.
4. ClaimLatch가 파일 존재, UTF-8, Python 컴파일, 실행 응답, 프로젝트 revision, QA 보고서와 release manifest의 일치를 검증한다.
5. 로컬 QA가 PASS여도 외부 OAuth·DB·호스팅 credential이 없으면 상태는 `awaiting_configuration`으로 유지한다.

## 사용자에게 보이는 상태

데스크톱은 프로젝트 ID와 함께 다음을 표시한다.

- 실행 프로필: `web_app`
- 품질 판정: `PASS`, `WARN`, `BLOCK`
- 배포 준비: `ready` 또는 `awaiting_configuration`
- 추가 설정이 필요한 connector 목록
- ClaimLatch profile과 최근 lifecycle event

따라서 “생성 완료”는 로컬 검증이 끝났다는 뜻이며, 외부 서비스 연결까지 끝났다고 과장하지 않는다.

## 생성 프로젝트의 기본 경계

- `apps/web`: FSD 기준 화면·entity·shared 코드
- `apps/api`: 로컬 API와 request/auth 경계
- `packages/auth`: demo 인증과 production OAuth 교체 계약
- `packages/db`: SQLite와 production DB 교체 계약
- `QA_REPORT.json`: 실행 증거와 검증 결과
- `RELEASE_MANIFEST.json`: ClaimLatch release gate와 Git revision
- `DEPLOYMENT.md`: credential 설정 이후의 배포 절차

로컬 세션과 SQLite 데이터는 생성 프로젝트의 `.gitignore`로 제외한다. production auth/database는 연결된 provider가 실제로 성공한 뒤에만 ready로 승격할 수 있다.
