import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { randomBytes } from "node:crypto";
import { assertIdentityId } from "../identity/contracts.js";
import { renameWithTransientRetry } from "../desktop-agent/atomic-file.js";
import type { CodeAnalysisResult, CodingAttempt, CodingExercise, GoalInterpretation, LearningAnswerReceipt, LearningContentRequest, LearningFeedback, LearningFeedbackDispute, LearningGoal, LearningLink, LearningPlan, LearningPlanAdjustment, LearningPlanVersion, LearningProjectApplication, LearningReport, LearningSession, LearningSessionAction, ReviewItem, StudyAttempt } from "./contracts.js";
import { withDurableLearningGoalLock } from "./goal-lock.js";
import { withDurableLearningSessionLock } from "./session-lock.js";
import { withDurableLearningActionLock } from "./action-lock.js";
import { withDurableLearningAnswerLock } from "./answer-lock.js";
import { withDurableLearningFeedbackLock } from "./feedback-lock.js";
import { withDurableLearningFeedbackDisputeLock } from "./feedback-dispute-lock.js";
import { withDurableLearningReviewLock } from "./review-lock.js";
import { withDurableLearningReportLock } from "./report-lock.js";
import { withDurableLearningProjectApplicationLock } from "./project-application-lock.js";
import { withDurableLearningPlanAdjustmentLock } from "./plan-adjustment-lock.js";
import { withDurableLearningLinkLock } from "./link-lock.js";
import { withDurableLearningCodingAttemptLock } from "./coding-attempt-lock.js";
import { withDurableLearningPlanLock } from "./plan-lock.js";
import { withDurableLearningCodingExerciseLock } from "./coding-exercise-lock.js";
import { withDurableLearningAnalysisLock } from "./analysis-lock.js";

type LearningKind = "goals" | "plans" | "plan-versions" | "interpretations" | "sessions" | "attempts" | "reviews" | "analyses" | "coding-exercises" | "coding-attempts" | "content-requests" | "actions" | "answers" | "feedback" | "disputes" | "adjustments" | "project-proposals" | "links" | "reports";
function directory(root: string, userId: string, kind: LearningKind): string { assertIdentityId(userId); return resolve(root, "users", userId, "learning", kind); }
function pathFor(root: string, userId: string, kind: LearningKind, id: string): string { assertIdentityId(id); return resolve(directory(root, userId, kind), id + ".json"); }
async function saveJson(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temporary = path + "." + process.pid + "." + randomBytes(4).toString("hex") + ".tmp";
  await writeFile(temporary, JSON.stringify(value, null, 2), "utf8");
  await renameWithTransientRetry(temporary, path);
}
async function loadJson<T>(path: string): Promise<T | null> {
  try { return JSON.parse(await readFile(path, "utf8")) as T; }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return null; throw error; }
}
async function listJson<T>(root: string, userId: string, kind: LearningKind): Promise<T[]> {
  let names: string[];
  try { names = await readdir(directory(root, userId, kind)); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return []; throw error; }
  const values: T[] = [];
  for (const name of names.filter((item) => item.endsWith(".json"))) {
    try { values.push(JSON.parse(await readFile(resolve(directory(root, userId, kind), name), "utf8")) as T); } catch { /* malformed private rows stay hidden */ }
  }
  return values;
}

