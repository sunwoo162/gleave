import { createHash, randomUUID } from "node:crypto";
import { assertIdentityId, assertTimestamp, type Principal } from "../identity/contracts.js";
import type { CodingAttempt, CodingAttemptInput, CodingExercise, CodingExerciseInput, CodingPracticeResult, GoalInterpretation, LearningAnswerReceipt, LearningContentRequest, LearningFeedback, LearningFeedbackDispute, LearningFeedbackDisputeResult, LearningFeedbackEvaluation, LearningFeedbackEvaluationInput, LearningGoal, LearningGoalInput, LearningGoalSessionInput, LearningLessonBlock, LearningLessonContent, LearningLessonInput, LearningPlanAdjustment, LearningPlanAdjustmentInput, LearningPlanAdjustmentResult, LearningPlanInput, LearningPlanPreview, LearningPlanProposal, LearningPlanVersion, LearningProgress, LearningProjectApplication, LearningProjectApplicationInput, LearningReport, LearningReportPeriod, LearningService, LearningServiceOptions, LearningSessionAction, LearningSessionActionInput, ReviewItemInput, CodeAnalysisInput, StudyAttemptInput, LearningPlan, LearningPlanDay, LearningSession, LearningToday, ReviewItem, CodeAnalysisResult } from "./contracts.js";
import { listAttempts, listAttemptsUnlocked, listCodingAttempts, listCodingAttemptsUnlocked, listCodingExercises, listGoalInterpretations, listGoalInterpretationsUnlocked, listLearningAnswerReceipts, listLearningAnswerReceiptsUnlocked, listLearningContentRequests, listLearningContentRequestsUnlocked, listLearningFeedback, listLearningFeedbackDisputes, listLearningFeedbackDisputesUnlocked, listLearningGoalsUnlocked, listLearningPlanAdjustments, listLearningPlanAdjustmentsUnlocked, listLearningPlanVersions, listLearningPlanVersionsUnlocked, listLearningProjectApplications, listLearningProjectApplicationsUnlocked, listLearningLinks, listLearningReports, listLearningReportsUnlocked, listLearningSessionActions, listLearningSessionActionsUnlocked, listPlans, listReviews, listReviewsUnlocked, listSessions, loadAnalysis, loadCodingAttempt, loadCodingAttemptUnlocked, loadCodingExercise, loadLearningAnswerReceipt, loadLearningAnswerReceiptUnlocked, loadLearningContentRequest, loadLearningContentRequestUnlocked, loadLearningFeedback, loadLearningGoal, loadLearningGoalUnlocked, loadLearningPlanAdjustment, loadLearningPlanAdjustmentUnlocked, loadLearningPlanVersion, loadLearningPlanVersionUnlocked, loadLearningReport, loadLearningReportUnlocked, loadPlan, loadReview, loadReviewUnlocked, loadSession, loadSessionUnlocked, loadLearningProjectApplication, saveAnalysis, saveAttempt, saveAttemptUnlocked, saveCodingAttempt, saveCodingAttemptUnlocked, saveCodingExercise, saveLearningAnswerReceipt, saveLearningAnswerReceiptUnlocked, saveLearningContentRequest, saveLearningContentRequestUnlocked, saveLearningFeedback, saveLearningGoal, saveLearningGoalUnlocked, saveLearningFeedbackDispute, saveLearningFeedbackDisputeUnlocked, saveLearningPlanAdjustment, saveLearningPlanAdjustmentUnlocked, saveLearningSessionAction, saveLearningSessionActionUnlocked, saveGoalInterpretation, saveGoalInterpretationUnlocked, saveLearningPlanVersion, saveLearningPlanVersionUnlocked, saveLearningProjectApplication, saveLearningProjectApplicationUnlocked, saveLearningLink, saveLearningReport, saveLearningReportUnlocked, savePlan, saveReview, saveReviewUnlocked, saveSession, saveSessionUnlocked } from "./store.js";
import { withDurableLearningSessionLock } from "./session-lock.js";
import { withDurableLearningProjectApplicationLock } from "./project-application-lock.js";
import { withDurableLearningProjectApplicationAcceptanceLock } from "./project-application-acceptance-lock.js";
import { withDurableLearningPlanPreviewLock } from "./plan-preview-lock.js";
import { withDurableLearningPlanAdjustmentLock } from "./plan-adjustment-lock.js";
import { withDurableLearningPlanAdjustmentAcceptanceLock } from "./plan-adjustment-acceptance-lock.js";
import { withDurableLearningReportLock } from "./report-lock.js";
import { withDurableLearningGoalSessionLock } from "./goal-session-lock.js";
import { withDurableLearningSessionStartLock } from "./session-start-lock.js";
import { withDurableLearningReviewLock } from "./review-lock.js";
import { withDurableLearningCodingAttemptLock } from "./coding-attempt-lock.js";
import { withDurableLearningAnswerLock } from "./answer-lock.js";
import { withDurableLearningFeedbackDisputeLock } from "./feedback-dispute-lock.js";
import { withDurableLearningActionLock } from "./action-lock.js";
import { withDurableLearningFeedbackCompletionLock } from "./feedback-completion-lock.js";
import { withDurableLearningGoalLock } from "./goal-lock.js";
import { createUserRuntimeDispatchGate } from "../runtime/user-runtime-dispatch-gate.js";
import { sanitizeCredentialText } from "../security/text-safety.js";

function ensurePrincipal(principal: Principal): void { assertIdentityId(principal.userId); }
function safeRuntimeBlocker(value: string): string { return sanitizeCredentialText(value, 500); }
function principalTimezone(principal: Principal): string | undefined {
  const candidate = (principal as Principal & { timezone?: unknown }).timezone;
  return typeof candidate === "string" && candidate.trim() ? candidate : undefined;
}

