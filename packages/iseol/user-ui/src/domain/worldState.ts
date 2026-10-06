import type { IconName } from '../components/Icon';

export function calendarDateForTimeZone(timezone?: string, at: Date | string = new Date()): string {
  const instant = at instanceof Date ? at : new Date(at);
  if (!Number.isFinite(instant.getTime())) throw new Error('Invalid timestamp for calendar date');
  const browserTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  const requestedTimezone = timezone?.trim() || browserTimezone;
  const formatParts = (zone: string): Record<string, string> => Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: zone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(instant).map((part) => [part.type, part.value]));
  let parts: Record<string, string>;
  try {
    parts = formatParts(requestedTimezone);
  } catch {
    parts = formatParts(browserTimezone);
  }
  if (!parts.year || !parts.month || !parts.day) throw new Error('Calendar date unavailable');
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function worldDateFormatter(timezone: string | undefined, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const browserTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  const requestedTimezone = timezone?.trim() || browserTimezone;
  try {
    return new Intl.DateTimeFormat('en-US', { ...options, timeZone: requestedTimezone });
  } catch {
    return new Intl.DateTimeFormat('en-US', { ...options, timeZone: browserTimezone });
  }
}

function formatWorldTimestamp(timezone: string | undefined, value: string, options: Intl.DateTimeFormatOptions): string {
  const instant = new Date(value);
  if (!Number.isFinite(instant.getTime())) return '날짜 확인 불가';
  return worldDateFormatter(timezone, options).format(instant);
}

export function formatWorldDate(timezone: string | undefined, value: string): string {
  return formatWorldTimestamp(timezone, value, { dateStyle: 'medium' });
}

export function formatWorldDateTime(timezone: string | undefined, value: string): string {
  return formatWorldTimestamp(timezone, value, { dateStyle: 'medium', timeStyle: 'short' });
}

export function formatWorldTime(timezone: string | undefined, value: string): string {
  return formatWorldTimestamp(timezone, value, { timeStyle: 'short' });
}

export type WorldMissionState = "recorded" | "next-action";

export type WorldMission = {
  id: "projects" | "learning" | "reviews";
  icon: IconName;
  title: string;
  description: string;
  href: string;
  state: WorldMissionState;
  evidenceCount: number;
  lastRecordedAt?: string;
  userActionState: "recorded" | "not-recorded";
  lastUserActionAt?: string;
};

export type WorldMissionActivity = {
  eventType: string;
  verificationStatus: "verified" | "unverified" | "unknown";
  occurredAt: string;
  status?: "active" | "retracted";
  payload?: Record<string, string | number | boolean | null>;
};

const missionEvidenceTypes: Record<WorldMission["id"], string> = {
  projects: "project.run.completed",
  learning: "learning.session.completed",
  reviews: "learning.review.completed",
};

function evidenceFor(id: WorldMission["id"], events: WorldMissionActivity[]): Pick<WorldMission, "evidenceCount" | "lastRecordedAt"> {
  const matching = events
    .filter((event) => event.eventType === missionEvidenceTypes[id] && event.verificationStatus === "verified")
    .filter((event) => Number.isFinite(Date.parse(event.occurredAt)));
  const latest = matching.reduce<string | undefined>((current, event) => {
    if (!current || Date.parse(event.occurredAt) > Date.parse(current)) return event.occurredAt;
    return current;
  }, undefined);
  return { evidenceCount: matching.length, ...(latest ? { lastRecordedAt: latest } : {}) };
}

function userActionFor(id: WorldMission["id"], events: WorldMissionActivity[]): Pick<WorldMission, "userActionState" | "lastUserActionAt"> {
  const matching = events
    .filter((event) => event.eventType === "world.mission.completed")
    .filter((event) => event.verificationStatus === "unverified" && event.status !== "retracted")
    .filter((event) => event.payload?.missionId === id)
    .filter((event) => Number.isFinite(Date.parse(event.occurredAt)));
  const latest = matching.reduce<string | undefined>((current, event) => {
    if (!current || Date.parse(event.occurredAt) > Date.parse(current)) return event.occurredAt;
    return current;
  }, undefined);
  return { userActionState: latest ? "recorded" : "not-recorded", ...(latest ? { lastUserActionAt: latest } : {}) };
}

export function buildWorldMissions(input: {
  projectCount: number;
  learningPlanCount: number;
  dueReviewCount: number;
  recentActivityEvents?: WorldMissionActivity[];
}): WorldMission[] {
  const projectCount = Math.max(0, input.projectCount);
  const learningPlanCount = Math.max(0, input.learningPlanCount);
  const dueReviewCount = Math.max(0, input.dueReviewCount);
  const events = input.recentActivityEvents ?? [];

  return [
    {
      id: "projects",
      icon: "bolt",
      title: projectCount > 0 ? `프로젝트 ${projectCount}개 작업실 확인하기` : "첫 프로젝트 만들기",
      description: projectCount > 0
        ? "저장된 프로젝트의 실행 상태와 작업 요청을 확인하세요."
        : "실제로 저장되는 사용자 프로젝트를 만들어 보세요.",
      href: "/projects",
      state: projectCount > 0 ? "recorded" : "next-action",
      ...evidenceFor("projects", events),
      ...userActionFor("projects", events),
    },
    {
      id: "learning",
      icon: "book",
      title: learningPlanCount > 0 ? `학습 계획 ${learningPlanCount}개 이어가기` : "학습 계획 만들기",
      description: learningPlanCount > 0
        ? "활성 계획을 열고 학습 세션 또는 시도를 기록하세요."
        : "학습 목표와 설명을 저장해 학습 흐름을 시작하세요.",
      href: "/learning",
      state: learningPlanCount > 0 ? "recorded" : "next-action",
      ...evidenceFor("learning", events),
      ...userActionFor("learning", events),
    },
    {
      id: "reviews",
      icon: "rotate",
      title: dueReviewCount > 0 ? `도래한 복습 ${dueReviewCount}개 확인하기` : "복습 큐 확인하기",
      description: dueReviewCount > 0
        ? "오늘 도래한 복습 항목을 평가하면 다음 시점이 저장됩니다."
        : "학습 공간에서 복습 항목을 만들고 다음 복습을 예약하세요.",
      href: "/learning",
      state: "next-action",
      ...evidenceFor("reviews", events),
      ...userActionFor("reviews", events),
    },
  ];
}
