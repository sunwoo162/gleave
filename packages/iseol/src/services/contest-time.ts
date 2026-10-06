const DAY_MS = 86_400_000;

export type ContestDeadlineSource = {
  period?: string;
  deadlineDate?: string;
  initialDeadlineDays?: number;
  createdAt?: string;
};

export function seoulDateKey(date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function dateKeyToUtc(dateKey: string): number | null {
  const match = dateKey.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!year || !month || !day) return null;
  return Date.UTC(year, month - 1, day);
}

function addDays(dateKey: string, days: number): string | undefined {
  const base = dateKeyToUtc(dateKey);
  if (base === null) return undefined;
  return new Date(base + days * DAY_MS).toISOString().slice(0, 10);
}

function explicitDeadline(period?: string): string | undefined {
  if (!period) return undefined;

  const matches = [...period.matchAll(/(?:(20)?(\d{2})[.\-/](\d{1,2})[.\-/](\d{1,2}))/g)];
  const match = matches.at(-1);
  if (!match) return undefined;

  const year = Number(match[1] ? `${match[1]}${match[2]}` : `20${match[2]}`);
  const month = Number(match[3]);
  const day = Number(match[4]);
  if (!year || !month || !day) return undefined;

  const check = new Date(Date.UTC(year, month - 1, day));
  if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) {
    return undefined;
  }

  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function resolveContestDeadline<T extends ContestDeadlineSource>(contest: T): T & { deadlineDate?: string } {
  if (contest.deadlineDate) return contest;

  const explicit = explicitDeadline(contest.period);
  if (explicit) return { ...contest, deadlineDate: explicit };

  if (!contest.createdAt) return contest;
  const createdDate = new Date(contest.createdAt);
  if (Number.isNaN(createdDate.getTime())) return contest;
  const createdDateKey = seoulDateKey(createdDate);

  if (contest.initialDeadlineDays !== undefined) {
    const deadlineDate = addDays(createdDateKey, contest.initialDeadlineDays);
    return deadlineDate ? { ...contest, deadlineDate } : contest;
  }

  if (/D-DAY/i.test(contest.period ?? "")) {
    return { ...contest, deadlineDate: createdDateKey };
  }

  const dDayText = contest.period?.match(/\bD-(\d+)\b/i)?.[1];
  if (!dDayText) return contest;

  const deadlineDate = addDays(createdDateKey, Number(dDayText));
  return deadlineDate ? { ...contest, deadlineDate } : contest;
}
