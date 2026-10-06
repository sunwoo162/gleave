# NPC 셀프호스팅 오픈소스 출시 설계

## 목표

NPC를 누구나 안전하게 설치·실행할 수 있는 셀프호스팅 오픈소스 제품으로 공개한다. 기본 설치는 외부 서비스에 연결하지 않고 동작하며, 사용자가 명시적으로 설정한 연동만 활성화한다. AI Broadcast Room/방송실 기능은 이번 출시 범위에서 제외한다.

## 사용자와 성공 기준

### 대상 사용자

- 개인 개발자: 로컬 또는 Docker 환경에서 자신의 NPC 작업공간을 운영한다.
- 소규모 팀: Discord와 GitHub를 연결해 프로젝트·협업 흐름을 관리한다.
- 기여자: 재현 가능한 개발 환경에서 테스트하고 PR을 제출한다.

### 출시 성공 기준

1. 새 환경에서 `.env.example`과 공식 문서만으로 설치 및 시작이 가능하다.
2. 토큰이 없는 기본 실행은 외부 네트워크 부작용 없이 시작되고 상태 화면에 비활성 연동을 표시한다.
3. 설정된 Discord/GitHub 연동은 기존 테스트와 사용자 E2E를 통과한다.
4. 저장소에 운영 시크릿, 개인 데이터, 테스트 산출물이 포함되지 않는다.
5. CI가 `build`, 전체 테스트, 사용자 UI 빌드, 시크릿/문서 계약 검사를 수행한다.
6. AGPL-3.0 라이선스와 기여·보안 정책이 저장소 최상위에 명시된다.

## 범위

### 포함

- AGPL-3.0 라이선스 및 공개 저장소 메타데이터
- 현재 NPC 사용자 제품과 Discord 자동화 기능의 설치·운영 문서
- Docker 기반 실행, health check, graceful shutdown
- 환경변수 예시·검증·비밀값 취급 가이드
- 기본 비활성 외부 연동과 명시적 opt-in 정책
- CI 품질 게이트와 릴리스 체크리스트
- 보안 정책, 기여 가이드, 코드 오브 컨덕트
- 클린 환경 설치·실행 검증

### 제외

- AI Broadcast Room/방송실 기능
- 공식 호스팅 서비스, 결제, 멀티테넌트 SaaS 운영
- 기존 기능의 무관한 리팩터링
- 토큰 자동 발급 또는 사용자를 대신한 외부 계정 생성

## 배포 아키텍처

### 실행 모드

- `npm run dev`: 개발용 TypeScript 실행
- `npm start`: 빌드 산출물 실행
- Docker: 빌드된 Node 런타임 이미지에서 동일한 `npm start` 실행
- 모든 모드는 동일한 환경변수 이름과 기본 비활성 정책을 사용한다.

### 영속 데이터

- 운영 데이터는 저장소 밖의 명시적 데이터 디렉터리에 둔다.
- Docker에서는 `/app/data` 볼륨을 사용한다.
- `.env`, 토큰, 브라우저 프로필, 런타임 작업공간, 테스트 데이터는 이미지와 Git에 포함하지 않는다.
- 백업·복구는 파일 단위로 안내하되, 시크릿은 별도 비밀 저장소를 사용하도록 문서화한다.

### 외부 연동 경계

- 설정값이 없거나 명시적 활성화 플래그가 꺼져 있으면 연동을 생성하지 않는다.
- 연결 실패는 프로세스 전체를 무조건 종료시키지 않고 해당 기능의 상태로 기록한다.
- 실제 외부 요청은 사용자 승인 또는 명시적 운영 설정이 필요한 경계로 유지한다.
- Broadcast Room 관련 route, UI, 문서, 배포 설정은 출시 산출물에 포함하지 않는다.

## 보안과 운영

- 시크릿은 환경변수 또는 외부 secret manager에서만 읽는다.
- 로그와 오류 응답에서 토큰·쿠키·Authorization 헤더를 마스킹한다.
- 기본 HTTP 바인딩은 loopback 또는 Docker 내부 네트워크를 사용한다.
- 운영 공개 시 reverse proxy와 HTTPS를 사용하도록 문서화한다.
- health check는 프로세스 생존과 필수 로컬 상태만 확인하고 외부 서비스 성공을 가장하지 않는다.
- SIGINT/SIGTERM에서 서버·스케줄러·WebSocket·음성 리소스를 정리한다.

## 품질 게이트

1. `npm ci`
2. 시크릿·금지 기능·필수 문서 계약 테스트
3. `npm run build`
4. `npm run user-ui:build`
5. `npm test`
6. `npm run test:iseol-user-product`
7. `npm run test:iseol-browser-e2e`
8. Docker clean-room build 및 health check

릴리스 후보는 위 항목이 모두 통과하고 작업 트리가 clean일 때만 태그한다.

## 릴리스 산출물

- `LICENSE`
- 갱신된 `README.md`
- `.env.example`
- `Dockerfile`, `docker-compose.example.yml` 또는 동등한 배포 예시
- `.github/workflows/ci.yml`
- `CONTRIBUTING.md`, `SECURITY.md`, `CODE_OF_CONDUCT.md`
- 변경 이력과 `v1.0.0` 릴리스 체크리스트

## 단계적 구현 순서

1. 공개 저장소 기반과 라이선스·문서 정리
2. 환경변수·기본 비활성·시크릿 계약 검증
3. Docker/health check/graceful shutdown
4. CI와 클린 환경 설치 검증
5. 출시 전 전체 테스트·보안 감사·릴리스 후보

