export type IdeaLabRuntimeCapabilities = {
  projectExecution?: "ready" | "unavailable";
  aiChat?: "ready" | "unavailable";
};

export type IdeaLabRuntimeView = {
  project: { ready: boolean; label: string };
  ai: { ready: boolean; label: string };
};

function capabilityLabel(
  value: "ready" | "unavailable" | undefined,
  labels: { ready: string; unavailable: string; unknown: string },
): { ready: boolean; label: string } {
  return value === "ready"
    ? { ready: true, label: labels.ready }
    : value === "unavailable"
      ? { ready: false, label: labels.unavailable }
      : { ready: false, label: labels.unknown };
}

export function buildIdeaLabRuntimeView(input: IdeaLabRuntimeCapabilities | null): IdeaLabRuntimeView {
  return {
    project: capabilityLabel(input?.projectExecution, {
      ready: "프로젝트 Runtime 준비됨",
      unavailable: "프로젝트 Runtime 연결 대기",
      unknown: "프로젝트 Runtime 상태 확인 중",
    }),
    ai: capabilityLabel(input?.aiChat, {
      ready: "개인 AI 후보 생성 준비됨",
      unavailable: "개인 AI 후보 생성 대기",
      unknown: "개인 AI 후보 생성 상태 확인 중",
    }),
  };
}
