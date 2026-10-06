export function reviewRuntimeMessages(calendarEnabled: boolean): string[] {
  const messages = ["GitHub PR CI 코드리뷰/마일스톤 자동 감시 시작: 1분 간격"];
  if (!calendarEnabled) messages.push("GitHub milestone Calendar 동기화 대기: Google OAuth 미설정");
  return messages;
}