function learningDate(at: string, timezone?: string): { date: string; timezoneApplied: boolean } {
  if (!timezone) return { date: at.slice(0, 10), timezoneApplied: false };
  try {
    const parts = new Intl.DateTimeFormat("en-US", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(at));
    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    if (values.year && values.month && values.day) return { date: `${values.year}-${values.month}-${values.day}`, timezoneApplied: true };
  } catch { /* invalid user timezone falls back to the server boundary and remains visible to the caller */ }
  return { date: at.slice(0, 10), timezoneApplied: false };
}
function reportPeriod(input: { period: LearningReportPeriod }): LearningReportPeriod {
  if (!input || !input.period || !["weekly", "final", "custom"].includes(input.period.kind)) throw new Error("Learning report period is invalid");
  const from = input.period.from;
  const to = input.period.to;
  const canonical = (value: string): string => {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error("Learning report period is invalid");
    const timestamp = Date.parse(`${value}T00:00:00.000Z`);
    if (Number.isNaN(timestamp) || new Date(timestamp).toISOString().slice(0, 10) !== value) throw new Error("Learning report period is invalid");
    return value;
  };
  const start = canonical(from);
  const end = canonical(to);
  const span = Math.floor((Date.parse(`${end}T00:00:00.000Z`) - Date.parse(`${start}T00:00:00.000Z`)) / 86_400_000) + 1;
  if (start > end || span > 366) throw new Error("Learning report period is invalid");
  return { from: start, to: end, kind: input.period.kind };
}
function inReportPeriod(date: string, period: LearningReportPeriod): boolean { return date >= period.from && date <= period.to; }
type InternalLearningFeedbackOptions = { answerLockHeld?: boolean };
type InternalLearningService = LearningService & {
  completeLearningFeedback(principal: Principal, feedbackId: string, input: LearningFeedbackEvaluationInput, options?: InternalLearningFeedbackOptions): Promise<LearningFeedback>;
};
async function loadOwnerGoal(root: string, principal: Principal, goalId: string, goalLockHeld = false): Promise<LearningGoal | null> {
  try { assertIdentityId(goalId); } catch { return null; }
  const goal = goalLockHeld ? await loadLearningGoalUnlocked(root, principal.userId, goalId) : await loadLearningGoal(root, principal.userId, goalId);
  return goal?.userId === principal.userId ? goal : null;
}
function nonEmpty(value: string, label: string, max = 500): string {
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > max) throw new Error(label + " is required");
  return trimmed;
}
function requiredString(value: unknown, label: string, max = 500): string {
  if (typeof value !== "string") throw new Error(`${label} is invalid`);
  return nonEmpty(value, label, max);
}
function addDays(at: string, days: number): string { return new Date(Date.parse(at) + days * 24 * 60 * 60 * 1000).toISOString(); }
function timeZoneOffsetMinutes(at: Date, timezone: string): number {
  const part = new Intl.DateTimeFormat("en-US", { timeZone: timezone, timeZoneName: "shortOffset" })
    .formatToParts(at)
    .find((candidate) => candidate.type === "timeZoneName")?.value;
  if (!part) throw new Error("timezone offset unavailable");
  const match = /^(?:GMT|UTC)([+-])(\d{1,2})(?::?(\d{2}))?$/.exec(part);
  if (!match) {
    if (part === "GMT" || part === "UTC") return 0;
    throw new Error("timezone offset invalid");
  }
  const minutes = Number(match[2]) * 60 + Number(match[3] ?? 0);
  return (match[1] === "-" ? -1 : 1) * minutes;
}
function addCalendarDays(at: string, days: number, timezone?: string): string {
  if (!timezone) return addDays(at, days);
  try {
    const instant = new Date(at);
    if (!Number.isFinite(instant.getTime())) throw new Error("timestamp invalid");
    const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    }).formatToParts(instant).map((part) => [part.type, part.value]));
    const wallClockUtc = Date.UTC(
      Number(parts.year), Number(parts.month) - 1, Number(parts.day) + days,
      Number(parts.hour), Number(parts.minute), Number(parts.second), instant.getUTCMilliseconds(),
    );
    let candidate = wallClockUtc;
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const next = wallClockUtc - timeZoneOffsetMinutes(new Date(candidate), timezone) * 60_000;
      if (next === candidate) return new Date(next).toISOString();
      candidate = next;
    }
    return new Date(candidate).toISOString();
  } catch {
    return addDays(at, days);
  }
}
function validateLearningGoalDuration(duration: LearningGoalInput["duration"], today: string): LearningGoalInput["duration"] {
  if (!duration || typeof duration !== "object") throw new Error("Learning goal duration is required");
  if ("days" in duration) {
    if (!Number.isInteger(duration.days) || duration.days < 1 || duration.days > 3650) throw new Error("Learning goal duration is invalid");
    return { days: duration.days };
  }
  if ("targetDate" in duration && typeof duration.targetDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(duration.targetDate)) {
    const timestamp = Date.parse(`${duration.targetDate}T00:00:00.000Z`);
    const canonicalDate = Number.isNaN(timestamp) ? "" : new Date(timestamp).toISOString().slice(0, 10);
    if (canonicalDate === duration.targetDate && duration.targetDate >= today) return { targetDate: duration.targetDate };
  }
  throw new Error("Learning goal duration is invalid");
}
function durationDays(duration: LearningGoalInput["duration"], today: string): number {
  if ("days" in duration) return duration.days;
  return Math.floor((Date.parse(`${duration.targetDate}T00:00:00.000Z`) - Date.parse(`${today}T00:00:00.000Z`)) / 86_400_000) + 1;
}
function dayDate(today: string, dayIndex: number): string {
  return new Date(Date.parse(`${today}T00:00:00.000Z`) + (dayIndex - 1) * 86_400_000).toISOString().slice(0, 10);
}
function activitiesFor(minutes: number): LearningPlanDay["activities"] {
  if (minutes <= 3) return [{ kind: "concept", minutes }];
  const review = Math.min(5, Math.max(1, Math.floor(minutes * 0.2)));
  const concept = Math.max(1, Math.floor(minutes * 0.4));
  const practice = Math.max(1, Math.floor(minutes * 0.3));
  const feedback = minutes - review - concept - practice;
  const activities: LearningPlanDay["activities"] = [];
  if (review > 0) activities.push({ kind: "review", minutes: review });
  if (concept > 0) activities.push({ kind: "concept", minutes: concept });
  if (practice > 0) activities.push({ kind: "practice", minutes: practice });
  if (feedback > 0) activities.push({ kind: "feedback", minutes: feedback });
  return activities;
}
function previewFor(goal: LearningGoal, at: string, interpretation: GoalInterpretation, planId: string, timezone?: string): LearningPlanVersion {
  const today = learningDate(at, timezone).date;
  const totalDays = durationDays(goal.input.duration, today);
  const subjectKey = goal.input.subjectText.trim().replace(/\s+/g, "-").slice(0, 80);
  const outcomes = interpretation.feasibleOutcomes;
  const phases = Math.min(4, totalDays);
  const segments = Array.from({ length: phases }, (_, index) => {
    const dayFrom = Math.floor(index * totalDays / phases) + 1;
    const dayTo = Math.floor((index + 1) * totalDays / phases);
    return { id: `${planId}-segment-${index + 1}`, dayFrom, dayTo, outcomeIds: [outcomes[index % outcomes.length]!] };
  });
  const days: LearningPlanDay[] = Array.from({ length: totalDays }, (_, index) => {
    const dayIndex = index + 1;
    const phase = Math.min(phases - 1, Math.floor(index * phases / totalDays));
    return {
      id: `${planId}-day-${dayIndex}`,
      dayIndex,
      localDate: dayDate(today, dayIndex),
      conceptIds: [`${planId}-concept-${phase + 1}-${subjectKey}`],
      minutes: goal.input.dailyMinutes,
      activities: activitiesFor(goal.input.dailyMinutes),
      checkpoint: dayIndex === totalDays ? "final" : dayIndex === Math.ceil(totalDays / 2) ? "midpoint" : "none",
    };
  });
  return {
    version: 1, id: planId, userId: goal.userId, goalId: goal.id, inputRevision: goal.revision,
    templateVersion: "learning-plan-template-v1", interpretationId: interpretation.id, segments, outcomes,
    budget: { durationDays: totalDays, dailyMinutes: goal.input.dailyMinutes, totalMinutes: totalDays * goal.input.dailyMinutes },
    days, status: "validated-draft", createdAt: at, updatedAt: at,
  };
}
function contentInputHash(session: LearningSession, plan: LearningPlanVersion, day: LearningPlanDay): string {
  return createHash("sha256").update(JSON.stringify({ sessionId: session.id, goalId: session.goalId, planVersionId: plan.id, dayId: day.id, dayIndex: day.dayIndex, localDate: day.localDate, minutes: day.minutes })).digest("hex");
}
function nextSessionRevision(session: LearningSession, patch: Partial<LearningSession>): LearningSession {
  return { ...session, ...patch, revision: session.revision + 1 };
}
function assertExpectedSessionRevision(session: LearningSession, expectedRevision: number | undefined): void {
  if (expectedRevision !== undefined && expectedRevision !== session.revision) throw new Error("Learning session revision conflict");
}
function validateLessonInput(input: LearningLessonInput, day: LearningPlanDay): void {
  const title = nonEmpty(input.title, "Learning lesson title", 200);
  void title;
  if (!Number.isInteger(input.estimatedMinutes) || input.estimatedMinutes < 1 || input.estimatedMinutes > day.minutes) throw new Error("Learning lesson duration is invalid");
  if (!Array.isArray(input.blocks) || input.blocks.length === 0 || input.blocks.length > 32) throw new Error("Learning lesson blocks are invalid");
  const ids = new Set<string>();
  let minutes = 0;
  const kinds = new Set(["review", "concept", "example", "question", "practice", "feedback"]);
  for (const block of input.blocks) {
    const id = nonEmpty(block.id, "Learning lesson block id", 160);
    if (ids.has(id)) throw new Error("Learning lesson block ids must be unique");
    ids.add(id);
    if (!kinds.has(block.kind)) throw new Error("Learning lesson block kind is invalid");
    if (!Number.isInteger(block.minutes) || block.minutes < 1 || block.minutes > day.minutes) throw new Error("Learning lesson block duration is invalid");
    if (!Array.isArray(block.conceptIds) || block.conceptIds.length > 8 || block.conceptIds.some((conceptId) => typeof conceptId !== "string" || conceptId.length > 160)) throw new Error("Learning lesson block concepts are invalid");
    nonEmpty(block.title, "Learning lesson block title", 200);
    nonEmpty(block.content, "Learning lesson block content", 20_000);
    minutes += block.minutes;
  }
  if (minutes > day.minutes) throw new Error("Learning lesson exceeds the day time budget");
}
function validateLearningActionResponse(response: string): string {
  return nonEmpty(response, "Learning action response", 20_000);
}
function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} is invalid`);
  return value as Record<string, unknown>;
}
function exactKeys(value: Record<string, unknown>, allowed: string[], label: string): void {
  if (Object.keys(value).some((key) => !allowed.includes(key))) throw new Error(`${label} contains unknown fields`);
}
function stringList(value: unknown, label: string, maxItems: number, maxLength: number, required = false): string[] {
  if (!Array.isArray(value) || value.length > maxItems || (required && value.length === 0)) throw new Error(`${label} is invalid`);
  return value.map((item) => {
    if (typeof item !== "string" || !item.trim() || item.length > maxLength) throw new Error(`${label} is invalid`);
    return item;
  });
}
function validatePlanProposal(value: unknown, goal: LearningGoal, today: string): LearningPlanProposal {
  const proposal = record(value, "Learning plan proposal");
  exactKeys(proposal, ["normalizedSubject", "assumptions", "feasibleOutcomes", "exclusions", "prerequisites", "level", "feasibleMinutes", "segments", "days"], "Learning plan proposal");
  const normalizedSubject = proposal.normalizedSubject;
  if (typeof normalizedSubject !== "string" || !normalizedSubject.trim() || normalizedSubject.length > 200) throw new Error("Learning plan proposal subject is invalid");
  const assumptions = stringList(proposal.assumptions, "Learning plan assumptions", 32, 500);
  const feasibleOutcomes = stringList(proposal.feasibleOutcomes, "Learning plan outcomes", 32, 240, true);
  const exclusions = stringList(proposal.exclusions, "Learning plan exclusions", 32, 500);
  const prerequisites = stringList(proposal.prerequisites, "Learning plan prerequisites", 32, 500);
  const level = record(proposal.level, "Learning plan level");
  exactKeys(level, ["value", "evidenceRefs"], "Learning plan level");
  if (!(["unknown", "beginner", "intermediate", "advanced"] as const).includes(level.value as never)) throw new Error("Learning plan level is invalid");
  const evidenceRefs = stringList(level.evidenceRefs, "Learning plan evidence references", 32, 240);
  if (!Number.isInteger(proposal.feasibleMinutes) || (proposal.feasibleMinutes as number) < 1) throw new Error("Learning plan feasible minutes are invalid");
  const totalDays = durationDays(goal.input.duration, today);
  if ((proposal.feasibleMinutes as number) > totalDays * goal.input.dailyMinutes) throw new Error("Learning plan feasible minutes exceed the budget");

  if (!Array.isArray(proposal.segments) || proposal.segments.length === 0 || proposal.segments.length > 32) throw new Error("Learning plan segments are invalid");
  const segmentIds = new Set<string>();
  const segments = proposal.segments.map((item) => {
    const segment = record(item, "Learning plan segment");
    exactKeys(segment, ["id", "dayFrom", "dayTo", "outcomeIds"], "Learning plan segment");
    const id = requiredString(segment.id, "Learning plan segment id", 160);
    if (segmentIds.has(id)) throw new Error("Learning plan segment ids must be unique");
    segmentIds.add(id);
    if (!Number.isInteger(segment.dayFrom) || !Number.isInteger(segment.dayTo) || (segment.dayFrom as number) < 1 || (segment.dayFrom as number) > (segment.dayTo as number) || (segment.dayTo as number) > totalDays) throw new Error("Learning plan segment days are invalid");
    const outcomeIds = stringList(segment.outcomeIds, "Learning plan segment outcomes", 32, 240, true);
    if (outcomeIds.some((outcomeId) => !feasibleOutcomes.includes(outcomeId))) throw new Error("Learning plan segment outcome is unknown");
    return { id, dayFrom: segment.dayFrom as number, dayTo: segment.dayTo as number, outcomeIds };
  });
  const coveredDays = new Set<number>();
  for (const segment of segments) for (let dayIndex = segment.dayFrom; dayIndex <= segment.dayTo; dayIndex += 1) coveredDays.add(dayIndex);
  if (coveredDays.size !== totalDays) throw new Error("Learning plan segments do not cover the goal duration");

  if (!Array.isArray(proposal.days) || proposal.days.length !== totalDays) throw new Error("Learning plan days do not match the goal duration");
  const dayIndexes = new Set<number>();
  const days = proposal.days.map((item) => {
    const day = record(item, "Learning plan day");
    exactKeys(day, ["dayIndex", "conceptIds", "minutes", "activities", "checkpoint"], "Learning plan day");
    if (!Number.isInteger(day.dayIndex) || (day.dayIndex as number) < 1 || (day.dayIndex as number) > totalDays || dayIndexes.has(day.dayIndex as number)) throw new Error("Learning plan day index is invalid");
    dayIndexes.add(day.dayIndex as number);
    const conceptIds = stringList(day.conceptIds, "Learning plan concepts", 16, 160);
    if (!Number.isInteger(day.minutes) || (day.minutes as number) < 1 || (day.minutes as number) > goal.input.dailyMinutes) throw new Error("Learning plan day minutes are invalid");
    if (!Array.isArray(day.activities) || day.activities.length === 0 || day.activities.length > 8) throw new Error("Learning plan activities are invalid");
    let activityMinutes = 0;
    const activities = day.activities.map((item) => {
      const activity = record(item, "Learning plan activity");
      exactKeys(activity, ["kind", "minutes"], "Learning plan activity");
      if (!( ["review", "concept", "practice", "feedback"] as const).includes(activity.kind as never)) throw new Error("Learning plan activity kind is invalid");
      if (!Number.isInteger(activity.minutes) || (activity.minutes as number) < 1 || (activity.minutes as number) > (day.minutes as number)) throw new Error("Learning plan activity minutes are invalid");
      activityMinutes += activity.minutes as number;
      return { kind: activity.kind as "review" | "concept" | "practice" | "feedback", minutes: activity.minutes as number };
    });
    if (activityMinutes > (day.minutes as number)) throw new Error("Learning plan activities exceed the daily budget");
    if (!( ["none", "midpoint", "final"] as const).includes(day.checkpoint as never)) throw new Error("Learning plan checkpoint is invalid");
    return { dayIndex: day.dayIndex as number, conceptIds, minutes: day.minutes as number, activities, checkpoint: day.checkpoint as "none" | "midpoint" | "final" };
  }).sort((left, right) => left.dayIndex - right.dayIndex);
  if (days.some((day, index) => day.dayIndex !== index + 1)) throw new Error("Learning plan day indexes must be continuous");
  if (days[totalDays - 1]?.checkpoint !== "final") throw new Error("Learning plan must include a final checkpoint");
  return { normalizedSubject, assumptions, feasibleOutcomes, exclusions, prerequisites, level: { value: level.value as LearningPlanProposal["level"]["value"], evidenceRefs }, feasibleMinutes: proposal.feasibleMinutes as number, segments, days };
}
function previewFromProposal(goal: LearningGoal, at: string, proposal: LearningPlanProposal, planId: string, interpretationId: string, timezone?: string): LearningPlanVersion {
  const today = learningDate(at, timezone).date;
  return {
    version: 1, id: planId, userId: goal.userId, goalId: goal.id, inputRevision: goal.revision,
    templateVersion: "learning-plan-runtime-v1", interpretationId,
    segments: proposal.segments.map((segment, index) => ({ id: `${planId}-segment-${index + 1}`, dayFrom: segment.dayFrom, dayTo: segment.dayTo, outcomeIds: [...segment.outcomeIds] })),
    outcomes: [...proposal.feasibleOutcomes], budget: { durationDays: proposal.days.length, dailyMinutes: goal.input.dailyMinutes, totalMinutes: proposal.days.length * goal.input.dailyMinutes },
    days: proposal.days.map((day) => ({ id: `${planId}-day-${day.dayIndex}`, dayIndex: day.dayIndex, localDate: dayDate(today, day.dayIndex), conceptIds: [...day.conceptIds], minutes: day.minutes, activities: day.activities.map((activity) => ({ ...activity })), checkpoint: day.checkpoint })),
    status: "validated-draft", createdAt: at, updatedAt: at,
  };
}
function adjustmentPlanDays(basePlan: LearningPlanVersion, adjustment: LearningPlanAdjustment, planId: string, at: string, timezone?: string): LearningPlanDay[] {
  const today = learningDate(at, timezone).date;
  const preserved = new Set(adjustment.preservedCompletedDayIds);
  return Array.from({ length: adjustment.proposedPlan.durationDays }, (_, index) => {
    const dayIndex = index + 1;
    const baseDay = basePlan.days.find((day) => day.dayIndex === dayIndex);
    const keepCompletedShape = Boolean(baseDay && preserved.has(baseDay.id));
    const minutes = keepCompletedShape ? baseDay!.minutes : adjustment.proposedPlan.dailyMinutes;
    return {
      id: `${planId}-day-${dayIndex}`,
      dayIndex,
      localDate: keepCompletedShape ? baseDay!.localDate : dayDate(today, dayIndex),
      conceptIds: baseDay ? [...baseDay.conceptIds] : [`${planId}-concept-${dayIndex}`],
      minutes,
      activities: keepCompletedShape ? baseDay!.activities.map((activity) => ({ ...activity })) : activitiesFor(minutes),
      checkpoint: dayIndex === adjustment.proposedPlan.durationDays ? "final" : dayIndex === Math.ceil(adjustment.proposedPlan.durationDays / 2) ? "midpoint" : "none",
    };
  });
}
function adjustedPlanFrom(basePlan: LearningPlanVersion, goal: LearningGoal, adjustment: LearningPlanAdjustment, planId: string, at: string, timezone?: string): LearningPlanVersion {
  const phases = Math.min(4, adjustment.proposedPlan.durationDays);
  const segments = Array.from({ length: phases }, (_, index) => {
    const dayFrom = Math.floor(index * adjustment.proposedPlan.durationDays / phases) + 1;
    const dayTo = Math.floor((index + 1) * adjustment.proposedPlan.durationDays / phases);
    return { id: `${planId}-segment-${index + 1}`, dayFrom, dayTo, outcomeIds: [basePlan.outcomes[index % Math.max(1, basePlan.outcomes.length)] ?? "adjusted-learning"] };
  });
  return {
    version: 1, id: planId, userId: goal.userId, goalId: goal.id, inputRevision: goal.revision, templateVersion: basePlan.templateVersion,
    interpretationId: basePlan.interpretationId, segments, outcomes: [...basePlan.outcomes],
    budget: { durationDays: adjustment.proposedPlan.durationDays, dailyMinutes: adjustment.proposedPlan.dailyMinutes, totalMinutes: adjustment.proposedPlan.totalMinutes },
    days: adjustmentPlanDays(basePlan, adjustment, planId, at, timezone), status: "validated-draft", createdAt: at, updatedAt: at,
  };
}

export function createLearningService(root: string, options: LearningServiceOptions = {}): LearningService {
  const now = options.now ?? (() => new Date().toISOString());
  const dispatchForUser = options.dispatchForUser ?? createUserRuntimeDispatchGate();
  const sessionMutationTails = new Map<string, Promise<void>>();
  const withSessionMutationLock = async <T>(key: string, task: () => Promise<T>): Promise<T> => {
    const prior = sessionMutationTails.get(key) ?? Promise.resolve();
    let release!: () => void;
    const current = new Promise<void>((resolve) => { release = resolve; });
    const queued = prior.then(() => current);
    sessionMutationTails.set(key, queued);
    await prior;
    try { return await task(); }
    finally {
      release();
      if (sessionMutationTails.get(key) === queued) sessionMutationTails.delete(key);
    }
  };
  const recordCodingAttemptActivity = async (principal: Principal, exercise: CodingExercise, attempt: CodingAttempt): Promise<void> => {
    await options.activityService?.recordActivityEvent(principal, {
      sourceType: "learning-coding-attempt",
      sourceId: attempt.id,
      eventType: "learning.coding.attempt.submitted",
      eventVersion: 1,
      actorType: "user",
      // A submitted answer proves user activity, but not correctness or mastery.
      verificationStatus: "unverified",
      payload: {
        exerciseId: exercise.id,
        language: exercise.language,
        practiceStatus: attempt.practiceResult.status,
        executorId: attempt.practiceResult.executorId,
      },
      occurredAt: attempt.submittedAt,
    });
  };
  return {
    async createLearningGoal(principal, input: LearningGoalInput): Promise<LearningGoal> {
      ensurePrincipal(principal);
      const at = now(); assertTimestamp(at, "learning goal timestamp");
      const subjectText = nonEmpty(input.subjectText, "Learning goal subject", 200);
      if (!Number.isInteger(input.dailyMinutes) || input.dailyMinutes < 1 || input.dailyMinutes > 1440) throw new Error("Learning goal daily minutes are invalid");
      const duration = validateLearningGoalDuration(input.duration, learningDate(at, principalTimezone(principal)).date);
      const goal: LearningGoal = {
        version: 1,
        id: "learning-goal-" + randomUUID(),
        userId: principal.userId,
        input: { subjectText, duration, dailyMinutes: input.dailyMinutes },
        ...(input.optionalSettings ? { optionalSettings: { ...input.optionalSettings } } : {}),
        status: "draft",
        revision: 1,
        createdAt: at,
        updatedAt: at,
      };
      await saveLearningGoal(root, goal);
      return goal;
    },

    async listLearningGoals(principal) {
      ensurePrincipal(principal);
      const candidates = (await listLearningGoalsUnlocked(root, principal.userId)).filter((goal) => goal.userId === principal.userId);
      const current: LearningGoal[] = [];
      for (const candidate of candidates) {
        try { assertIdentityId(candidate.id); } catch { continue; }
        await withDurableLearningGoalLock(root, principal.userId, candidate.id, async () => {
          const goal = await loadLearningGoalUnlocked(root, principal.userId, candidate.id);
          if (goal?.userId === principal.userId) current.push(goal);
        }, { waitForMs: 2_000 });
      }
      return current.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    },

    async getLearningGoal(principal, goalId) {
      ensurePrincipal(principal);
      try { assertIdentityId(goalId); } catch { return null; }
      return withDurableLearningGoalLock(root, principal.userId, goalId, () => loadOwnerGoal(root, principal, goalId, true), { waitForMs: 2_000 });
    },

    async createLearningPlanPreview(principal, goalId, expectedRevision): Promise<LearningPlanPreview> {
      ensurePrincipal(principal);
      const initialGoal = await withDurableLearningGoalLock(root, principal.userId, goalId, () => loadOwnerGoal(root, principal, goalId, true), { waitForMs: 2_000 });
      if (!initialGoal) throw new Error("Learning goal not found");
      if (expectedRevision !== undefined && expectedRevision !== initialGoal.revision) throw new Error("Learning goal revision conflict");
      return withDurableLearningPlanPreviewLock(root, principal.userId, goalId, () => withDurableLearningGoalLock(root, principal.userId, goalId, async () => {
      const goal = await loadOwnerGoal(root, principal, goalId, true);
      if (!goal) throw new Error("Learning goal not found");
      const existing = (await listLearningPlanVersionsUnlocked(root, principal.userId))
        .filter((plan) => plan.goalId === goal.id && plan.inputRevision === (goal.status === "preview-ready" ? goal.revision - 1 : goal.revision))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
      if (existing) {
        const interpretation = await listGoalInterpretationsUnlocked(root, principal.userId);
        const matched = interpretation.find((item) => item.id === existing.interpretationId);
        if (!matched) throw new Error("Learning goal interpretation not found");
        return { goal, interpretation: matched, plan: existing, created: false };
      }
      if (expectedRevision !== undefined && expectedRevision !== goal.revision) throw new Error("Learning goal revision conflict");
      const at = now(); assertTimestamp(at, "learning plan preview timestamp");
      const timezone = principalTimezone(principal);
      if (options.planDispatcher) {
        const inputHash = createHash("sha256").update(JSON.stringify({ goalId: goal.id, inputRevision: goal.revision, input: goal.input, optionalSettings: goal.optionalSettings ?? null, timezone: timezone ?? null })).digest("hex");
        let dispatch: Awaited<ReturnType<NonNullable<LearningServiceOptions["planDispatcher"]>>>;
        try {
          dispatch = await dispatchForUser(principal.userId, () => options.planDispatcher!({ principal, goal, requestId: `learning-plan-${inputHash.slice(0, 24)}`, inputHash, ...(timezone ? { timezone } : {}) }));
        } catch (error) {
          throw new Error(error instanceof Error ? safeRuntimeBlocker(error.message) : "Learning plan Runtime failed");
        }
        if (dispatch.status !== "completed") throw new Error(`Learning plan Runtime ${dispatch.status}: ${safeRuntimeBlocker(dispatch.blocker ?? "waiting for a local Runtime response")}`);
        const proposal = validatePlanProposal(dispatch.proposal, goal, learningDate(at, timezone).date);
        const interpretation: GoalInterpretation = {
          version: 1, id: "goal-interpretation-" + randomUUID(), userId: principal.userId, goalId: goal.id, inputRevision: goal.revision,
          source: { kind: "local-runtime", version: "learning-goal-runtime-v1" }, normalizedSubject: proposal.normalizedSubject,
          assumptions: proposal.assumptions, feasibleOutcomes: proposal.feasibleOutcomes, exclusions: proposal.exclusions, prerequisites: proposal.prerequisites,
          level: proposal.level, feasibleMinutes: proposal.feasibleMinutes, createdAt: at,
        };
        await saveGoalInterpretationUnlocked(root, interpretation);
        const planId = "learning-plan-version-" + randomUUID();
        const plan = previewFromProposal(goal, at, proposal, planId, interpretation.id, timezone);
        await saveLearningPlanVersionUnlocked(root, plan);
        const updatedGoal: LearningGoal = { ...goal, status: "preview-ready", revision: goal.revision + 1, updatedAt: at };
        await saveLearningGoalUnlocked(root, updatedGoal);
        return { goal: updatedGoal, interpretation, plan, created: true };
      }
      const interpretation: GoalInterpretation = {
        version: 1, id: "goal-interpretation-" + randomUUID(), userId: principal.userId, goalId: goal.id, inputRevision: goal.revision,
        source: { kind: "local-template", version: "learning-goal-template-v1" }, normalizedSubject: goal.input.subjectText.trim(),
        assumptions: ["수준 근거가 없어 입문 수준으로 가정합니다.", "이 미리보기는 로컬 템플릿이며 AI 해석이나 숙달 보장을 포함하지 않습니다."],
        feasibleOutcomes: ["핵심 개념을 설명할 수 있는 기반 만들기", "짧은 예제와 연습으로 적용해 보기", "복습이 필요한 지점을 기록하기"],
        exclusions: ["지정된 시간 안에서 다루기 어려운 고급·전문 범위"], prerequisites: [],
        level: { value: goal.optionalSettings?.level ?? "unknown", evidenceRefs: [] }, feasibleMinutes: durationDays(goal.input.duration, learningDate(at, principalTimezone(principal)).date) * goal.input.dailyMinutes, createdAt: at,
      };
      await saveGoalInterpretationUnlocked(root, interpretation);
      const plan = previewFor(goal, at, interpretation, "learning-plan-version-" + randomUUID(), principalTimezone(principal));
      await saveLearningPlanVersionUnlocked(root, plan);
      const updatedGoal: LearningGoal = { ...goal, status: "preview-ready", revision: goal.revision + 1, updatedAt: at };
      await saveLearningGoalUnlocked(root, updatedGoal);
      return { goal: updatedGoal, interpretation, plan, created: true };
      }, { waitForMs: 2_000 }), { waitForMs: 2_000 });
    },

    async createLearningPlanAdjustment(principal, goalId, input: LearningPlanAdjustmentInput): Promise<LearningPlanAdjustment> {
      ensurePrincipal(principal);
      const goal = await loadOwnerGoal(root, principal, goalId);
      if (!goal) throw new Error("Learning goal not found");
      if (input.expectedGoalRevision !== undefined && input.expectedGoalRevision !== goal.revision) throw new Error("Learning goal revision conflict");
      try { assertIdentityId(input.basePlanVersionId); } catch { throw new Error("Learning plan version not found"); }
      const basePlan = await loadLearningPlanVersion(root, principal.userId, input.basePlanVersionId);
      if (!basePlan || basePlan.userId !== principal.userId || basePlan.goalId !== goal.id || basePlan.status === "superseded") throw new Error("Learning plan version not found");
      if (!["missed-days", "blocked", "changed-time", "changed-duration", "changed-goal"].includes(input.reason)) throw new Error("Learning plan adjustment reason is invalid");
      const at = now(); assertTimestamp(at, "learning plan adjustment timestamp");
      const today = learningDate(at, principalTimezone(principal)).date;
      const currentDurationDays = durationDays(goal.input.duration, today);
      const nextDurationDays = input.durationDays ?? currentDurationDays;
      const nextDailyMinutes = input.dailyMinutes ?? goal.input.dailyMinutes;
      if (!Number.isInteger(nextDurationDays) || nextDurationDays < 1 || nextDurationDays > 3650) throw new Error("Learning plan adjustment duration is invalid");
      if (!Number.isInteger(nextDailyMinutes) || nextDailyMinutes < 1 || nextDailyMinutes > 1440) throw new Error("Learning plan adjustment daily minutes are invalid");
      const note = input.note === undefined ? undefined : nonEmpty(input.note, "Learning plan adjustment note", 2_000);
      const completedSessions = (await listSessions(root, principal.userId)).filter((session) => session.userId === principal.userId && session.goalId === goal.id && session.planVersionId === basePlan.id && session.status === "completed" && session.dayId);
      const preservedCompletedDayIds = [...new Set(completedSessions.map((session) => session.dayId!))];
      const completedDayIndexes = basePlan.days.filter((day) => preservedCompletedDayIds.includes(day.id)).map((day) => day.dayIndex);
      if (completedDayIndexes.some((dayIndex) => dayIndex > nextDurationDays)) throw new Error("Learning plan adjustment would remove a completed day");
      if (nextDurationDays === currentDurationDays && nextDailyMinutes === goal.input.dailyMinutes) throw new Error("Learning plan adjustment must change the schedule");
      const inputHash = createHash("sha256").update(JSON.stringify({ goalId: goal.id, basePlanVersionId: basePlan.id, baseGoalRevision: goal.revision, reason: input.reason, durationDays: nextDurationDays, dailyMinutes: nextDailyMinutes, note: note ?? null })).digest("hex");
      return withDurableLearningPlanAdjustmentLock(root, principal.userId, goal.id, inputHash, async () => {
      const existing = (await listLearningPlanAdjustmentsUnlocked(root, principal.userId)).find((candidate) => candidate.userId === principal.userId && candidate.goalId === goal.id && candidate.inputHash === inputHash && candidate.status !== "rejected");
      if (existing) return existing;
      const changes: LearningPlanAdjustment["changes"] = [];
      for (let dayIndex = 1; dayIndex <= nextDurationDays; dayIndex += 1) {
        const before = basePlan.days.find((day) => day.dayIndex === dayIndex);
        const preserved = Boolean(before && preservedCompletedDayIds.includes(before.id));
        const afterMinutes = preserved ? before!.minutes : nextDailyMinutes;
        const afterDate = preserved ? before!.localDate : dayDate(today, dayIndex);
        if (!before || before.minutes !== afterMinutes || before.localDate !== afterDate || dayIndex > currentDurationDays) {
          changes.push({ dayIndex, ...(before ? { before: { dayId: before.id, minutes: before.minutes, localDate: before.localDate } } : {}), after: { minutes: afterMinutes, localDate: afterDate }, reasonRefs: [preserved ? "completed-day-preserved" : input.reason] });
        }
      }
      const tradeoffs = [
        ...(nextDailyMinutes !== goal.input.dailyMinutes ? ["남은 학습일의 하루 시간과 범위를 조정합니다."] : []),
        ...(nextDurationDays !== currentDurationDays ? ["기간 변경에 따라 아직 완료되지 않은 날짜의 분량을 재배치합니다."] : []),
        ...(preservedCompletedDayIds.length ? ["완료된 세션과 근거는 이전 PlanVersion에 보존합니다."] : []),
      ];
      const adjustment: LearningPlanAdjustment = {
        version: 1, id: "learning-plan-adjustment-" + randomUUID(), userId: principal.userId, goalId: goal.id,
        basePlanVersionId: basePlan.id, baseGoalRevision: goal.revision, inputHash, reason: input.reason, ...(note ? { note } : {}), status: "proposed",
        preservedCompletedDayIds, changes, tradeoffs, proposedPlan: { durationDays: nextDurationDays, dailyMinutes: nextDailyMinutes, totalMinutes: nextDurationDays * nextDailyMinutes },
        requiresAcceptance: true, createdAt: at, updatedAt: at,
      };
      await saveLearningPlanAdjustmentUnlocked(root, adjustment);
      return adjustment;
      }, { waitForMs: 2_000 });
    },

    async listLearningPlanAdjustments(principal, goalId) {
      ensurePrincipal(principal);
      const goal = await loadOwnerGoal(root, principal, goalId);
      if (!goal) return [];
      const candidates = (await listLearningPlanAdjustments(root, principal.userId)).filter((adjustment) => adjustment.userId === principal.userId && adjustment.goalId === goal.id);
      const current: LearningPlanAdjustment[] = [];
      for (const candidate of candidates) {
        await withDurableLearningPlanAdjustmentAcceptanceLock(root, principal.userId, goal.id, candidate.id, async () => {
          const adjustment = await loadLearningPlanAdjustment(root, principal.userId, candidate.id);
          if (adjustment?.userId === principal.userId && adjustment.goalId === goal.id) current.push(adjustment);
        }, { waitForMs: 2_000 });
      }
      return current.sort((left, right) => right.createdAt.localeCompare(left.createdAt));
    },

    async acceptLearningPlanAdjustment(principal, goalId, adjustmentId): Promise<LearningPlanAdjustmentResult> {
      ensurePrincipal(principal);
      return withDurableLearningPlanAdjustmentAcceptanceLock(root, principal.userId, goalId, adjustmentId, () => withDurableLearningGoalLock(root, principal.userId, goalId, async () => {
      const goal = await loadOwnerGoal(root, principal, goalId, true);
      if (!goal) throw new Error("Learning goal not found");
      try { assertIdentityId(adjustmentId); } catch { throw new Error("Learning plan adjustment not found"); }
      const adjustment = await loadLearningPlanAdjustment(root, principal.userId, adjustmentId);
      if (!adjustment || adjustment.userId !== principal.userId || adjustment.goalId !== goal.id) throw new Error("Learning plan adjustment not found");
      if (adjustment.status === "accepted" && adjustment.acceptedPlanVersionId) {
        const plan = await loadLearningPlanVersionUnlocked(root, principal.userId, adjustment.acceptedPlanVersionId);
        return { adjustment, goal, ...(plan ? { plan } : {}) };
      }
      if (adjustment.status !== "proposed") throw new Error("Learning plan adjustment is not available");
      if (goal.revision !== adjustment.baseGoalRevision) throw new Error("Learning goal revision conflict");
      const basePlan = await loadLearningPlanVersionUnlocked(root, principal.userId, adjustment.basePlanVersionId);
      if (!basePlan || basePlan.status === "superseded" || basePlan.goalId !== goal.id) throw new Error("Learning plan version is superseded");
      const at = now(); assertTimestamp(at, "learning plan adjustment acceptance timestamp");
      const planId = "learning-plan-version-" + randomUUID();
      const updatedGoal: LearningGoal = {
        ...goal,
        input: { ...goal.input, duration: { days: adjustment.proposedPlan.durationDays }, dailyMinutes: adjustment.proposedPlan.dailyMinutes },
        status: goal.status === "active" ? "active" : "preview-ready", revision: goal.revision + 1, updatedAt: at,
      };
      const plan = adjustedPlanFrom(basePlan, updatedGoal, adjustment, planId, at, principalTimezone(principal));
      await saveLearningPlanVersionUnlocked(root, { ...basePlan, status: "superseded", updatedAt: at });
      await saveLearningPlanVersionUnlocked(root, plan);
      await saveLearningGoalUnlocked(root, updatedGoal);
      const accepted: LearningPlanAdjustment = { ...adjustment, status: "accepted", acceptedPlanVersionId: plan.id, updatedAt: at };
      await saveLearningPlanAdjustment(root, accepted);
      return { adjustment: accepted, goal: updatedGoal, plan };
      }, { waitForMs: 2_000 }), { waitForMs: 2_000 });
    },

    async listLearningPlanVersions(principal, goalId) {
      ensurePrincipal(principal);
      try { assertIdentityId(goalId); } catch { return []; }
      return withDurableLearningGoalLock(root, principal.userId, goalId, async () => {
        const goal = await loadOwnerGoal(root, principal, goalId, true);
        if (!goal) return [];
        return (await listLearningPlanVersionsUnlocked(root, principal.userId)).filter((plan) => plan.userId === principal.userId && plan.goalId === goal.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      }, { waitForMs: 2_000 });
    },

    async getLearningPlanVersion(principal, goalId, versionId) {
      ensurePrincipal(principal);
      try { assertIdentityId(goalId); assertIdentityId(versionId); } catch { return null; }
      return withDurableLearningGoalLock(root, principal.userId, goalId, async () => {
        const goal = await loadOwnerGoal(root, principal, goalId, true);
        if (!goal) return null;
        const plan = await loadLearningPlanVersionUnlocked(root, principal.userId, versionId);
        return plan?.userId === principal.userId && plan.goalId === goal.id ? plan : null;
      }, { waitForMs: 2_000 });
    },

    async getLearningGoalProgress(principal, goalId): Promise<LearningProgress | null> {
      ensurePrincipal(principal);
      const goal = await loadOwnerGoal(root, principal, goalId);
      if (!goal) return null;
      const at = now(); assertTimestamp(at, "learning progress timestamp");
      const currentDay = learningDate(at, principalTimezone(principal));
      const allPlans = (await listLearningPlanVersions(root, principal.userId))
        .filter((candidate) => candidate.userId === principal.userId && candidate.goalId === goal.id && candidate.status !== "superseded")
        .sort((left, right) => {
          const statusRank = (status: LearningPlanVersion["status"]) => status === "active" ? 0 : status === "validated-draft" ? 1 : 2;
          return statusRank(left.status) - statusRank(right.status) || right.updatedAt.localeCompare(left.updatedAt);
        });
      const plan = allPlans[0];
      const goalSessions = (await listSessions(root, principal.userId))
        .filter((candidate) => candidate.userId === principal.userId && candidate.goalId === goal.id)
        .sort((left, right) => left.startedAt.localeCompare(right.startedAt));
      const sessionIds = new Set(goalSessions.map((candidate) => candidate.id));
      const completedDayIds = new Set(goalSessions.filter((candidate) => candidate.status === "completed" && candidate.dayId).map((candidate) => candidate.dayId!));
      const activeDayIds = [...new Set(goalSessions.filter((candidate) => candidate.status === "active" && candidate.dayId).map((candidate) => candidate.dayId!))];
      const plannedDays = plan?.days ?? [];
      const upcomingDays = plannedDays
        .filter((day) => day.localDate >= currentDay.date && !completedDayIds.has(day.id))
        .slice(0, 14)
        .map((day) => ({ id: day.id, dayIndex: day.dayIndex, localDate: day.localDate, minutes: day.minutes, checkpoint: day.checkpoint }));
      const attempts = (await listAttempts(root, principal.userId)).filter((candidate) => candidate.userId === principal.userId && sessionIds.has(candidate.sessionId));
      const actions = (await listLearningSessionActions(root, principal.userId)).filter((candidate) => candidate.userId === principal.userId && sessionIds.has(candidate.sessionId));
      const answers = (await listLearningAnswerReceipts(root, principal.userId)).filter((candidate) => candidate.userId === principal.userId && sessionIds.has(candidate.sessionId));
      const codingExerciseIds = new Set((await listCodingExercises(root, principal.userId)).filter((candidate) => candidate.userId === principal.userId && candidate.sessionId && sessionIds.has(candidate.sessionId)).map((candidate) => candidate.id));
      const codingAttempts = (await listCodingAttempts(root, principal.userId)).filter((candidate) => candidate.userId === principal.userId && codingExerciseIds.has(candidate.exerciseId));
      const dueReviews = (await listReviews(root, principal.userId)).filter((candidate) => candidate.userId === principal.userId && sessionIds.has(candidate.sourceId) && Date.parse(candidate.dueAt) <= Date.parse(at));
      const warnings: string[] = currentDay.timezoneApplied ? [] : ["진도 날짜는 현재 서버 기준입니다."];
      if (!plan) warnings.push("아직 활성화된 학습 계획이 없습니다.");
      if (answers.some((answer) => answer.status === "evaluation-pending")) warnings.push("평가 대기 항목은 숙달 근거로 집계하지 않습니다.");
      if (actions.some((action) => action.type === "self-report")) warnings.push("이해했다는 자기보고는 숙달 증거와 별도로 기록합니다.");
      return {
        version: 1,
        userId: principal.userId,
        goalId: goal.id,
        goalRevision: goal.revision,
        goalStatus: goal.status,
        ...(plan ? { plan: { id: plan.id, inputRevision: plan.inputRevision, status: plan.status, durationDays: plan.budget.durationDays, dailyMinutes: plan.budget.dailyMinutes, totalMinutes: plan.budget.totalMinutes } } : {}),
        schedule: { plannedDays: plannedDays.length, completedDays: [...completedDayIds].filter((dayId) => plannedDays.some((day) => day.id === dayId)).length, activeDayIds, upcomingDays },
        actual: {
          sessions: { total: goalSessions.length, active: goalSessions.filter((candidate) => candidate.status === "active").length, completed: goalSessions.filter((candidate) => candidate.status === "completed").length },
          verifiedCorrectAttempts: attempts.filter((attempt) => attempt.correct === true).length,
          reportedIncorrectAttempts: attempts.filter((attempt) => attempt.correct === false).length,
          unverifiedAttempts: attempts.filter((attempt) => attempt.correct === undefined).length,
          codingAttempts: codingAttempts.length,
          selfReports: actions.filter((action) => action.type === "self-report").length,
          runtimeWaitingActions: actions.filter((action) => action.status === "waiting-runtime").length,
        },
        evaluation: {
          pendingAnswers: answers.filter((answer) => answer.status === "evaluation-pending").length,
          feedbackReadyAnswers: answers.filter((answer) => answer.status === "feedback-ready").length,
          disputedAnswers: answers.filter((answer) => answer.status === "disputed").length,
          pendingAnswerIds: answers.filter((answer) => answer.status === "evaluation-pending").map((answer) => answer.id),
        },
        reviews: { dueCount: dueReviews.length, dueItemIds: dueReviews.map((item) => item.id) },
        evidence: { verifiedAttemptIds: attempts.filter((attempt) => attempt.correct === true).map((attempt) => attempt.id), selfReportActionIds: actions.filter((action) => action.type === "self-report").map((action) => action.id) },
        warnings,
        generatedAt: at,
      };
    },

    async createLearningReport(principal, goalId, input): Promise<{ report: LearningReport; created: boolean }> {
      ensurePrincipal(principal);
      const period = reportPeriod(input);
      return withDurableLearningReportLock(root, principal.userId, goalId, JSON.stringify(period), async () => {
        const goal = await loadOwnerGoal(root, principal, goalId);
        if (!goal) throw new Error("Learning goal not found");
        const timezone = principalTimezone(principal);
      const plans = (await listLearningPlanVersions(root, principal.userId))
        .filter((candidate) => candidate.userId === principal.userId && candidate.goalId === goal.id && candidate.status !== "superseded")
        .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
      const plan = plans[0];
      const sourceRevision = { goalRevision: goal.revision, ...(plan ? { planVersionId: plan.id } : {}) };
      const inputHash = createHash("sha256").update(JSON.stringify({ goalId: goal.id, period, sourceRevision, templateVersion: "learning-report-local-v1" })).digest("hex");
      const existing = (await listLearningReportsUnlocked(root, principal.userId)).find((candidate) => candidate.userId === principal.userId && candidate.goalId === goal.id && candidate.inputHash === inputHash);
      if (existing) return { report: existing, created: false };

      const sessions = (await listSessions(root, principal.userId))
        .filter((candidate) => candidate.userId === principal.userId && candidate.goalId === goal.id && inReportPeriod(learningDate(candidate.startedAt, timezone).date, period));
      const sessionIds = new Set(sessions.map((session) => session.id));
      const completedDayIds = new Set(sessions.filter((session) => session.status === "completed" && session.dayId).map((session) => session.dayId!));
      const plannedDays = (plan?.days ?? []).filter((day) => inReportPeriod(day.localDate, period));
      const plannedMinutes = plannedDays.reduce((total, day) => total + day.minutes, 0);
      const completedMinutes = sessions.reduce((total, session) => total + (plan?.days.find((day) => day.id === session.dayId)?.minutes ?? 0), 0);
      const attempts = (await listAttempts(root, principal.userId)).filter((candidate) => candidate.userId === principal.userId && sessionIds.has(candidate.sessionId));
      const actions = (await listLearningSessionActions(root, principal.userId)).filter((candidate) => candidate.userId === principal.userId && sessionIds.has(candidate.sessionId));
      const codingExercises = (await listCodingExercises(root, principal.userId)).filter((candidate) => candidate.userId === principal.userId && candidate.sessionId && sessionIds.has(candidate.sessionId));
      const codingExerciseById = new Map(codingExercises.map((candidate) => [candidate.id, candidate]));
      const codingAttempts = (await listCodingAttempts(root, principal.userId)).filter((candidate) => {
        const exercise = codingExerciseById.get(candidate.exerciseId);
        return candidate.userId === principal.userId && Boolean(exercise?.sessionId) && inReportPeriod(learningDate(candidate.submittedAt, timezone).date, period);
      });
      const reviews = (await listReviews(root, principal.userId)).filter((candidate) => candidate.userId === principal.userId && (inReportPeriod(learningDate(candidate.createdAt, timezone).date, period) || inReportPeriod(learningDate(candidate.dueAt, timezone).date, period)));
      const verifiedOutcomes = attempts.filter((attempt) => attempt.correct === true).map((attempt) => ({ outcomeId: `attempt:${attempt.id}`, label: `검증된 정답 시도 ${attempt.questionId}`, evidenceRefs: [attempt.id] }));
      const unverifiedOutcomes = [
        ...attempts.filter((attempt) => attempt.correct === undefined).map((attempt) => ({ outcomeId: `attempt:${attempt.id}`, label: `검증 전 시도 ${attempt.questionId}`, evidenceRefs: [attempt.id] })),
        ...codingAttempts.map((attempt) => {
          const exercise = codingExerciseById.get(attempt.exerciseId);
          const statusLabel = attempt.practiceResult.status === "syntax-verified" ? "구문 확인됨 · 정답/숙달 미검증" : attempt.practiceResult.status === "syntax-invalid" ? "구문 오류" : "실행/채점 대기";
          return { outcomeId: `coding-attempt:${attempt.id}`, label: `코딩 실습 ${exercise?.title ?? attempt.exerciseId} · ${statusLabel}`, evidenceRefs: [attempt.id] };
        }),
        ...actions.filter((action) => action.type === "self-report").map((action) => ({ outcomeId: `self-report:${action.id}`, label: "이해했다는 self-report", evidenceRefs: [action.id] })),
      ];
      const remaining = plannedDays.filter((day) => !completedDayIds.has(day.id)).map((day) => `${day.dayIndex}일차 ${day.localDate} · ${day.minutes}분 예정`);
      if (!plan) remaining.unshift("활성화된 학습 계획이 없어 예정량을 계산하지 못했습니다.");
      if (attempts.some((attempt) => attempt.correct === false)) remaining.push("오답 또는 재검토가 필요한 시도를 다시 확인하세요.");
      const reviewSuggestions = reviews.filter((item) => Date.parse(item.dueAt) <= Date.parse(`${period.to}T23:59:59.999Z`)).map((item) => ({ itemId: item.id, prompt: item.prompt, reasonRefs: [item.id] }));
      const at = now(); assertTimestamp(at, "learning report timestamp");
      const report: LearningReport = {
        version: 1, id: "learning-report-" + randomUUID(), userId: principal.userId, goalId: goal.id, goalSubject: goal.input.subjectText,
        period, inputHash, templateVersion: "learning-report-local-v1", provenance: { kind: "local-evidence", generatedBy: "system" }, sourceRevision,
        participation: { plannedDays: plannedDays.length, plannedMinutes, completedSessions: sessions.filter((session) => session.status === "completed").length, activeSessions: sessions.filter((session) => session.status === "active").length, completedMinutes },
        verifiedOutcomes, unverifiedOutcomes, remaining, reviewSuggestions,
        summary: `기간 ${period.from}~${period.to}: 예정 ${plannedMinutes}분, 완료 세션 ${sessions.filter((session) => session.status === "completed").length}회, 검증된 이해 근거 ${verifiedOutcomes.length}건, 미검증 self-report ${unverifiedOutcomes.filter((outcome) => outcome.outcomeId.startsWith("self-report:")).length}건입니다. 이 보고서는 숙달이나 역량을 주장하지 않습니다.`,
        createdAt: at, updatedAt: at,
      };
      await saveLearningReportUnlocked(root, report);
        return { report, created: true };
      }, { waitForMs: 2_000 });
    },

    async listLearningReports(principal, goalId): Promise<LearningReport[]> {
      ensurePrincipal(principal);
      const goal = await loadOwnerGoal(root, principal, goalId);
      if (!goal) return [];
      const candidates = (await listLearningReports(root, principal.userId)).filter((report) => report.userId === principal.userId && report.goalId === goal.id);
      const current: LearningReport[] = [];
      for (const candidate of candidates) {
        await withDurableLearningReportLock(root, principal.userId, goal.id, JSON.stringify(candidate.period), async () => {
          const report = await loadLearningReportUnlocked(root, principal.userId, candidate.id);
          if (report?.userId === principal.userId && report.goalId === goal.id) current.push(report);
        }, { waitForMs: 2_000 });
      }
      return current.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
    },

    async getLearningGoalToday(principal, goalId): Promise<LearningToday | null> {
      ensurePrincipal(principal);
      const goal = await loadOwnerGoal(root, principal, goalId);
      if (!goal) return null;
      const at = now(); assertTimestamp(at, "learning today timestamp");
      const currentDay = learningDate(at, principalTimezone(principal));
      const plan = (await listLearningPlanVersions(root, principal.userId))
        .filter((candidate) => candidate.userId === principal.userId && candidate.goalId === goal.id && candidate.status !== "superseded")
        .sort((left, right) => {
          const statusRank = (status: LearningPlanVersion["status"]) => status === "active" ? 0 : status === "validated-draft" ? 1 : 2;
          return statusRank(left.status) - statusRank(right.status) || right.updatedAt.localeCompare(left.updatedAt);
        })[0];
      const warnings: string[] = currentDay.timezoneApplied ? [] : ["오늘 날짜는 현재 서버 기준입니다."];
      if (!plan) {
        warnings.push("아직 활성화된 학습 계획이 없습니다.");
        return { version: 1, userId: principal.userId, goalId: goal.id, goalRevision: goal.revision, goalStatus: goal.status, state: "locked", warnings, generatedAt: at };
      }
      const day = plan.days.find((candidate) => candidate.localDate === currentDay.date);
      const sessions = (await listSessions(root, principal.userId))
        .filter((candidate) => candidate.userId === principal.userId && candidate.goalId === goal.id && candidate.planVersionId === plan.id && candidate.dayId === day?.id)
        .sort((left, right) => right.startedAt.localeCompare(left.startedAt));
      const session = sessions[0];
      if (!day) {
        warnings.push("오늘 날짜에 예정된 학습 일이 없습니다.");
        return { version: 1, userId: principal.userId, goalId: goal.id, goalRevision: goal.revision, goalStatus: goal.status, plan: { id: plan.id, inputRevision: plan.inputRevision, status: plan.status }, state: "locked", warnings, generatedAt: at };
      }
      const state: LearningToday["state"] = session?.status === "completed" ? "completed" : session?.contentStatus === "pending" ? "content-pending" : session ? "active" : "available";
      return { version: 1, userId: principal.userId, goalId: goal.id, goalRevision: goal.revision, goalStatus: goal.status, plan: { id: plan.id, inputRevision: plan.inputRevision, status: plan.status }, day, ...(session ? { session } : {}), state, warnings, generatedAt: at };
    },

    async startLearningGoalSession(principal, goalId, input: LearningGoalSessionInput): Promise<LearningSession> {
      ensurePrincipal(principal);
      return withDurableLearningGoalSessionLock(root, principal.userId, goalId, input.planVersionId, input.dayId, async () => {
        const goal = await loadOwnerGoal(root, principal, goalId);
        if (!goal) throw new Error("Learning goal not found");
        try { assertIdentityId(input.planVersionId); assertIdentityId(input.dayId); } catch { throw new Error("Learning plan version or day is invalid"); }
        const plan = await loadLearningPlanVersion(root, principal.userId, input.planVersionId);
        if (!plan || plan.userId !== principal.userId || plan.goalId !== goal.id || plan.status === "superseded") throw new Error("Learning plan version not found");
        const day = plan.days.find((candidate) => candidate.id === input.dayId);
        if (!day) throw new Error("Learning plan day not found");
        const existing = (await listSessions(root, principal.userId)).find((candidate) => candidate.userId === principal.userId && candidate.goalId === goal.id && candidate.planVersionId === plan.id && candidate.dayId === day.id && candidate.status === "active");
        if (existing) return existing;
        if (input.expectedRevision !== undefined && input.expectedRevision !== goal.revision) throw new Error("Learning goal revision conflict");
        const at = now(); assertTimestamp(at, "goal learning session timestamp");
        if (plan.status !== "active") await saveLearningPlanVersion(root, { ...plan, status: "active", updatedAt: at });
        const activatedGoal: LearningGoal = goal.status === "active" ? goal : { ...goal, status: "active", revision: goal.revision + 1, updatedAt: at };
        if (activatedGoal !== goal) await saveLearningGoal(root, activatedGoal);
        const session: LearningSession = {
          version: 1, id: "learning-session-" + randomUUID(), userId: principal.userId, planId: plan.id, revision: 1,
          goalId: goal.id, planVersionId: plan.id, dayId: day.id, contentStatus: "not-requested",
          status: "active", startedAt: at, resumedAt: at,
        };
        await saveSession(root, session);
        return session;
      }, { waitForMs: 2_000 });
    },

    async requestLearningSessionContent(principal, sessionId): Promise<LearningContentRequest> {
      ensurePrincipal(principal);
      try { assertIdentityId(sessionId); } catch { throw new Error("Learning session not found"); }
      const reservation = await withSessionMutationLock(`${principal.userId}:${sessionId}`, () => withDurableLearningSessionLock(root, principal.userId, sessionId, async () => {
        const session = await loadSessionUnlocked(root, principal.userId, sessionId);
        if (!session || session.userId !== principal.userId) throw new Error("Learning session not found");
        if (!session.goalId || !session.planVersionId || !session.dayId) throw new Error("Learning goal session content requires an activated goal day");
        const plan = await loadLearningPlanVersion(root, principal.userId, session.planVersionId);
        if (!plan || plan.userId !== principal.userId || plan.goalId !== session.goalId || plan.status === "superseded") throw new Error("Learning plan version not found");
        const day = plan.days.find((candidate) => candidate.id === session.dayId);
        if (!day) throw new Error("Learning plan day not found");
        const existing = (await listLearningContentRequestsUnlocked(root, principal.userId)).find((request) => request.userId === principal.userId && request.sessionId === session.id);
        if (existing) return { request: existing, shouldDispatch: false as const };
        const at = now(); assertTimestamp(at, "learning content request timestamp");
        const request: LearningContentRequest = {
          version: 1, id: "learning-content-request-" + randomUUID(), userId: principal.userId,
          sessionId: session.id, goalId: session.goalId, planVersionId: plan.id, dayId: day.id,
          templateId: "learning-day-content", templateVersion: "learning-day-content-v1", scope: "private",
          inputHash: contentInputHash(session, plan, day), state: "waiting-runtime", budget: { maxMinutes: day.minutes },
          blocker: "local learning content Runtime is not configured", createdAt: at, updatedAt: at,
        };
        await saveLearningContentRequestUnlocked(root, request);
        await saveSessionUnlocked(root, nextSessionRevision(session, { contentStatus: "pending", contentRequestId: request.id }));
        return { request, shouldDispatch: true as const, session, plan, day };
      }, { waitForMs: 2_000 }));
      if (!reservation.shouldDispatch || !options.contentDispatcher) return reservation.request;
      const { request, session, plan, day } = reservation;
      try {
        const result = await dispatchForUser(principal.userId, () => options.contentDispatcher!({
          principal, request, session, plan, day,
          complete: (lesson) => this.completeLearningContent(principal, request.id, lesson),
        }));
        if (result.status === "completed") return await this.completeLearningContent(principal, request.id, result.lesson);
        const waiting: LearningContentRequest = { ...request, state: "waiting-runtime", ...(result.blocker ? { blocker: safeRuntimeBlocker(result.blocker) } : {}), updatedAt: now() };
        await saveLearningContentRequest(root, waiting);
        return waiting;
      } catch (error) {
        const waiting: LearningContentRequest = { ...request, state: "waiting-runtime", blocker: error instanceof Error ? safeRuntimeBlocker(error.message) : "local learning content Runtime did not complete", updatedAt: now() };
        await saveLearningContentRequest(root, waiting);
        return waiting;
      }
    },

    async getLearningSessionContent(principal, sessionId): Promise<LearningContentRequest | null> {
      ensurePrincipal(principal);
      try { assertIdentityId(sessionId); } catch { return null; }
      const session = await loadSession(root, principal.userId, sessionId);
      if (!session || session.userId !== principal.userId) return null;
      const request = (await listLearningContentRequests(root, principal.userId)).find((candidate) => candidate.sessionId === session.id);
      return request?.userId === principal.userId ? request : null;
    },

    async completeLearningContent(principal, requestId, input: LearningLessonInput): Promise<LearningContentRequest> {
      ensurePrincipal(principal);
      try { assertIdentityId(requestId); } catch { throw new Error("Learning content request not found"); }
      const initialRequest = await loadLearningContentRequest(root, principal.userId, requestId);
      if (!initialRequest || initialRequest.userId !== principal.userId) throw new Error("Learning content request not found");
      return withSessionMutationLock(`${principal.userId}:${initialRequest.sessionId}`, () => withDurableLearningSessionLock(root, principal.userId, initialRequest.sessionId, async () => {
        const request = await loadLearningContentRequestUnlocked(root, principal.userId, requestId);
        if (!request || request.userId !== principal.userId) throw new Error("Learning content request not found");
        if (request.state === "validated" && request.lesson) return request;
        const session = await loadSessionUnlocked(root, principal.userId, request.sessionId);
        const plan = await loadLearningPlanVersion(root, principal.userId, request.planVersionId);
        const day = plan?.days.find((candidate) => candidate.id === request.dayId);
        if (!session || session.userId !== principal.userId || !plan || plan.userId !== principal.userId || !day) throw new Error("Learning content source is no longer available");
        validateLessonInput(input, day);
        const at = now(); assertTimestamp(at, "learning content completion timestamp");
        const lesson: LearningLessonContent = {
          ...input, version: 1, id: "learning-lesson-" + randomUUID(), userId: principal.userId,
          sessionId: session.id, goalId: request.goalId, planVersionId: plan.id, dayId: day.id,
          source: { kind: "local-runtime", requestId: request.id }, createdAt: at, updatedAt: at,
        };
        const completed: LearningContentRequest = { ...request, state: "validated", lesson, blocker: undefined, updatedAt: at };
        await saveLearningContentRequestUnlocked(root, completed);
        await saveSessionUnlocked(root, nextSessionRevision(session, { contentStatus: "ready", contentRequestId: request.id, contentId: lesson.id }));
        return completed;
      }, { waitForMs: 2_000 }));
    },

    async recordLearningSessionAction(principal, sessionId, input: LearningSessionActionInput): Promise<LearningSessionAction> {
      ensurePrincipal(principal);
      try { assertIdentityId(sessionId); } catch { throw new Error("Learning session not found"); }
      const actionId = nonEmpty(input.actionId, "Learning action id", 160);
      return withDurableLearningActionLock(root, principal.userId, sessionId, actionId, async () => {
      const session = await loadSession(root, principal.userId, sessionId);
      if (!session || session.userId !== principal.userId) throw new Error("Learning session not found");
      if (session.status === "completed") throw new Error("Learning session is completed");
      if (!["explanation", "example", "hint", "self-report"].includes(input.type)) throw new Error("Learning action type is invalid");
      const contentRef = input.contentRef === undefined ? undefined : nonEmpty(input.contentRef, "Learning action content reference", 240);
      const question = input.question === undefined ? undefined : nonEmpty(input.question, "Learning action question", 2_000);
      const existing = (await listLearningSessionActionsUnlocked(root, principal.userId)).find((action) => action.sessionId === session.id && action.actionId === actionId);
      if (existing) {
        if (existing.type !== input.type || existing.contentRef !== contentRef || existing.question !== question) throw new Error("Learning action idempotency conflict");
        return existing;
      }
      const at = now(); assertTimestamp(at, "learning action timestamp");
      const action: LearningSessionAction = {
        version: 1, id: "learning-action-" + randomUUID(), userId: principal.userId, sessionId: session.id, actionId, type: input.type,
        ...(contentRef ? { contentRef } : {}), ...(question ? { question } : {}),
        status: input.type === "self-report" ? "recorded" : "waiting-runtime",
        ...(input.type === "self-report" ? {} : { blocker: "local learning action Runtime is not configured" }), createdAt: at,
      };
      await saveLearningSessionActionUnlocked(root, action);
      if (input.type === "self-report" || !options.actionDispatcher) return action;
      try {
        const result = await dispatchForUser(principal.userId, () => options.actionDispatcher!({
          principal, action, session,
          complete: (response) => this.completeLearningSessionAction(principal, action.id, response),
        }));
        if (result.status === "completed") return result.action;
        const waiting: LearningSessionAction = { ...action, blocker: result.blocker ? safeRuntimeBlocker(result.blocker) : "local learning action Runtime accepted the request but has not returned a response" };
        await saveLearningSessionActionUnlocked(root, waiting);
        return waiting;
      } catch {
        const waiting: LearningSessionAction = { ...action, blocker: "local learning action Runtime did not complete" };
        await saveLearningSessionActionUnlocked(root, waiting);
        return waiting;
      }
      }, { waitForMs: 2_000 });
    },

    async completeLearningSessionAction(principal, actionId, response): Promise<LearningSessionAction> {
      ensurePrincipal(principal);
      try { assertIdentityId(actionId); } catch { throw new Error("Learning session action not found"); }
      const initialAction = (await listLearningSessionActionsUnlocked(root, principal.userId)).find((candidate) => candidate.id === actionId);
      if (!initialAction || initialAction.userId !== principal.userId) throw new Error("Learning session action not found");
      return withDurableLearningActionLock(root, principal.userId, initialAction.sessionId, actionId, async () => {
        const action = (await listLearningSessionActionsUnlocked(root, principal.userId)).find((candidate) => candidate.id === actionId);
        if (!action || action.userId !== principal.userId) throw new Error("Learning session action not found");
        const value = validateLearningActionResponse(response);
        if (action.status === "recorded") {
          if (action.response === value) return action;
          throw new Error("Learning session action completion conflict");
        }
        const session = await loadSession(root, principal.userId, action.sessionId);
        if (!session || session.userId !== principal.userId) throw new Error("Learning session not found");
        const completed: LearningSessionAction = {
          ...action, status: "recorded", response: value, source: { kind: "local-runtime" }, blocker: undefined,
        };
        await saveLearningSessionActionUnlocked(root, completed);
        return completed;
      }, { waitForMs: 2_000 });
    },

    async listLearningSessionActions(principal, sessionId) {
      ensurePrincipal(principal);
      try { assertIdentityId(sessionId); } catch { return []; }
      const session = await loadSession(root, principal.userId, sessionId);
      if (!session || session.userId !== principal.userId) return [];
      const candidates = (await listLearningSessionActions(root, principal.userId)).filter((action) => action.sessionId === session.id);
      const current: LearningSessionAction[] = [];
      for (const candidate of candidates) {
        await withDurableLearningActionLock(root, principal.userId, session.id, candidate.actionId, async () => {
          await withDurableLearningActionLock(root, principal.userId, session.id, candidate.id, async () => {
            const action = (await listLearningSessionActionsUnlocked(root, principal.userId)).find((item) => item.id === candidate.id);
            if (action?.userId === principal.userId && action.sessionId === session.id) current.push(action);
          }, { waitForMs: 2_000 });
        }, { waitForMs: 2_000 });
      }
      return current.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    },

    async submitLearningAnswer(principal, sessionId, input): Promise<LearningAnswerReceipt> {
      ensurePrincipal(principal);
      try { assertIdentityId(sessionId); assertIdentityId(input.exerciseId); assertIdentityId(input.attemptId); } catch { throw new Error("Learning answer source is invalid"); }
      return withDurableLearningAnswerLock(root, principal.userId, sessionId, input.attemptId, async () => {
        const session = await loadSession(root, principal.userId, sessionId);
      if (!session || session.userId !== principal.userId) throw new Error("Learning session not found");
      if (session.status === "completed") throw new Error("Learning session is completed");
      const exercise = await loadCodingExercise(root, principal.userId, input.exerciseId);
      if (!exercise || exercise.userId !== principal.userId || exercise.sessionId !== session.id) throw new Error("Coding exercise not found for learning session");
      const attempt = (await listCodingAttempts(root, principal.userId)).find((candidate) => candidate.id === input.attemptId && candidate.exerciseId === exercise.id);
      if (!attempt) throw new Error("Coding attempt not found");
      const response = nonEmpty(input.response, "Learning answer response", 100_000);
      const submittedArtifactRefs = input.artifactRefs ?? [];
      const verifierArtifactRefs = attempt.practiceResult.artifactRefs;
      if (!Array.isArray(submittedArtifactRefs) || submittedArtifactRefs.length > 16 || submittedArtifactRefs.some((ref) => typeof ref !== "string" || !ref.trim() || ref.length > 240)) throw new Error("Learning answer artifact references are invalid");
      if (!Array.isArray(verifierArtifactRefs) || verifierArtifactRefs.length > 16 || verifierArtifactRefs.some((ref) => typeof ref !== "string" || !ref.trim() || ref.length > 240)) throw new Error("Coding practice artifact references are invalid");
      const artifactRefs = [...new Set([...verifierArtifactRefs, ...submittedArtifactRefs])];
      if (artifactRefs.length > 16) throw new Error("Learning answer artifact references are invalid");
      const existing = (await listLearningAnswerReceiptsUnlocked(root, principal.userId)).find((answer) => answer.sessionId === session.id && answer.exerciseId === exercise.id && answer.attemptId === attempt.id);
      if (existing) {
        if (existing.response !== response) throw new Error("Learning answer idempotency conflict");
        const existingSubmittedRefs = existing.artifactRefs.filter((ref) => !verifierArtifactRefs.includes(ref));
        if (JSON.stringify(existingSubmittedRefs) !== JSON.stringify(submittedArtifactRefs)) throw new Error("Learning answer idempotency conflict");
        if (JSON.stringify(existing.artifactRefs) !== JSON.stringify(artifactRefs)) {
          const repaired = { ...existing, artifactRefs: [...artifactRefs] };
          await saveLearningAnswerReceiptUnlocked(root, repaired);
          return repaired;
        }
        return existing;
      }
      const at = now(); assertTimestamp(at, "learning answer timestamp");
      const answer: LearningAnswerReceipt = {
        version: 1, id: "learning-answer-" + randomUUID(), userId: principal.userId, sessionId: session.id,
        exerciseId: exercise.id, attemptId: attempt.id, response, artifactRefs: [...artifactRefs], status: "evaluation-pending",
        evaluationRequestId: "learning-evaluation-request-" + randomUUID(), revealedBeforeEvaluation: false, submittedAt: at,
      };
      const feedback: LearningFeedback = {
        version: 1, id: "learning-feedback-" + randomUUID(), userId: principal.userId, answerId: answer.id,
        status: "pending", blocker: "learning evaluator is not configured", createdAt: at, updatedAt: at,
      };
      await saveLearningAnswerReceiptUnlocked(root, answer);
      await saveLearningFeedback(root, feedback);
      if (!options.feedbackDispatcher) return answer;
      try {
        const result = await dispatchForUser(principal.userId, () => options.feedbackDispatcher!({
          principal, answer, feedback, exercise, attempt,
          complete: (evaluation) => (this as InternalLearningService).completeLearningFeedback(principal, feedback.id, evaluation, { answerLockHeld: true }),
        }));
        if (result.status === "completed") {
          return (await loadLearningAnswerReceiptUnlocked(root, principal.userId, answer.id)) ?? answer;
        }
        const waiting: LearningFeedback = { ...feedback, blocker: result.blocker ? safeRuntimeBlocker(result.blocker) : "local learning evaluator accepted the request but has not returned feedback", updatedAt: now() };
        await saveLearningFeedback(root, waiting);
      } catch (error) {
        const waiting: LearningFeedback = { ...feedback, blocker: error instanceof Error ? safeRuntimeBlocker(error.message) : "local learning evaluator did not complete", updatedAt: now() };
        await saveLearningFeedback(root, waiting);
      }
        return answer;
      }, { waitForMs: 2_000 });
    },

    async getLearningAnswerFeedback(principal, answerId): Promise<LearningFeedback | null> {
      ensurePrincipal(principal);
      try { assertIdentityId(answerId); } catch { return null; }
      const answer = await loadLearningAnswerReceipt(root, principal.userId, answerId);
      if (!answer || answer.userId !== principal.userId) return null;
      const feedback = (await listLearningFeedback(root, principal.userId)).find((candidate) => candidate.answerId === answer.id);
      if (!feedback || feedback.userId !== principal.userId) return null;
      return withDurableLearningFeedbackCompletionLock(root, principal.userId, feedback.id, async () => {
        const currentAnswer = await loadLearningAnswerReceipt(root, principal.userId, answerId);
        if (!currentAnswer || currentAnswer.userId !== principal.userId) return null;
        const current = (await listLearningFeedback(root, principal.userId)).find((candidate) => candidate.answerId === currentAnswer.id);
        return current?.userId === principal.userId ? current : null;
      }, { waitForMs: 2_000 });
    },

    async listLearningAnswers(principal, sessionId): Promise<LearningAnswerReceipt[]> {
      ensurePrincipal(principal);
      try { assertIdentityId(sessionId); } catch { return []; }
      const session = await loadSession(root, principal.userId, sessionId);
      if (!session || session.userId !== principal.userId) return [];
      const candidates = (await listLearningAnswerReceipts(root, principal.userId))
        .filter((answer) => answer.userId === principal.userId && answer.sessionId === session.id);
      const current: LearningAnswerReceipt[] = [];
      for (const candidate of candidates) {
        await withDurableLearningAnswerLock(root, principal.userId, session.id, candidate.attemptId, async () => {
          const answer = await loadLearningAnswerReceiptUnlocked(root, principal.userId, candidate.id);
          if (answer?.userId === principal.userId && answer.sessionId === session.id) current.push(answer);
        }, { waitForMs: 2_000 });
      }
      return current.sort((a, b) => a.submittedAt.localeCompare(b.submittedAt));
    },

    async completeLearningFeedback(principal, feedbackId, input, internalOptions?: InternalLearningFeedbackOptions): Promise<LearningFeedback> {
      ensurePrincipal(principal);
      try { assertIdentityId(feedbackId); } catch { throw new Error("Learning feedback not found"); }
      const initialFeedback = await loadLearningFeedback(root, principal.userId, feedbackId);
      if (!initialFeedback || initialFeedback.userId !== principal.userId) throw new Error("Learning feedback not found");
      return withDurableLearningFeedbackCompletionLock(root, principal.userId, feedbackId, async () => {
      const feedback = await loadLearningFeedback(root, principal.userId, feedbackId);
      if (!feedback || feedback.userId !== principal.userId) throw new Error("Learning feedback not found");
      if (feedback.status !== "pending" && feedback.status !== "disputed") return feedback;
      const answer = await (internalOptions?.answerLockHeld ? loadLearningAnswerReceiptUnlocked(root, principal.userId, feedback.answerId) : loadLearningAnswerReceipt(root, principal.userId, feedback.answerId));
      if (!answer || answer.userId !== principal.userId) throw new Error("Learning answer not found");
      const exercise = await loadCodingExercise(root, principal.userId, answer.exerciseId);
      if (!exercise || exercise.userId !== principal.userId) throw new Error("Coding exercise not found");
      const attempt = (await listCodingAttempts(root, principal.userId)).find((candidate) => candidate.id === answer.attemptId && candidate.exerciseId === exercise.id);
      if (!attempt || attempt.userId !== principal.userId) throw new Error("Coding attempt not found");
      if (input.attemptId !== attempt.id) throw new Error("Learning feedback attempt does not match answer");
      const rubricVersion = nonEmpty(input.rubricVersion, "Learning feedback rubric version", 120);
      const evaluatorVersion = nonEmpty(input.evaluatorVersion, "Learning evaluator version", 120);
      if (!Array.isArray(input.criteriaResults) || input.criteriaResults.length < 1 || input.criteriaResults.length > 32) throw new Error("Learning feedback criteria are invalid");
      const allowedResults = new Set(["correct", "partial", "incorrect", "undetermined"]);
      const criteriaResults = input.criteriaResults.map((criterion) => {
        const criterionId = nonEmpty(criterion.criterionId, "Learning feedback criterion id", 160);
        if (!allowedResults.has(criterion.result)) throw new Error("Learning feedback criterion result is invalid");
        if (!Array.isArray(criterion.evidenceRefs) || criterion.evidenceRefs.length > 16 || criterion.evidenceRefs.some((ref) => typeof ref !== "string" || !ref.trim() || ref.length > 240)) throw new Error("Learning feedback evidence references are invalid");
        return { criterionId, result: criterion.result, evidenceRefs: [...criterion.evidenceRefs], explanation: nonEmpty(criterion.explanation, "Learning feedback criterion explanation", 2_000) };
      });
      const feedbackText = nonEmpty(input.feedback, "Learning feedback text", 8_000);
      if (!Array.isArray(input.misconceptions) || input.misconceptions.length > 32) throw new Error("Learning feedback misconceptions are invalid");
      const misconceptions = input.misconceptions.map((item) => ({ conceptId: nonEmpty(item.conceptId, "Learning feedback misconception concept", 160), observedEvidence: nonEmpty(item.observedEvidence, "Learning feedback misconception evidence", 2_000) }));
      const nextAction = nonEmpty(input.nextAction, "Learning feedback next action", 1_000);
      if (!["tentative", "verified", "needs-review"].includes(input.verification)) throw new Error("Learning feedback verification is invalid");
      const hasVerifierArtifact = attempt.practiceResult.artifactRefs.length > 0;
      const isSyntaxOnlyEvidence = attempt.practiceResult.executorId === "local-syntax-verifier";
      const canVerify = attempt.practiceResult.status !== "environment-required" && !isSyntaxOnlyEvidence && hasVerifierArtifact;
      const verification = input.verification === "verified" && !canVerify ? "tentative" : input.verification;
      const at = now(); assertTimestamp(at, "learning feedback completion timestamp");
      const evaluation: LearningFeedbackEvaluation = {
        version: 1, attemptId: attempt.id, rubricVersion, evaluatorVersion, criteriaResults, feedback: feedbackText,
        misconceptions, verification, nextAction, createdAt: at,
      };
      const evaluationHistory = feedback.evaluation ? [...(feedback.evaluationHistory ?? []), feedback.evaluation] : feedback.evaluationHistory;
      const completed: LearningFeedback = {
        ...feedback, status: verification === "verified" ? "verified" : "tentative",
        evaluation, ...(evaluationHistory && evaluationHistory.length > 0 ? { evaluationHistory } : {}), ...(verification === "tentative" && input.verification === "verified" ? { blocker: "correctness verifier evidence is absent; verified mastery is withheld" } : { blocker: undefined }), updatedAt: at,
      };
      await saveLearningFeedback(root, completed);
      await (internalOptions?.answerLockHeld ? saveLearningAnswerReceiptUnlocked(root, { ...answer, status: "feedback-ready" }) : saveLearningAnswerReceipt(root, { ...answer, status: "feedback-ready" }));
      return completed;
      }, { waitForMs: 2_000 });
    },

    async disputeLearningFeedback(principal, feedbackId, input): Promise<LearningFeedbackDisputeResult> {
      ensurePrincipal(principal);
      try { assertIdentityId(feedbackId); } catch { throw new Error("Learning feedback not found"); }
      return withDurableLearningFeedbackDisputeLock(root, principal.userId, feedbackId, async () => {
        const feedback = await loadLearningFeedback(root, principal.userId, feedbackId);
      if (!feedback || feedback.userId !== principal.userId) throw new Error("Learning feedback not found");
      const answer = await loadLearningAnswerReceipt(root, principal.userId, feedback.answerId);
      if (!answer || answer.userId !== principal.userId) throw new Error("Learning answer not found");
      const reason = nonEmpty(input.reason, "Learning feedback dispute reason", 4_000);
      const existing = (await listLearningFeedbackDisputesUnlocked(root, principal.userId)).find((candidate) => candidate.feedbackId === feedback.id);
      if (existing) {
        if (existing.reason !== reason) throw new Error("Learning feedback dispute idempotency conflict");
        return { dispute: existing, feedback, answer };
      }
      const at = now(); assertTimestamp(at, "learning feedback dispute timestamp");
      const dispute: LearningFeedbackDispute = {
        version: 1, id: "learning-feedback-dispute-" + randomUUID(), userId: principal.userId,
        feedbackId: feedback.id, answerId: answer.id, reason, status: "waiting-runtime",
        blocker: "learning feedback re-evaluation is waiting for local Runtime", createdAt: at, updatedAt: at,
      };
      const updatedFeedback: LearningFeedback = {
        ...feedback, status: "disputed", blocker: "feedback dispute recorded; re-evaluation is waiting for local Runtime", updatedAt: at,
      };
      const updatedAnswer: LearningAnswerReceipt = { ...answer, status: "disputed" };
      await saveLearningAnswerReceipt(root, updatedAnswer);
      await saveLearningFeedback(root, updatedFeedback);
      await saveLearningFeedbackDisputeUnlocked(root, dispute);
      if (!options.feedbackDispatcher) return { dispute, feedback: updatedFeedback, answer: updatedAnswer };
      const exercise = await loadCodingExercise(root, principal.userId, updatedAnswer.exerciseId);
      const attempt = exercise ? (await listCodingAttempts(root, principal.userId)).find((candidate) => candidate.id === updatedAnswer.attemptId && candidate.exerciseId === exercise.id) : undefined;
      if (!exercise || !attempt) return { dispute, feedback: updatedFeedback, answer: updatedAnswer };
      try {
        const evaluationResult = await dispatchForUser(principal.userId, () => options.feedbackDispatcher!({
          principal, answer: updatedAnswer, feedback: updatedFeedback, exercise, attempt,
          complete: (evaluation) => this.completeLearningFeedback(principal, updatedFeedback.id, evaluation),
        }));
        if (evaluationResult.status === "completed") {
          const reEvaluatedFeedback = await loadLearningFeedback(root, principal.userId, updatedFeedback.id);
          const reEvaluatedAnswer = await loadLearningAnswerReceipt(root, principal.userId, updatedAnswer.id);
          if (reEvaluatedFeedback && reEvaluatedAnswer) return { dispute: { ...dispute, status: "recorded", blocker: undefined, updatedAt: now() }, feedback: reEvaluatedFeedback, answer: reEvaluatedAnswer };
        }
        const blocker = evaluationResult.status === "completed" ? "local learning evaluator completed but the re-evaluation record could not be reloaded" : evaluationResult.blocker ? safeRuntimeBlocker(evaluationResult.blocker) : "local learning evaluator accepted re-evaluation but has not returned feedback";
        const waitingDispute: LearningFeedbackDispute = { ...dispute, blocker, updatedAt: now() };
        await saveLearningFeedbackDisputeUnlocked(root, waitingDispute);
        return { dispute: waitingDispute, feedback: updatedFeedback, answer: updatedAnswer };
      } catch (error) {
        const waitingDispute: LearningFeedbackDispute = { ...dispute, blocker: error instanceof Error ? safeRuntimeBlocker(error.message) : "local learning evaluator did not complete re-evaluation", updatedAt: now() };
        await saveLearningFeedbackDisputeUnlocked(root, waitingDispute);
        return { dispute: waitingDispute, feedback: updatedFeedback, answer: updatedAnswer };
        }
      }, { waitForMs: 2_000 });
    },

    async createLearningPlan(principal, input: LearningPlanInput): Promise<LearningPlan> {
      ensurePrincipal(principal);
      const at = now(); assertTimestamp(at, "learning plan timestamp");
      if (!Array.isArray(input.goals) || input.goals.length > 32) throw new Error("Learning goals are invalid");
      const plan: LearningPlan = {
        version: 1, id: "plan-" + randomUUID(), userId: principal.userId,
        title: nonEmpty(input.title, "Learning plan title", 160),
        description: nonEmpty(input.description, "Learning plan description", 2000),
        goals: input.goals.map((goal) => nonEmpty(goal, "Learning goal", 300)),
        status: "active", createdAt: at, updatedAt: at,
      };
      await savePlan(root, plan);
      return plan;
    },

    async getLearningPlan(principal, planId): Promise<LearningPlan | null> {
      ensurePrincipal(principal);
      try { assertIdentityId(planId); } catch { return null; }
      const plan = await loadPlan(root, principal.userId, planId);
      return plan?.userId === principal.userId ? plan : null;
    },

    async listLearningPlans(principal) {
      ensurePrincipal(principal);
      return (await listPlans(root, principal.userId)).filter((plan) => plan.userId === principal.userId).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    },

    async listLearningSessions(principal) {
      ensurePrincipal(principal);
      const candidates = (await listSessions(root, principal.userId)).filter((session) => session.userId === principal.userId);
      const current: LearningSession[] = [];
      for (const candidate of candidates) {
        await withDurableLearningSessionLock(root, principal.userId, candidate.id, async () => {
          const session = await loadSessionUnlocked(root, principal.userId, candidate.id);
          if (session?.userId === principal.userId) current.push(session);
        }, { waitForMs: 2_000 });
      }
      return current.sort((a, b) => b.resumedAt.localeCompare(a.resumedAt));
    },

    async startLearningSession(principal, planId): Promise<LearningSession> {
      const plan = await this.getLearningPlan(principal, planId);
      if (!plan) throw new Error("Learning plan not found");
      return withDurableLearningSessionStartLock(root, principal.userId, planId, async () => {
        const existing = (await listSessions(root, principal.userId)).find((session) => session.planId === planId && session.status === "active");
        if (existing) return existing;
        const at = now(); assertTimestamp(at, "learning session timestamp");
        const session: LearningSession = {
          version: 1, id: "learning-session-" + randomUUID(), userId: principal.userId, planId, revision: 1,
          status: "active", startedAt: at, resumedAt: at,
        };
        await saveSession(root, session);
        return session;
      }, { waitForMs: 2_000 });
    },

    async resumeLearningSession(principal, sessionId, expectedRevision): Promise<LearningSession | null> {
      ensurePrincipal(principal);
      try { assertIdentityId(sessionId); } catch { return null; }
      return withSessionMutationLock(`${principal.userId}:${sessionId}`, () => withDurableLearningSessionLock(root, principal.userId, sessionId, async () => {
        const session = await loadSessionUnlocked(root, principal.userId, sessionId);
        if (!session || session.userId !== principal.userId) return null;
        assertExpectedSessionRevision(session, expectedRevision);
        if (session.status === "completed") return session;
        const at = now(); assertTimestamp(at, "learning resume timestamp");
        const resumed = nextSessionRevision(session, { resumedAt: at });
        await saveSessionUnlocked(root, resumed);
        return resumed;
      }));
    },

    async completeLearningSession(principal, sessionId, expectedRevision): Promise<LearningSession | null> {
      ensurePrincipal(principal);
      try { assertIdentityId(sessionId); } catch { return null; }
      return withSessionMutationLock(`${principal.userId}:${sessionId}`, () => withDurableLearningSessionLock(root, principal.userId, sessionId, async () => {
        const session = await loadSessionUnlocked(root, principal.userId, sessionId);
        if (!session || session.userId !== principal.userId) return null;
        assertExpectedSessionRevision(session, expectedRevision);
        if (session.status === "completed") return session;
        const at = now(); assertTimestamp(at, "learning completion timestamp");
        const completed = nextSessionRevision(session, { status: "completed", completedAt: at });
        await saveSessionUnlocked(root, completed);
        if (options.activityService) {
          const activity = await options.activityService.recordActivityEvent(principal, {
            sourceType: "learning-session",
            sourceId: session.id,
            eventType: "learning.session.completed",
            eventVersion: 1,
            actorType: "user",
            verificationStatus: "verified",
            payload: { planId: session.planId },
            occurredAt: at,
          });
          await options.growthService?.applyGrowthProjection(activity);
        }
        return completed;
      }));
    },

    async recordStudyAttempt(principal, input: StudyAttemptInput) {
      ensurePrincipal(principal);
      try { assertIdentityId(input.sessionId); } catch { throw new Error("Learning session not found"); }
      return withSessionMutationLock(`${principal.userId}:${input.sessionId}`, () => withDurableLearningSessionLock(root, principal.userId, input.sessionId, async () => {
        const session = await loadSessionUnlocked(root, principal.userId, input.sessionId);
        if (!session || session.userId !== principal.userId) throw new Error("Learning session not found");
        if (session.status === "completed") throw new Error("Learning session is completed");
        const at = now(); assertTimestamp(at, "study attempt timestamp");
        const resumed = nextSessionRevision(session, { resumedAt: at });
        await saveSessionUnlocked(root, resumed);
        const attempt = {
          version: 1 as const, id: "attempt-" + randomUUID(), userId: principal.userId,
          sessionId: resumed.id, questionId: nonEmpty(input.questionId, "Question id", 160),
          answer: nonEmpty(input.answer, "Answer", 20_000),
          ...(input.correct === undefined ? {} : { correct: Boolean(input.correct) }),
          submittedAt: at,
        };
        await saveAttemptUnlocked(root, attempt);
        if (options.activityService && input.correct === true) {
          const activity = await options.activityService.recordActivityEvent(principal, {
            sourceType: "learning-session", sourceId: resumed.id,
            eventType: "learning.study.attempt.completed", eventVersion: 1,
            actorType: "user", verificationStatus: "verified",
            payload: { questionId: attempt.questionId },
          });
          await options.growthService?.applyGrowthProjection(activity);
        }
        return attempt;
      }));
    },

    async listStudyAttempts(principal, sessionId) {
      ensurePrincipal(principal);
      try { assertIdentityId(sessionId); } catch { return []; }
      return (await listAttempts(root, principal.userId))
        .filter((attempt) => attempt.userId === principal.userId && attempt.sessionId === sessionId)
        .sort((a, b) => a.submittedAt.localeCompare(b.submittedAt));
    },

    async createReviewItem(principal, input: ReviewItemInput): Promise<ReviewItem> {
      ensurePrincipal(principal);
      const at = now(); assertTimestamp(at, "review timestamp");
      const dueAt = input.dueAt ?? at; assertTimestamp(dueAt, "review due timestamp");
      const item: ReviewItem = {
        version: 1, id: "review-" + randomUUID(), userId: principal.userId,
        sourceType: nonEmpty(input.sourceType, "Review source type", 120),
        sourceId: nonEmpty(input.sourceId, "Review source id", 160),
        prompt: nonEmpty(input.prompt, "Review prompt", 5000),
        answer: nonEmpty(input.answer, "Review answer", 5000),
        dueAt, intervalDays: 1, reviewCount: 0, createdAt: at, updatedAt: at,
      };
      await saveReview(root, item);
      return item;
    },

    async listDueReviewItems(principal, at) {
      ensurePrincipal(principal); assertTimestamp(at, "review query timestamp");
      const candidates = (await listReviews(root, principal.userId))
        .filter((item) => item.userId === principal.userId && Date.parse(item.dueAt) <= Date.parse(at));
      const current: ReviewItem[] = [];
      for (const candidate of candidates) {
        await withDurableLearningReviewLock(root, principal.userId, candidate.id, async () => {
          const item = await loadReviewUnlocked(root, principal.userId, candidate.id);
          if (item?.userId === principal.userId && Date.parse(item.dueAt) <= Date.parse(at)) current.push(item);
        }, { waitForMs: 2_000 });
      }
      return current.sort((a, b) => a.dueAt.localeCompare(b.dueAt));
    },

    async reviewItem(principal, itemId, input) {
      ensurePrincipal(principal);
      if (!Number.isInteger(input.quality) || input.quality < 0 || input.quality > 5) throw new Error("Review quality must be between 0 and 5");
      return withDurableLearningReviewLock(root, principal.userId, itemId, async () => {
        const item = await loadReviewUnlocked(root, principal.userId, itemId);
        if (!item || item.userId !== principal.userId) throw new Error("Review item not found");
        const at = now(); assertTimestamp(at, "review completion timestamp");
        const intervalDays = input.quality >= 4 ? Math.max(2, item.intervalDays * 2) : input.quality >= 3 ? Math.max(1, item.intervalDays) : 1;
        const reviewed: ReviewItem = {
          ...item, intervalDays, reviewCount: item.reviewCount + 1, dueAt: addCalendarDays(at, intervalDays, principalTimezone(principal)),
          lastReviewedAt: at, updatedAt: at,
        };
        await saveReviewUnlocked(root, reviewed);
        await options.activityService?.recordActivityEvent(principal, {
          sourceType: "learning-review",
          sourceId: item.id,
          eventType: "learning.review.completed",
          eventVersion: reviewed.reviewCount,
          actorType: "user",
          verificationStatus: "verified",
          payload: { quality: input.quality, intervalDays: reviewed.intervalDays },
          occurredAt: at,
        });
        return reviewed;
      }, { waitForMs: 2_000 });
    },

    async analyzeCodeForLearning(principal, input: CodeAnalysisInput): Promise<CodeAnalysisResult> {
      ensurePrincipal(principal);
      const sourceType = nonEmpty(input.sourceType, "Code source type", 120);
      const sourceId = nonEmpty(input.sourceId, "Code source id", 160);
      const language = nonEmpty(input.language, "Code language", 64);
      const code = nonEmpty(input.code, "Code", 100_000);
      const at = now(); assertTimestamp(at, "code analysis timestamp");
      const findings: CodeAnalysisResult["findings"] = [];
      const lines = code.split(/\r?\n/);
      lines.forEach((line, index) => {
        if (/\bTODO\b/i.test(line)) findings.push({ code: "TODO", message: "이 줄의 학습 목표 또는 완료 조건을 정리해보세요.", line: index + 1 });
        if (/\bany\b/.test(line)) findings.push({ code: "ANY_TYPE", message: "any 대신 구체적인 타입을 선택할 수 있는지 확인해보세요.", line: index + 1 });
      });
      const result: CodeAnalysisResult = {
        version: 1, id: "analysis-" + randomUUID(), userId: principal.userId, sourceType, sourceId,
        language, provider: "local-static",
        summary: findings.length ? findings.length + "개의 학습 포인트를 찾았습니다." : "정적 검사에서 즉시 표시할 학습 포인트가 없습니다.",
        findings, createdAt: at,
      };
      await saveAnalysis(root, result);
      await options.activityService?.recordActivityEvent(principal, {
        sourceType: "learning-code-analysis",
        sourceId: result.id,
        eventType: "learning.code.analyzed",
        eventVersion: 1,
        actorType: "system",
        verificationStatus: "verified",
        payload: { provider: result.provider, findingCount: result.findings.length, language: result.language },
        occurredAt: at,
      });
      return result;
    },

    async getCodeAnalysis(principal, analysisId) {
      ensurePrincipal(principal);
      try { assertIdentityId(analysisId); } catch { return null; }
      const result = await loadAnalysis(root, principal.userId, analysisId);
      return result?.userId === principal.userId ? result : null;
    },

    async createCodingExercise(principal, input: CodingExerciseInput): Promise<CodingExercise> {
      ensurePrincipal(principal);
      if (input.sessionId) {
        const session = await loadSession(root, principal.userId, input.sessionId);
        if (!session || session.userId !== principal.userId) throw new Error("Learning session not found");
        if (session.status === "completed") throw new Error("Learning session is completed");
      }
      if (!Number.isInteger(input.estimatedMinutes) || input.estimatedMinutes < 1 || input.estimatedMinutes > 1440) {
        throw new Error("Coding exercise minutes are invalid");
      }
      const at = now(); assertTimestamp(at, "coding exercise timestamp");
      const exercise: CodingExercise = {
        version: 1,
        id: "coding-exercise-" + randomUUID(),
        userId: principal.userId,
        ...(input.sessionId ? { sessionId: nonEmpty(input.sessionId, "Learning session id", 160) } : {}),
        title: nonEmpty(input.title, "Coding exercise title", 200),
        prompt: nonEmpty(input.prompt, "Coding exercise prompt", 20_000),
        language: nonEmpty(input.language, "Coding exercise language", 64),
        estimatedMinutes: input.estimatedMinutes,
        verifier: { kind: "runtime-required", spec: "local-runtime-executor" },
        createdAt: at,
      };
      await saveCodingExercise(root, exercise);
      return exercise;
    },

    async listCodingExercises(principal, sessionId) {
      ensurePrincipal(principal);
      if (sessionId) {
        try { assertIdentityId(sessionId); } catch { return []; }
      }
      return (await listCodingExercises(root, principal.userId))
        .filter((exercise) => exercise.userId === principal.userId && (!sessionId || exercise.sessionId === sessionId))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    },

    async getCodingExercise(principal, exerciseId) {
      ensurePrincipal(principal);
      try { assertIdentityId(exerciseId); } catch { return null; }
      const exercise = await loadCodingExercise(root, principal.userId, exerciseId);
      return exercise?.userId === principal.userId ? exercise : null;
    },

    async submitCodingAttempt(principal, input: CodingAttemptInput) {
      ensurePrincipal(principal);
      const exercise = await this.getCodingExercise(principal, input.exerciseId);
      if (!exercise) throw new Error("Coding exercise not found");
      const clientRequestId = nonEmpty(input.clientRequestId, "Coding attempt request id", 160);
      const response = nonEmpty(input.response, "Coding attempt response", 100_000);
      return withDurableLearningCodingAttemptLock(root, principal.userId, exercise.id, clientRequestId, async () => {
        const existing = (await listCodingAttemptsUnlocked(root, principal.userId)).find((attempt) => attempt.exerciseId === exercise.id && attempt.clientRequestId === clientRequestId);
        if (existing) {
          if (existing.response !== response) throw new Error("Coding attempt idempotency conflict");
          await recordCodingAttemptActivity(principal, exercise, existing);
          return { attempt: existing, created: false };
        }
        const at = now(); assertTimestamp(at, "coding attempt timestamp");
        const attempt: CodingAttempt = {
          version: 1,
          id: "coding-attempt-" + randomUUID(),
          userId: principal.userId,
          exerciseId: exercise.id,
          clientRequestId,
          response,
          submittedAt: at,
          revealedBeforeSubmit: false,
          practiceResult: {
            status: "environment-required",
            artifactRefs: [],
            executorId: "none",
            policyRef: "local-runtime-executor",
          },
        };
        await saveCodingAttemptUnlocked(root, attempt);
        if (options.codingAttemptVerifier) {
          try {
            await options.codingAttemptVerifier({
              principal,
              exercise,
              attempt,
              complete: async (practiceResult: CodingPracticeResult) => {
                const current = (await listCodingAttemptsUnlocked(root, principal.userId)).find((candidate) => candidate.id === attempt.id);
                if (!current || current.userId !== principal.userId) throw new Error("Coding attempt not found");
                if (current.practiceResult.status !== "environment-required") {
                  return current;
                }
                const updated = { ...current, practiceResult };
                await saveCodingAttemptUnlocked(root, updated);
                return updated;
              },
            });
          } catch {
            // A verifier failure never upgrades a practice record; the durable
            // environment-required result remains the truthful fallback.
          }
        }
        const persisted = (await loadCodingAttemptUnlocked(root, principal.userId, attempt.id)) ?? attempt;
        await recordCodingAttemptActivity(principal, exercise, persisted);
        return { attempt: persisted, created: true };
      }, { waitForMs: 2_000 });
    },

    async listCodingAttempts(principal, exerciseId) {
      ensurePrincipal(principal);
      const exercise = await this.getCodingExercise(principal, exerciseId);
      if (!exercise) return [];
      const candidates = (await listCodingAttempts(root, principal.userId)).filter((attempt) => attempt.userId === principal.userId && attempt.exerciseId === exercise.id);
      const current: CodingAttempt[] = [];
      for (const candidate of candidates) {
        await withDurableLearningCodingAttemptLock(root, principal.userId, exercise.id, candidate.clientRequestId, async () => {
          const attempt = await loadCodingAttemptUnlocked(root, principal.userId, candidate.id);
          if (attempt?.userId === principal.userId && attempt.exerciseId === exercise.id) current.push(attempt);
        }, { waitForMs: 2_000 });
      }
      return current.sort((a, b) => a.submittedAt.localeCompare(b.submittedAt));
    },

    async createLearningProjectApplication(principal, goalId, input: LearningProjectApplicationInput) {
      ensurePrincipal(principal);
      const goal = await loadOwnerGoal(root, principal, goalId);
      if (!goal) throw new Error("Learning goal not found");
      if (!options.userProjectService) throw new Error("Project application service unavailable");
      try { assertIdentityId(input.projectId); } catch { throw new Error("Project not found"); }
      const project = await options.userProjectService.getProject(principal, input.projectId);
      if (!project) throw new Error("Project not found");
      const proposal = input.proposal;
      const title = requiredString(proposal.title, "Project proposal title", 200);
      const objective = requiredString(proposal.objective, "Project proposal objective", 2_000);
      const allText = [title, objective, ...proposal.acceptanceCriteria, ...proposal.tests].join(" ");
      if (/\b(push|deploy|deployed|execute|executed|commit|merge)\b/i.test(allText) || /(배포|푸시|커밋|병합|실행 성공|완료된)/i.test(allText)) throw new Error("Project application cannot claim execution or deployment");
      if (!Array.isArray(proposal.acceptanceCriteria) || proposal.acceptanceCriteria.length === 0 || proposal.acceptanceCriteria.length > 32) throw new Error("Project proposal acceptance criteria are invalid");
      if (!Array.isArray(proposal.tests) || proposal.tests.length === 0 || proposal.tests.length > 32) throw new Error("Project proposal tests are invalid");
      const acceptanceCriteria = proposal.acceptanceCriteria.map((item) => requiredString(item, "Project proposal acceptance criterion", 500));
      const tests = proposal.tests.map((item) => requiredString(item, "Project proposal test", 500));
      if (!Number.isInteger(proposal.estimatedEffort) || proposal.estimatedEffort < 1 || proposal.estimatedEffort > 1440) throw new Error("Project proposal effort is invalid");
      const learningEvidenceRefs = input.learningEvidenceRefs.map((item) => requiredString(item, "Learning evidence reference", 200)).slice(0, 64);
      const requiredPermissions = input.requiredPermissions.map((item) => requiredString(item, "Project permission", 120)).slice(0, 32);
      const human = requiredString(input.actorAssignments.human, "Human actor assignment", 120);
      const ai = input.actorAssignments.ai === undefined ? undefined : requiredString(input.actorAssignments.ai, "AI actor assignment", 120);
      const normalized = { projectId: input.projectId, proposal: { title, objective, ...(proposal.nodeRef ? { nodeRef: requiredString(proposal.nodeRef, "Project proposal node", 160) } : {}), acceptanceCriteria, tests, estimatedEffort: proposal.estimatedEffort }, learningEvidenceRefs, requiredPermissions, actorAssignments: { human, ...(ai ? { ai } : {}) } };
      const inputHash = createHash("sha256").update(JSON.stringify({ goalId, normalized })).digest("hex");
      return withDurableLearningProjectApplicationLock(root, principal.userId, goalId, input.projectId, async () => {
        const existing = (await listLearningProjectApplicationsUnlocked(root, principal.userId)).find((item) => item.goalId === goalId && item.projectId === input.projectId);
        if (existing) {
          if (existing.inputHash !== inputHash) throw new Error("Learning project application idempotency conflict");
          return { proposal: existing, created: false };
        }
        const at = now(); assertTimestamp(at, "Learning project application timestamp");
        const created: LearningProjectApplication = { version: 1, id: "learning-project-application-" + randomUUID(), userId: principal.userId, goalId, ...normalized, inputHash, status: "proposed", createdAt: at, updatedAt: at };
        await saveLearningProjectApplicationUnlocked(root, created);
        return { proposal: created, created: true };
      }, { waitForMs: 2_000 });
    },

    async listLearningProjectApplications(principal, goalId) {
      ensurePrincipal(principal);
      if (!await loadOwnerGoal(root, principal, goalId)) return [];
      const candidates = (await listLearningProjectApplications(root, principal.userId)).filter((item) => item.userId === principal.userId && item.goalId === goalId);
      const current: LearningProjectApplication[] = [];
      for (const candidate of candidates) {
        await withDurableLearningProjectApplicationAcceptanceLock(root, principal.userId, goalId, candidate.id, async () => {
          const application = await loadLearningProjectApplication(root, principal.userId, candidate.id);
          if (application?.userId === principal.userId && application.goalId === goalId) current.push(application);
        }, { waitForMs: 2_000 });
      }
      return current.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    },

    async acceptLearningProjectApplication(principal, goalId, proposalId) {
      ensurePrincipal(principal);
      return withDurableLearningProjectApplicationAcceptanceLock(root, principal.userId, goalId, proposalId, async () => {
        const goal = await loadOwnerGoal(root, principal, goalId);
        if (!goal) throw new Error("Learning goal not found");
        if (!options.userProjectService) throw new Error("Project application service unavailable");
        try { assertIdentityId(proposalId); } catch { throw new Error("Learning project application not found"); }
        const proposal = await loadLearningProjectApplication(root, principal.userId, proposalId);
        if (!proposal || proposal.userId !== principal.userId || proposal.goalId !== goalId) throw new Error("Learning project application not found");
        const project = await options.userProjectService.getProject(principal, proposal.projectId);
        if (!project) throw new Error("Project not found");
        const at = now(); assertTimestamp(at, "Learning project acceptance timestamp");
        const wasAccepted = proposal.status === "accepted";
        const linkedRequest = proposal.status === "accepted" && proposal.workRequestId ? project.workRequests.find((item) => item.id === proposal.workRequestId) : undefined;
        if (proposal.status === "accepted" && !linkedRequest) throw new Error("Linked learning work request not found");
        const work = linkedRequest ? { request: linkedRequest, created: false } : await options.userProjectService.createWorkRequest(principal, proposal.projectId, { title: proposal.proposal.title, objective: `${proposal.proposal.objective}${proposal.proposal.nodeRef ? ` (node: ${proposal.proposal.nodeRef})` : ""}`, idempotencyKey: `learning-application-${proposal.id}` });
        const accepted: LearningProjectApplication = wasAccepted ? proposal : { ...proposal, status: "accepted", workRequestId: work.request.id, updatedAt: at };
        if (!wasAccepted) await saveLearningProjectApplication(root, accepted);
        const existingLink = (await listLearningLinks(root, principal.userId)).find((item) => item.proposalId === accepted.id);
        const link = existingLink ?? { version: 1 as const, id: `learning-link-${accepted.id}`, userId: principal.userId, goalId, projectId: accepted.projectId, proposalId: accepted.id, workRequestId: work.request.id, sharingGrant: "owner-approved" as const, createdAt: at };
        if (!existingLink) await saveLearningLink(root, link);
        if (!wasAccepted) await options.activityService?.recordActivityEvent(principal, {
          sourceType: "learning-project-application",
          sourceId: accepted.id,
          eventType: "learning.project.application.accepted",
          eventVersion: 1,
          actorType: "user",
          verificationStatus: "unverified",
          payload: { goalId, projectId: accepted.projectId, proposalId: accepted.id, workRequestId: work.request.id },
          occurredAt: at,
        });
        return { proposal: accepted, link, workRequest: work.request };
      }, { waitForMs: 2_000 });
    },
  };
}