export const savePlanUnlocked = (root: string, value: LearningPlan) => saveJson(pathFor(root, value.userId, "plans", value.id), value);
export const savePlan = (root: string, value: LearningPlan) => withDurableLearningPlanLock(root, value.userId, value.id, () => savePlanUnlocked(root, value), { waitForMs: 2_000 });
export const loadPlanUnlocked = (root: string, userId: string, id: string) => loadJson<LearningPlan>(pathFor(root, userId, "plans", id));
export async function loadPlan(root: string, userId: string, id: string): Promise<LearningPlan | null> {
  const candidate = await loadPlanUnlocked(root, userId, id);
  if (!candidate || candidate.userId !== userId) return null;
  try { assertIdentityId(candidate.id); }
  catch { return null; }
  return withDurableLearningPlanLock(root, userId, candidate.id, () => loadPlanUnlocked(root, userId, id), { waitForMs: 2_000 });
}
export const listPlansUnlocked = (root: string, userId: string) => listJson<LearningPlan>(root, userId, "plans");
export async function listPlans(root: string, userId: string): Promise<LearningPlan[]> {
  const candidates = await listPlansUnlocked(root, userId);
  const result: LearningPlan[] = [];
  for (const candidate of candidates) {
    try { assertIdentityId(candidate.id); } catch { continue; }
    await withDurableLearningPlanLock(root, userId, candidate.id, async () => {
      const current = await loadPlanUnlocked(root, userId, candidate.id);
      if (current?.userId === userId && current.id === candidate.id) result.push(current);
    }, { waitForMs: 2_000 });
  }
  return result;
}
export const saveLearningGoalUnlocked = (root: string, value: LearningGoal) => saveJson(pathFor(root, value.userId, "goals", value.id), value);
export const saveLearningGoal = (root: string, value: LearningGoal) => withDurableLearningGoalLock(root, value.userId, value.id, () => saveLearningGoalUnlocked(root, value), { waitForMs: 2_000 });
export const loadLearningGoalUnlocked = (root: string, userId: string, id: string) => loadJson<LearningGoal>(pathFor(root, userId, "goals", id));
export async function loadLearningGoal(root: string, userId: string, id: string): Promise<LearningGoal | null> {
  const candidate = await loadLearningGoalUnlocked(root, userId, id);
  return candidate ? withDurableLearningGoalLock(root, userId, id, () => loadLearningGoalUnlocked(root, userId, id), { waitForMs: 2_000 }) : null;
}
export async function listLearningGoalsUnlocked(root: string, userId: string): Promise<LearningGoal[]> { return listJson<LearningGoal>(root, userId, "goals"); }
export async function listLearningGoals(root: string, userId: string): Promise<LearningGoal[]> {
  const candidates = await listLearningGoalsUnlocked(root, userId);
  const result: LearningGoal[] = [];
  for (const candidate of candidates) {
    try { assertIdentityId(candidate.id); } catch { continue; }
    await withDurableLearningGoalLock(root, userId, candidate.id, async () => {
      const current = await loadLearningGoalUnlocked(root, userId, candidate.id);
      if (current?.userId === userId && current.id === candidate.id) result.push(current);
    }, { waitForMs: 2_000 });
  }
  return result;
}
export const saveGoalInterpretationUnlocked = (root: string, value: GoalInterpretation) => saveJson(pathFor(root, value.userId, "interpretations", value.id), value);
export const saveGoalInterpretation = (root: string, value: GoalInterpretation) => withDurableLearningGoalLock(root, value.userId, value.goalId, () => saveGoalInterpretationUnlocked(root, value), { waitForMs: 2_000 });
export const loadGoalInterpretationUnlocked = (root: string, userId: string, id: string) => loadJson<GoalInterpretation>(pathFor(root, userId, "interpretations", id));
export async function loadGoalInterpretation(root: string, userId: string, id: string): Promise<GoalInterpretation | null> {
  const candidate = await loadGoalInterpretationUnlocked(root, userId, id);
  return candidate ? withDurableLearningGoalLock(root, userId, candidate.goalId, () => loadGoalInterpretationUnlocked(root, userId, id), { waitForMs: 2_000 }) : null;
}
export async function listGoalInterpretationsUnlocked(root: string, userId: string): Promise<GoalInterpretation[]> { return listJson<GoalInterpretation>(root, userId, "interpretations"); }
export async function listGoalInterpretations(root: string, userId: string): Promise<GoalInterpretation[]> {
  const candidates = await listGoalInterpretationsUnlocked(root, userId);
  const result: GoalInterpretation[] = [];
  for (const candidate of candidates) {
    try { assertIdentityId(candidate.id); assertIdentityId(candidate.goalId); } catch { continue; }
    await withDurableLearningGoalLock(root, userId, candidate.goalId, async () => {
      const current = await loadGoalInterpretationUnlocked(root, userId, candidate.id);
      if (current?.userId === userId && current.id === candidate.id && current.goalId === candidate.goalId) result.push(current);
    }, { waitForMs: 2_000 });
  }
  return result;
}
export const saveLearningPlanVersionUnlocked = (root: string, value: LearningPlanVersion) => saveJson(pathFor(root, value.userId, "plan-versions", value.id), value);
export const saveLearningPlanVersion = (root: string, value: LearningPlanVersion) => withDurableLearningGoalLock(root, value.userId, value.goalId, () => saveLearningPlanVersionUnlocked(root, value), { waitForMs: 2_000 });
export const loadLearningPlanVersionUnlocked = (root: string, userId: string, id: string) => loadJson<LearningPlanVersion>(pathFor(root, userId, "plan-versions", id));
export async function loadLearningPlanVersion(root: string, userId: string, id: string): Promise<LearningPlanVersion | null> {
  const candidate = await loadLearningPlanVersionUnlocked(root, userId, id);
  return candidate ? withDurableLearningGoalLock(root, userId, candidate.goalId, () => loadLearningPlanVersionUnlocked(root, userId, id), { waitForMs: 2_000 }) : null;
}
export async function listLearningPlanVersionsUnlocked(root: string, userId: string): Promise<LearningPlanVersion[]> { return listJson<LearningPlanVersion>(root, userId, "plan-versions"); }
export async function listLearningPlanVersions(root: string, userId: string): Promise<LearningPlanVersion[]> {
  const candidates = await listLearningPlanVersionsUnlocked(root, userId);
  const result: LearningPlanVersion[] = [];
  for (const candidate of candidates) {
    try { assertIdentityId(candidate.id); assertIdentityId(candidate.goalId); } catch { continue; }
    await withDurableLearningGoalLock(root, userId, candidate.goalId, async () => {
      const current = await loadLearningPlanVersionUnlocked(root, userId, candidate.id);
      if (current?.userId === userId && current.id === candidate.id && current.goalId === candidate.goalId) result.push(current);
    }, { waitForMs: 2_000 });
  }
  return result;
}
export const saveLearningPlanAdjustmentUnlocked = (root: string, value: LearningPlanAdjustment) => saveJson(pathFor(root, value.userId, "adjustments", value.id), value);
export const saveLearningPlanAdjustment = (root: string, value: LearningPlanAdjustment) => withDurableLearningPlanAdjustmentLock(root, value.userId, value.goalId, value.inputHash, () => saveLearningPlanAdjustmentUnlocked(root, value), { waitForMs: 2_000 });
export const loadLearningPlanAdjustmentUnlocked = (root: string, userId: string, id: string) => loadJson<LearningPlanAdjustment>(pathFor(root, userId, "adjustments", id));
export async function loadLearningPlanAdjustment(root: string, userId: string, id: string): Promise<LearningPlanAdjustment | null> {
  const candidate = await loadLearningPlanAdjustmentUnlocked(root, userId, id);
  return candidate && typeof candidate.inputHash === "string" && candidate.inputHash.trim() ? withDurableLearningPlanAdjustmentLock(root, userId, candidate.goalId, candidate.inputHash, () => loadLearningPlanAdjustmentUnlocked(root, userId, id), { waitForMs: 2_000 }) : null;
}
export const listLearningPlanAdjustmentsUnlocked = (root: string, userId: string) => listJson<LearningPlanAdjustment>(root, userId, "adjustments");
export async function listLearningPlanAdjustments(root: string, userId: string): Promise<LearningPlanAdjustment[]> {
  const candidates = await listLearningPlanAdjustmentsUnlocked(root, userId);
  const result: LearningPlanAdjustment[] = [];
  for (const candidate of candidates) {
    try { assertIdentityId(candidate.id); assertIdentityId(candidate.goalId); } catch { continue; }
    if (typeof candidate.inputHash !== "string" || !candidate.inputHash.trim()) continue;
    await withDurableLearningPlanAdjustmentLock(root, userId, candidate.goalId, candidate.inputHash, async () => {
      const current = await loadLearningPlanAdjustmentUnlocked(root, userId, candidate.id);
      if (current?.userId === userId && current.id === candidate.id && current.goalId === candidate.goalId && current.inputHash === candidate.inputHash) result.push(current);
    }, { waitForMs: 2_000 });
  }
  return result;
}
export const saveSessionUnlocked = (root: string, value: LearningSession) => saveJson(pathFor(root, value.userId, "sessions", value.id), value);
export const saveSession = (root: string, value: LearningSession) => withDurableLearningSessionLock(root, value.userId, value.id, () => saveSessionUnlocked(root, value), { waitForMs: 2_000 });
function normalizeSession(value: LearningSession): LearningSession {
  const revision = Number.isInteger(value.revision) && value.revision >= 1 ? value.revision : 1;
  return { ...value, revision };
}
export async function loadSessionUnlocked(root: string, userId: string, id: string): Promise<LearningSession | null> {
  const value = await loadJson<LearningSession>(pathFor(root, userId, "sessions", id));
  return value ? normalizeSession(value) : null;
}
export async function loadSession(root: string, userId: string, id: string): Promise<LearningSession | null> {
  const candidate = await loadSessionUnlocked(root, userId, id);
  return candidate ? withDurableLearningSessionLock(root, userId, id, () => loadSessionUnlocked(root, userId, id), { waitForMs: 2_000 }) : null;
}
export async function listSessionsUnlocked(root: string, userId: string): Promise<LearningSession[]> {
  return (await listJson<LearningSession>(root, userId, "sessions")).map(normalizeSession);
}
export async function listSessions(root: string, userId: string): Promise<LearningSession[]> {
  const candidates = await listSessionsUnlocked(root, userId);
  const result: LearningSession[] = [];
  for (const candidate of candidates) {
    try { assertIdentityId(candidate.id); } catch { continue; }
    await withDurableLearningSessionLock(root, userId, candidate.id, async () => {
      const current = await loadSessionUnlocked(root, userId, candidate.id);
      if (current?.userId === userId && current.id === candidate.id) result.push(current);
    }, { waitForMs: 2_000 });
  }
  return result;
}
export const saveLearningContentRequestUnlocked = (root: string, value: LearningContentRequest) => saveJson(pathFor(root, value.userId, "content-requests", value.id), value);
export const saveLearningContentRequest = (root: string, value: LearningContentRequest) => withDurableLearningSessionLock(root, value.userId, value.sessionId, () => saveLearningContentRequestUnlocked(root, value), { waitForMs: 2_000 });
export const loadLearningContentRequestUnlocked = (root: string, userId: string, id: string) => loadJson<LearningContentRequest>(pathFor(root, userId, "content-requests", id));
export async function loadLearningContentRequest(root: string, userId: string, id: string): Promise<LearningContentRequest | null> {
  const candidate = await loadLearningContentRequestUnlocked(root, userId, id);
  return candidate ? withDurableLearningSessionLock(root, userId, candidate.sessionId, () => loadLearningContentRequestUnlocked(root, userId, id), { waitForMs: 2_000 }) : null;
}
export async function listLearningContentRequestsUnlocked(root: string, userId: string): Promise<LearningContentRequest[]> { return listJson<LearningContentRequest>(root, userId, "content-requests"); }
export async function listLearningContentRequests(root: string, userId: string): Promise<LearningContentRequest[]> {
  const candidates = await listLearningContentRequestsUnlocked(root, userId);
  const result: LearningContentRequest[] = [];
  for (const candidate of candidates) {
    try { assertIdentityId(candidate.id); assertIdentityId(candidate.sessionId); } catch { continue; }
    await withDurableLearningSessionLock(root, userId, candidate.sessionId, async () => {
      const current = await loadLearningContentRequestUnlocked(root, userId, candidate.id);
      if (current?.userId === userId && current.id === candidate.id && current.sessionId === candidate.sessionId) result.push(current);
    }, { waitForMs: 2_000 });
  }
  return result;
}
export const saveLearningSessionActionUnlocked = (root: string, value: LearningSessionAction) => saveJson(pathFor(root, value.userId, "actions", value.id), value);
export const saveLearningSessionAction = (root: string, value: LearningSessionAction) => withDurableLearningActionLock(root, value.userId, value.sessionId, value.actionId, () => saveLearningSessionActionUnlocked(root, value), { waitForMs: 2_000 });
export const listLearningSessionActionsUnlocked = (root: string, userId: string) => listJson<LearningSessionAction>(root, userId, "actions");
export async function listLearningSessionActions(root: string, userId: string): Promise<LearningSessionAction[]> {
  const candidates = await listLearningSessionActionsUnlocked(root, userId);
  const result: LearningSessionAction[] = [];
  for (const candidate of candidates) {
    try {
      assertIdentityId(candidate.id); assertIdentityId(candidate.sessionId);
      if (typeof candidate.actionId !== "string" || !candidate.actionId.trim() || candidate.actionId.length > 160) throw new Error("invalid action id");
    } catch { continue; }
    await withDurableLearningActionLock(root, userId, candidate.sessionId, candidate.actionId, async () => {
      const current = (await listLearningSessionActionsUnlocked(root, userId)).find((item) => item.id === candidate.id);
      if (current?.userId === userId && current.id === candidate.id && current.sessionId === candidate.sessionId && current.actionId === candidate.actionId) result.push(current);
    }, { waitForMs: 2_000 });
  }
  return result;
}
export const saveLearningAnswerReceiptUnlocked = (root: string, value: LearningAnswerReceipt) => saveJson(pathFor(root, value.userId, "answers", value.id), value);
export const saveLearningAnswerReceipt = (root: string, value: LearningAnswerReceipt) => withDurableLearningAnswerLock(root, value.userId, value.sessionId, value.attemptId, () => saveLearningAnswerReceiptUnlocked(root, value), { waitForMs: 2_000 });
export const loadLearningAnswerReceiptUnlocked = (root: string, userId: string, id: string) => loadJson<LearningAnswerReceipt>(pathFor(root, userId, "answers", id));
export async function loadLearningAnswerReceipt(root: string, userId: string, id: string): Promise<LearningAnswerReceipt | null> {
  const candidate = await loadLearningAnswerReceiptUnlocked(root, userId, id);
  return candidate ? withDurableLearningAnswerLock(root, userId, candidate.sessionId, candidate.attemptId, () => loadLearningAnswerReceiptUnlocked(root, userId, id), { waitForMs: 2_000 }) : null;
}
export const listLearningAnswerReceiptsUnlocked = (root: string, userId: string) => listJson<LearningAnswerReceipt>(root, userId, "answers");
export async function listLearningAnswerReceipts(root: string, userId: string): Promise<LearningAnswerReceipt[]> {
  const candidates = await listLearningAnswerReceiptsUnlocked(root, userId);
  const result: LearningAnswerReceipt[] = [];
  for (const candidate of candidates) {
    try { assertIdentityId(candidate.id); assertIdentityId(candidate.sessionId); assertIdentityId(candidate.attemptId); } catch { continue; }
    await withDurableLearningAnswerLock(root, userId, candidate.sessionId, candidate.attemptId, async () => {
      const current = await loadLearningAnswerReceiptUnlocked(root, userId, candidate.id);
      if (current?.userId === userId && current.id === candidate.id && current.sessionId === candidate.sessionId && current.attemptId === candidate.attemptId) result.push(current);
    }, { waitForMs: 2_000 });
  }
  return result;
}
export const saveLearningFeedbackUnlocked = (root: string, value: LearningFeedback) => saveJson(pathFor(root, value.userId, "feedback", value.id), value);
export const saveLearningFeedback = (root: string, value: LearningFeedback) => withDurableLearningFeedbackLock(root, value.userId, value.id, () => saveLearningFeedbackUnlocked(root, value), { waitForMs: 2_000 });
export const loadLearningFeedbackUnlocked = (root: string, userId: string, id: string) => loadJson<LearningFeedback>(pathFor(root, userId, "feedback", id));
export async function loadLearningFeedback(root: string, userId: string, id: string): Promise<LearningFeedback | null> {
  const candidate = await loadLearningFeedbackUnlocked(root, userId, id);
  return candidate ? withDurableLearningFeedbackLock(root, userId, candidate.id, () => loadLearningFeedbackUnlocked(root, userId, id), { waitForMs: 2_000 }) : null;
}
export const listLearningFeedbackUnlocked = (root: string, userId: string) => listJson<LearningFeedback>(root, userId, "feedback");
export async function listLearningFeedback(root: string, userId: string): Promise<LearningFeedback[]> {
  const candidates = await listLearningFeedbackUnlocked(root, userId);
  const result: LearningFeedback[] = [];
  for (const candidate of candidates) {
    try { assertIdentityId(candidate.id); } catch { continue; }
    await withDurableLearningFeedbackLock(root, userId, candidate.id, async () => {
      const current = await loadLearningFeedbackUnlocked(root, userId, candidate.id);
      if (current?.userId === userId && current.id === candidate.id) result.push(current);
    }, { waitForMs: 2_000 });
  }
  return result;
}
export const saveLearningFeedbackDisputeUnlocked = (root: string, value: LearningFeedbackDispute) => saveJson(pathFor(root, value.userId, "disputes", value.id), value);
export const saveLearningFeedbackDispute = (root: string, value: LearningFeedbackDispute) => withDurableLearningFeedbackDisputeLock(root, value.userId, value.feedbackId, () => saveLearningFeedbackDisputeUnlocked(root, value), { waitForMs: 2_000 });
export const loadLearningFeedbackDisputeUnlocked = (root: string, userId: string, id: string) => loadJson<LearningFeedbackDispute>(pathFor(root, userId, "disputes", id));
export async function loadLearningFeedbackDispute(root: string, userId: string, id: string): Promise<LearningFeedbackDispute | null> {
  const candidate = await loadLearningFeedbackDisputeUnlocked(root, userId, id);
  return candidate ? withDurableLearningFeedbackDisputeLock(root, userId, candidate.feedbackId, () => loadLearningFeedbackDisputeUnlocked(root, userId, id), { waitForMs: 2_000 }) : null;
}
export const listLearningFeedbackDisputesUnlocked = (root: string, userId: string) => listJson<LearningFeedbackDispute>(root, userId, "disputes");
export async function listLearningFeedbackDisputes(root: string, userId: string): Promise<LearningFeedbackDispute[]> {
  const candidates = await listLearningFeedbackDisputesUnlocked(root, userId);
  const result: LearningFeedbackDispute[] = [];
  for (const candidate of candidates) {
    try { assertIdentityId(candidate.id); assertIdentityId(candidate.feedbackId); } catch { continue; }
    await withDurableLearningFeedbackDisputeLock(root, userId, candidate.feedbackId, async () => {
      const current = await loadLearningFeedbackDisputeUnlocked(root, userId, candidate.id);
      if (current?.userId === userId && current.id === candidate.id && current.feedbackId === candidate.feedbackId) result.push(current);
    }, { waitForMs: 2_000 });
  }
  return result;
}
export const saveAttemptUnlocked = (root: string, value: StudyAttempt) => saveJson(pathFor(root, value.userId, "attempts", value.id), value);
export const saveAttempt = (root: string, value: StudyAttempt) => withDurableLearningSessionLock(root, value.userId, value.sessionId, () => saveAttemptUnlocked(root, value), { waitForMs: 2_000 });
export const loadAttemptUnlocked = (root: string, userId: string, id: string) => loadJson<StudyAttempt>(pathFor(root, userId, "attempts", id));
export async function loadAttempt(root: string, userId: string, id: string): Promise<StudyAttempt | null> {
  const candidate = await loadAttemptUnlocked(root, userId, id);
  if (!candidate || candidate.userId !== userId) return null;
  try { assertIdentityId(candidate.sessionId); }
  catch { return null; }
  return withDurableLearningSessionLock(root, userId, candidate.sessionId, () => loadAttemptUnlocked(root, userId, id), { waitForMs: 2_000 });
}
export const listAttemptsUnlocked = (root: string, userId: string) => listJson<StudyAttempt>(root, userId, "attempts");
export async function listAttempts(root: string, userId: string): Promise<StudyAttempt[]> {
  const candidates = await listAttemptsUnlocked(root, userId);
  const result: StudyAttempt[] = [];
  for (const candidate of candidates) {
    try { assertIdentityId(candidate.id); assertIdentityId(candidate.sessionId); } catch { continue; }
    await withDurableLearningSessionLock(root, userId, candidate.sessionId, async () => {
      const current = await loadAttemptUnlocked(root, userId, candidate.id);
      if (current?.userId === userId && current.id === candidate.id && current.sessionId === candidate.sessionId) result.push(current);
    }, { waitForMs: 2_000 });
  }
  return result;
}
export const saveReviewUnlocked = (root: string, value: ReviewItem) => saveJson(pathFor(root, value.userId, "reviews", value.id), value);
export const saveReview = (root: string, value: ReviewItem) => withDurableLearningReviewLock(root, value.userId, value.id, () => saveReviewUnlocked(root, value), { waitForMs: 2_000 });
export const loadReviewUnlocked = (root: string, userId: string, id: string) => loadJson<ReviewItem>(pathFor(root, userId, "reviews", id));
export async function loadReview(root: string, userId: string, id: string): Promise<ReviewItem | null> {
  const candidate = await loadReviewUnlocked(root, userId, id);
  return candidate ? withDurableLearningReviewLock(root, userId, candidate.id, () => loadReviewUnlocked(root, userId, id), { waitForMs: 2_000 }) : null;
}
export const listReviewsUnlocked = (root: string, userId: string) => listJson<ReviewItem>(root, userId, "reviews");
export async function listReviews(root: string, userId: string): Promise<ReviewItem[]> {
  const candidates = await listReviewsUnlocked(root, userId);
  const result: ReviewItem[] = [];
  for (const candidate of candidates) {
    try { assertIdentityId(candidate.id); } catch { continue; }
    await withDurableLearningReviewLock(root, userId, candidate.id, async () => {
      const current = await loadReviewUnlocked(root, userId, candidate.id);
      if (current?.userId === userId && current.id === candidate.id) result.push(current);
    }, { waitForMs: 2_000 });
  }
  return result;
}
export const saveAnalysisUnlocked = (root: string, value: CodeAnalysisResult) => saveJson(pathFor(root, value.userId, "analyses", value.id), value);
export const saveAnalysis = (root: string, value: CodeAnalysisResult) => withDurableLearningAnalysisLock(root, value.userId, value.id, () => saveAnalysisUnlocked(root, value), { waitForMs: 2_000 });
export const loadAnalysisUnlocked = (root: string, userId: string, id: string) => loadJson<CodeAnalysisResult>(pathFor(root, userId, "analyses", id));
export async function loadAnalysis(root: string, userId: string, id: string): Promise<CodeAnalysisResult | null> {
  const candidate = await loadAnalysisUnlocked(root, userId, id);
  if (!candidate || candidate.userId !== userId) return null;
  try { assertIdentityId(candidate.id); }
  catch { return null; }
  return withDurableLearningAnalysisLock(root, userId, candidate.id, () => loadAnalysisUnlocked(root, userId, id), { waitForMs: 2_000 });
}
export const saveCodingExerciseUnlocked = (root: string, value: CodingExercise) => saveJson(pathFor(root, value.userId, "coding-exercises", value.id), value);
export const saveCodingExercise = (root: string, value: CodingExercise) => withDurableLearningCodingExerciseLock(root, value.userId, value.id, () => saveCodingExerciseUnlocked(root, value), { waitForMs: 2_000 });
export const loadCodingExerciseUnlocked = (root: string, userId: string, id: string) => loadJson<CodingExercise>(pathFor(root, userId, "coding-exercises", id));
export async function loadCodingExercise(root: string, userId: string, id: string): Promise<CodingExercise | null> {
  const candidate = await loadCodingExerciseUnlocked(root, userId, id);
  if (!candidate || candidate.userId !== userId) return null;
  try { assertIdentityId(candidate.id); }
  catch { return null; }
  return withDurableLearningCodingExerciseLock(root, userId, candidate.id, () => loadCodingExerciseUnlocked(root, userId, id), { waitForMs: 2_000 });
}
export const listCodingExercisesUnlocked = (root: string, userId: string) => listJson<CodingExercise>(root, userId, "coding-exercises");
export async function listCodingExercises(root: string, userId: string): Promise<CodingExercise[]> {
  const candidates = await listCodingExercisesUnlocked(root, userId);
  const result: CodingExercise[] = [];
  for (const candidate of candidates) {
    try { assertIdentityId(candidate.id); } catch { continue; }
    await withDurableLearningCodingExerciseLock(root, userId, candidate.id, async () => {
      const current = await loadCodingExerciseUnlocked(root, userId, candidate.id);
      if (current?.userId === userId && current.id === candidate.id) result.push(current);
    }, { waitForMs: 2_000 });
  }
  return result;
}
export const saveCodingAttemptUnlocked = (root: string, value: CodingAttempt) => saveJson(pathFor(root, value.userId, "coding-attempts", value.id), value);
export const saveCodingAttempt = (root: string, value: CodingAttempt) => withDurableLearningCodingAttemptLock(root, value.userId, value.exerciseId, value.clientRequestId, () => saveCodingAttemptUnlocked(root, value), { waitForMs: 2_000 });
export const loadCodingAttemptUnlocked = (root: string, userId: string, id: string) => loadJson<CodingAttempt>(pathFor(root, userId, "coding-attempts", id));
export async function loadCodingAttempt(root: string, userId: string, id: string): Promise<CodingAttempt | null> {
  const candidate = await loadCodingAttemptUnlocked(root, userId, id);
  if (!candidate || candidate.userId !== userId) return null;
  try { assertIdentityId(candidate.exerciseId); }
  catch { return null; }
  if (typeof candidate.clientRequestId !== "string" || !candidate.clientRequestId.trim() || candidate.clientRequestId.length > 160) return null;
  return withDurableLearningCodingAttemptLock(root, userId, candidate.exerciseId, candidate.clientRequestId, () => loadCodingAttemptUnlocked(root, userId, id), { waitForMs: 2_000 });
}
export const listCodingAttemptsUnlocked = (root: string, userId: string) => listJson<CodingAttempt>(root, userId, "coding-attempts");
export async function listCodingAttempts(root: string, userId: string): Promise<CodingAttempt[]> {
  const candidates = await listCodingAttemptsUnlocked(root, userId);
  const result: CodingAttempt[] = [];
  for (const candidate of candidates) {
    try { assertIdentityId(candidate.id); assertIdentityId(candidate.exerciseId); } catch { continue; }
    if (typeof candidate.clientRequestId !== "string" || !candidate.clientRequestId.trim() || candidate.clientRequestId.length > 160) continue;
    await withDurableLearningCodingAttemptLock(root, userId, candidate.exerciseId, candidate.clientRequestId, async () => {
      const current = await loadCodingAttemptUnlocked(root, userId, candidate.id);
      if (current?.userId === userId && current.id === candidate.id && current.exerciseId === candidate.exerciseId && current.clientRequestId === candidate.clientRequestId) result.push(current);
    }, { waitForMs: 2_000 });
  }
  return result;
}
export const saveLearningProjectApplicationUnlocked = (root: string, value: LearningProjectApplication) => saveJson(pathFor(root, value.userId, "project-proposals", value.id), value);
export const saveLearningProjectApplication = (root: string, value: LearningProjectApplication) => withDurableLearningProjectApplicationLock(root, value.userId, value.goalId, value.projectId, () => saveLearningProjectApplicationUnlocked(root, value), { waitForMs: 2_000 });
export const loadLearningProjectApplicationUnlocked = (root: string, userId: string, id: string) => loadJson<LearningProjectApplication>(pathFor(root, userId, "project-proposals", id));
export async function loadLearningProjectApplication(root: string, userId: string, id: string): Promise<LearningProjectApplication | null> {
  const candidate = await loadLearningProjectApplicationUnlocked(root, userId, id);
  return candidate ? withDurableLearningProjectApplicationLock(root, userId, candidate.goalId, candidate.projectId, () => loadLearningProjectApplicationUnlocked(root, userId, id), { waitForMs: 2_000 }) : null;
}
export const listLearningProjectApplicationsUnlocked = (root: string, userId: string) => listJson<LearningProjectApplication>(root, userId, "project-proposals");
export async function listLearningProjectApplications(root: string, userId: string): Promise<LearningProjectApplication[]> {
  const candidates = await listLearningProjectApplicationsUnlocked(root, userId);
  const result: LearningProjectApplication[] = [];
  for (const candidate of candidates) {
    try { assertIdentityId(candidate.id); assertIdentityId(candidate.goalId); assertIdentityId(candidate.projectId); } catch { continue; }
    await withDurableLearningProjectApplicationLock(root, userId, candidate.goalId, candidate.projectId, async () => {
      const current = await loadLearningProjectApplicationUnlocked(root, userId, candidate.id);
      if (current?.userId === userId && current.id === candidate.id && current.goalId === candidate.goalId && current.projectId === candidate.projectId) result.push(current);
    }, { waitForMs: 2_000 });
  }
  return result;
}
export const saveLearningLinkUnlocked = (root: string, value: LearningLink) => saveJson(pathFor(root, value.userId, "links", value.id), value);
export const saveLearningLink = (root: string, value: LearningLink) => withDurableLearningLinkLock(root, value.userId, value.goalId, value.projectId, value.proposalId, () => saveLearningLinkUnlocked(root, value), { waitForMs: 2_000 });
export const loadLearningLinkUnlocked = (root: string, userId: string, id: string) => loadJson<LearningLink>(pathFor(root, userId, "links", id));
export async function loadLearningLink(root: string, userId: string, id: string): Promise<LearningLink | null> {
  const candidate = await loadLearningLinkUnlocked(root, userId, id);
  if (!candidate || candidate.userId !== userId) return null;
  try { assertIdentityId(candidate.goalId); assertIdentityId(candidate.projectId); assertIdentityId(candidate.proposalId); }
  catch { return null; }
  return withDurableLearningLinkLock(root, userId, candidate.goalId, candidate.projectId, candidate.proposalId, () => loadLearningLinkUnlocked(root, userId, id), { waitForMs: 2_000 });
}
export const listLearningLinksUnlocked = (root: string, userId: string) => listJson<LearningLink>(root, userId, "links");
export async function listLearningLinks(root: string, userId: string): Promise<LearningLink[]> {
  const candidates = await listLearningLinksUnlocked(root, userId);
  const result: LearningLink[] = [];
  for (const candidate of candidates) {
    try { assertIdentityId(candidate.id); assertIdentityId(candidate.goalId); assertIdentityId(candidate.projectId); assertIdentityId(candidate.proposalId); } catch { continue; }
    await withDurableLearningLinkLock(root, userId, candidate.goalId, candidate.projectId, candidate.proposalId, async () => {
      const current = await loadLearningLinkUnlocked(root, userId, candidate.id);
      if (current?.userId === userId && current.id === candidate.id && current.goalId === candidate.goalId && current.projectId === candidate.projectId && current.proposalId === candidate.proposalId) result.push(current);
    }, { waitForMs: 2_000 });
  }
  return result;
}
function learningReportPeriodKey(value: LearningReport): string | null {
  try {
    const key = JSON.stringify(value.period);
    return typeof key === "string" && key.length > 0 && key.length <= 500 ? key : null;
  } catch { return null; }
}
export const saveLearningReportUnlocked = (root: string, value: LearningReport) => saveJson(pathFor(root, value.userId, "reports", value.id), value);
export const saveLearningReport = (root: string, value: LearningReport) => withDurableLearningReportLock(root, value.userId, value.goalId, JSON.stringify(value.period), () => saveLearningReportUnlocked(root, value), { waitForMs: 2_000 });
export const loadLearningReportUnlocked = (root: string, userId: string, id: string) => loadJson<LearningReport>(pathFor(root, userId, "reports", id));
export async function loadLearningReport(root: string, userId: string, id: string): Promise<LearningReport | null> {
  const candidate = await loadLearningReportUnlocked(root, userId, id);
  const periodKey = candidate ? learningReportPeriodKey(candidate) : null;
  return candidate && periodKey ? withDurableLearningReportLock(root, userId, candidate.goalId, periodKey, () => loadLearningReportUnlocked(root, userId, id), { waitForMs: 2_000 }) : null;
}
export const listLearningReportsUnlocked = (root: string, userId: string) => listJson<LearningReport>(root, userId, "reports");
export async function listLearningReports(root: string, userId: string): Promise<LearningReport[]> {
  const candidates = await listLearningReportsUnlocked(root, userId);
  const result: LearningReport[] = [];
  for (const candidate of candidates) {
    const periodKey = learningReportPeriodKey(candidate);
    try { assertIdentityId(candidate.id); assertIdentityId(candidate.goalId); } catch { continue; }
    if (!periodKey) continue;
    await withDurableLearningReportLock(root, userId, candidate.goalId, periodKey, async () => {
      const current = await loadLearningReportUnlocked(root, userId, candidate.id);
      if (current?.userId === userId && current.id === candidate.id && current.goalId === candidate.goalId) result.push(current);
    }, { waitForMs: 2_000 });
  }
  return result;
}
