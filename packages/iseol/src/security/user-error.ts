import { sanitizeCredentialText } from "./text-safety.js";

export function formatUserFacingError(error: unknown, fallback = "알 수 없는 오류가 발생했습니다."): string {
  const rawMessage = error instanceof Error ? error.message : fallback;
  return sanitizeCredentialText(rawMessage.replace(/[\r\n]+/g, " "), 240);
}

export function formatAdministratorResetFailure(error: unknown): string {
  return `❌ 서버 초기화에 실패했습니다.\n\`${formatUserFacingError(error, "알 수 없는 오류")}\``;
}
