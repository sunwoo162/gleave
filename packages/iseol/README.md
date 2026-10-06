# NPC

NPC는 개인 작업공간, 프로젝트 실행 기록, 학습·협업·포트폴리오 흐름을
하나의 사용자 경험으로 연결하는 셀프호스팅 오픈소스 플랫폼입니다.

현재 제품은 두 가지 축으로 동작합니다.

- 사용자 웹 앱: 개인 세계, 프로젝트 작업실, 학습, 팀·커뮤니티, 포트폴리오
- Discord 자동화 봇: 프로젝트 구조 생성, GitHub/Notion/Figma 연결, 일정·스크럼 자동화

기본 설치는 외부 서비스에 연결하지 않습니다. Discord, GitHub, Figma,
Notion, Google, Vercel, AI 연동은 사용자가 직접 환경변수를 설정하고
명시적으로 활성화한 경우에만 사용됩니다.

## 빠른 시작

### 로컬 실행

요구 사항: Node.js 22 이상, npm.

```bash
git clone https://github.com/sunwoo162/iseol-bot.git
cd iseol-bot
npm ci
npm run setup:self-hosted
# 기본 data/ 대신 다른 위치를 쓰려면:
# npm run setup:self-hosted -- --data-root ./local-data
npm run build
npm run user-ui:build
npm run iseol:runtime -- start
```

`setup:self-hosted`는 `.env.example`을 기반으로 `.env`와 `iseol-runtime.json`을
만들고, 선택한 data root 아래에 필요한 저장소 디렉터리를 생성합니다. 이미 설정
파일이 있으면 덮어쓰지 않으므로 재설정할 때만 `--force`를 사용하세요. 위 명령은
Discord 자격증명 없이 웹 제품을 실행합니다. Discord 봇을 별도로
실행할 때만 `npm start`를 사용하고, 그 경우 Discord·provider 환경변수를
추가로 설정하세요. 웹 앱은 `/app/`에서 제공됩니다. 운영 환경에서는 reverse
proxy와 HTTPS를 사용하고, `data/`와 설정 파일을 저장소 밖에 보관하세요.

상태 확인은 `GET /healthz`(프로세스 liveness)와 `GET /readyz`(웹 서비스
readiness)를 사용합니다. Docker healthcheck는 `/healthz`만 확인하므로
선택적 외부 연동이 비활성화된 상태에서도 웹 서비스가 정상인지 확인할 수
있습니다. 런타임이 stale lock으로 시작을 거부하면 `status` 명령의 fingerprint를
확인한 뒤 문서화된 operator recovery 명령을 명시적으로 실행해야 합니다.
자세한 복구 절차는 [`docs/ISEOL_RUNTIME_RECOVERY.md`](docs/ISEOL_RUNTIME_RECOVERY.md)를
참고하세요.

### Docker

```bash
docker compose -f docker-compose.example.yml up --build
```

컨테이너는 `/app/data`를 영속 볼륨으로 사용하며, 기본 포트는 `3000`입니다.
외부 연동은 기본적으로 비활성입니다.

### SSH 배포

Docker 없이 Linux 서버에 배포하려면 저장소의 `Deploy over SSH` GitHub Actions
워크플로를 수동 실행하세요. 이 워크플로는 GitHub Actions에서 빌드·테스트한 뒤
릴리스 아카이브를 SSH로 서버에 업로드하고, 서버에서 PM2로 `iseol-web` 런타임을
재시작한 다음 `/healthz`를 확인합니다. Docker는 별도 패키징 선택지이며 SSH
배포의 필수 조건이 아닙니다.

워크플로의 `production` Environment에 다음 Secrets를 등록해야 합니다.

- `DEPLOY_HOST`, `DEPLOY_PORT`, `DEPLOY_USER`, `DEPLOY_PATH`
- `DEPLOY_SSH_PRIVATE_KEY`: 배포 전용 SSH 개인 키
- `DEPLOY_KNOWN_HOSTS`: `ssh-keyscan` 결과를 검토한 뒤 저장한 고정 host key

대상 서버에는 Node.js 22 이상, npm, PM2, curl, tar가 필요합니다. PM2가 없으면
원격 배포 스크립트가 `pm2`를 찾지 못해 중단하므로 먼저 `npm install --global
pm2`로 설치하세요. 운영 데이터와 `.env`는 `${DEPLOY_PATH}` 아래에 릴리스와
분리되어 유지되며, 이전 릴리스는 롤백을 위해 보존됩니다. 실제 공개 서비스는
이 런타임 앞에 HTTPS reverse proxy를 두세요.

## 환경변수와 연동

`.env.example`을 복사한 뒤 필요한 값만 설정하세요.

- Discord: `DISCORD_TOKEN`, `DISCORD_CLIENT_ID`
- GitHub: `GITHUB_TOKEN` 및 선택적 webhook 설정
- Figma/Notion/Google: 해당 provider 토큰·OAuth 설정
- Vercel/ChatGPT/Idea Lab: 명시적 runtime 설정이 있을 때만 활성화

토큰은 절대 Git에 커밋하거나 로그·이슈·스크린샷에 포함하지 마세요.
각 provider에 필요한 최소 권한만 부여하세요.

## 테스트

```bash
npm run build
npm run user-ui:build
npm test
npm run test:iseol-user-product
npm run test:iseol-browser-e2e
```

전체 테스트는 메모리 안전한 배치 러너를 사용합니다. 외부 자격증명이 없는
환경에서도 기본 테스트와 제품 테스트가 실행되어야 합니다.

## 데이터와 보안

운영 데이터는 `data/` 또는 Docker volume에 저장됩니다. 백업할 때는 토큰과
브라우저 프로필을 데이터 백업과 분리하세요. 공개 인터넷에 직접 노출하지
말고 reverse proxy, HTTPS, 방화벽을 사용하세요.

## 범위 안내

NPC는 사용자 승인과 실제 실행 증거를 기준으로 프로젝트 상태를 기록합니다.
AI Broadcast Room/방송실 기능은 현재 공개 제품 범위에 포함하지 않습니다.

## 기여와 라이선스

기여 방법은 [`CONTRIBUTING.md`](CONTRIBUTING.md), 보안 신고는
[`SECURITY.md`](SECURITY.md)를 참고하세요. NPC는
[AGPL-3.0-only](LICENSE)로 배포됩니다.
