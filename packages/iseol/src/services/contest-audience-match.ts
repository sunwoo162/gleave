import type {
  ContestAudienceFilter,
  ContestCardData,
} from "./contest-feed.js";

function normalizeAudienceText(value?: string): string {
  return value?.normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim() ?? "";
}

export function matchesStrictContestAudience(
  contest: Pick<ContestCardData, "target">,
  filter: ContestAudienceFilter,
): boolean {
  if (filter === "all") return true;

  const target = normalizeAudienceText(contest.target);
  if (!target || target === "정보없음") return false;

  const universal = /누구나|누구든|제한\s*없|전\s*국민|모든\s*사람|모든\s*국민|전\s*연령|전체\s*대상/.test(target);
  if (universal) return true;

  const highSchool = /고등학생|고교생|중\s*[·,/및]*\s*고등학생|중고등학생|청소년|초중고/.test(target);
  const university = /대학생|대학원생|대학\s*\(?원\)?생|대학\s*재학생/.test(target);

  if (filter === "high-school") return highSchool;
  return university;
}
