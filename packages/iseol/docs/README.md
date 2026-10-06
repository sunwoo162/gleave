# ISEOL 문서 진입점

새 세션은 다음 순서로 읽는다. 제품 요구사항, 구현 사실, 운영 시점 관찰을 서로 대체하지 않는다.

1. [인수인계](ISEOL_HANDOVER.md): 보존 범위와 안전한 조사 순서
2. [기능 인벤토리](ISEOL_FEATURE_INVENTORY.md): 기존 구현과 미검증 범위
3. [2026-09-21 조사 보고](audits/2026-09-21-system-review.md): 당시 Git/운영 상태, 결함과 증거
4. [최종 제품 명세](ISEOL_PRODUCT_SPEC.md): 사용자가 확정한 목표
5. [통합 아키텍처](ISEOL_ARCHITECTURE.md): 승인된 단계적 확장 설계
6. [AI 학습 상세 명세](ISEOL_LEARNING_SPEC.md): UX, 데이터, API, 프롬프트 A–K
7. [개발 로드맵](superpowers/plans/2026-09-21-integrated-development.md): 선행 조건과 완료 기준
8. [Harness 규칙](HARNESS_ENGINEERING.md), [운영 복구 절차](ISEOL_RUNTIME_RECOVERY.md)

기존 `superpowers/specs/`와 `superpowers/plans/`는 삭제하지 않는다. 오래된 절차의 당시 상태는 최신 운영 상태가 아니다. Runtime 복구 문서의 환경변수 전용 인증 설명은 현행 보호 credential 계약으로 정정했으며, 실제 작업에서는 항상 현행 CLI와 대조한다.

이번 문서군은 제품 코드 구현이나 운영 전환 승인이 아니다. 운영 시작/종료, 외부 AI 요청, containment, GitHub/Discord/배포는 각각 현재 세션의 승인 범위를 확인한다.
# Local preview implementation

See [ISEOL_LOCAL_PREVIEW.md](ISEOL_LOCAL_PREVIEW.md) for the Vercel-free
Idea Lab deployment mode, trusted local process contract, browser acceptance
gate, and durable external request budget.
