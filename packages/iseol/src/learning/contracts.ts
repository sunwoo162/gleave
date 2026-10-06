import type { ActivityService } from "../activity/contracts.js";
import type { GrowthService } from "../growth/contracts.js";
import type { Principal } from "../identity/contracts.js";
import type { ProjectWorkRequest } from "../project-model/work-request.js";
import type { UserProjectService } from "../project-model/user-project-service.js";
import type { UserRuntimeDispatchGate } from "../runtime/user-runtime-dispatch-gate.js";

export type LearningPlan = {
  version: 1;
  id: string;
  userId: string;
  title: string;
  description: string;
  goals: string[];
  status: "active" | "completed" | "archived";
  createdAt: string;
  updatedAt: string;
};

export type LearningGoalDuration = { days: number } | { targetDate: string };
export type LearningGoal = {
  version: 1;
  id: string;
  userId: string;
  input: { subjectText: string; duration: LearningGoalDuration; dailyMinutes: number };
  optionalSettings?: { level?: "unknown" | "beginner" | "intermediate" | "advanced"; goalText?: string; explanationPreference?: string };
  status: "draft" | "planning" | "preview-ready" | "active" | "completed" | "paused" | "archived";
  revision: number;
  createdAt: string;
  updatedAt: string;
};

export type LearningSession = {
  version: 1;
  id: string;
  userId: string;
  planId: string;
  revision: number;
  status: "active" | "completed";
  startedAt: string;
  resumedAt: string;
  completedAt?: string;
  goalId?: string;
  planVersionId?: string;
  dayId?: string;
  contentStatus?: "not-requested" | "pending" | "ready";
  contentRequestId?: string;
  contentId?: string;
};

export type LearningLessonBlockKind = "review" | "concept" | "example" | "question" | "practice" | "feedback";
export type LearningLessonBlock = {
  id: string;
  kind: LearningLessonBlockKind;
  conceptIds: string[];
  minutes: number;
  title: string;
  content: string;
};
export type LearningLessonInput = {
  title: string;
  estimatedMinutes: number;
  blocks: LearningLessonBlock[];
};
export type LearningLessonContent = LearningLessonInput & {
  version: 1;
  id: string;
  userId: string;
  sessionId: string;
  goalId: string;
  planVersionId: string;
  dayId: string;
  source: { kind: "local-runtime"; requestId: string };
  createdAt: string;
  updatedAt: string;
};
export type LearningContentRequest = {
  version: 1;
  id: string;
  userId: string;
  sessionId: string;
  goalId: string;
  planVersionId: string;
  dayId: string;
  templateId: "learning-day-content";
  templateVersion: "learning-day-content-v1";
  scope: "private";
  inputHash: string;
  state: "queued" | "waiting-runtime" | "running" | "validated" | "failed" | "unknown";
  budget: { maxMinutes: number };
  lesson?: LearningLessonContent;
  blocker?: string;
  createdAt: string;
  updatedAt: string;
};
export type LearningContentDispatchRequest = {
  principal: Principal;
  request: LearningContentRequest;
  session: LearningSession;
  plan: LearningPlanVersion;
  day: LearningPlanDay;
  complete: (lesson: LearningLessonInput) => Promise<LearningContentRequest>;
};
export type LearningContentDispatchResult =
  | { status: "completed"; lesson: LearningLessonInput }
  | { status: "accepted" | "waiting"; blocker?: string };
export type LearningContentDispatcher = (request: LearningContentDispatchRequest) => Promise<LearningContentDispatchResult>;
export type LearningSessionActionType = "explanation" | "example" | "hint" | "self-report";
export type LearningSessionAction = {
  version: 1;
  id: string;
  userId: string;
  sessionId: string;
  actionId: string;
  type: LearningSessionActionType;
  contentRef?: string;
  question?: string;
  status: "recorded" | "waiting-runtime";
  response?: string;
  source?: { kind: "local-runtime" };
  blocker?: string;
  createdAt: string;
};
export type LearningSessionActionInput = { actionId: string; type: LearningSessionActionType; contentRef?: string; question?: string };
export type LearningActionDispatchRequest = {
  principal: Principal;
  action: LearningSessionAction;
  session: LearningSession;
  complete: (response: string) => Promise<LearningSessionAction>;
};
export type LearningActionDispatchResult =
  | { status: "completed"; action: LearningSessionAction }
  | { status: "accepted" | "waiting"; blocker?: string };
export type LearningActionDispatcher = (request: LearningActionDispatchRequest) => Promise<LearningActionDispatchResult>;
export type LearningAnswerReceipt = {
  version: 1;
  id: string;
  userId: string;
  sessionId: string;
  exerciseId: string;
  attemptId: string;
  response: string;
  artifactRefs: string[];
  status: "submitted" | "evaluation-pending" | "feedback-ready" | "disputed";
  evaluationRequestId: string;
  revealedBeforeEvaluation: false;
  submittedAt: string;
};
export type LearningFeedback = {
  version: 1;
  id: string;
  userId: string;
  answerId: string;
  status: "pending" | "tentative" | "verified" | "disputed";
  blocker?: string;
  evaluation?: LearningFeedbackEvaluation;
  evaluationHistory?: LearningFeedbackEvaluation[];
  createdAt: string;
  updatedAt: string;
};
export type LearningFeedbackCriterionResult = {
  criterionId: string;
  result: "correct" | "partial" | "incorrect" | "undetermined";
  evidenceRefs: string[];
  explanation: string;
};
export type LearningFeedbackEvaluationInput = {
  attemptId: string;
  rubricVersion: string;
  evaluatorVersion: string;
  criteriaResults: LearningFeedbackCriterionResult[];
  feedback: string;
  misconceptions: Array<{ conceptId: string; observedEvidence: string }>;
  verification: "tentative" | "verified" | "needs-review";
  nextAction: string;
};
export type LearningFeedbackEvaluation = LearningFeedbackEvaluationInput & {
  version: 1;
  createdAt: string;
};
export type LearningFeedbackDispute = {
  version: 1;
  id: string;
  userId: string;
  feedbackId: string;
  answerId: string;
  reason: string;
  status: "waiting-runtime" | "recorded";
  blocker?: string;
  createdAt: string;
  updatedAt: string;
};
export type LearningFeedbackDisputeResult = {
  dispute: LearningFeedbackDispute;
  feedback: LearningFeedback;
  answer: LearningAnswerReceipt;
};
export type LearningFeedbackDispatchRequest = {
  principal: Principal;
  answer: LearningAnswerReceipt;
  feedback: LearningFeedback;
  exercise: CodingExercise;
  attempt: CodingAttempt;
  complete: (evaluation: LearningFeedbackEvaluationInput) => Promise<LearningFeedback>;
};
export type LearningFeedbackDispatchResult =
  | { status: "completed"; feedback: LearningFeedback }
  | { status: "accepted" | "waiting"; blocker?: string };
export type LearningFeedbackDispatcher = (request: LearningFeedbackDispatchRequest) => Promise<LearningFeedbackDispatchResult>;

export type LearningPlanProposal = {
  normalizedSubject: string;
  assumptions: string[];
  feasibleOutcomes: string[];
  exclusions: string[];
  prerequisites: string[];
  level: { value: "unknown" | "beginner" | "intermediate" | "advanced"; evidenceRefs: string[] };
  feasibleMinutes: number;
  segments: Array<{ id: string; dayFrom: number; dayTo: number; outcomeIds: string[] }>;
  days: Array<{
    dayIndex: number;
    conceptIds: string[];
    minutes: number;
    activities: Array<{ kind: "review" | "concept" | "practice" | "feedback"; minutes: number }>;
    checkpoint: "none" | "midpoint" | "final";
  }>;
};
export type LearningPlanDispatchRequest = {
  principal: Principal;
  goal: LearningGoal;
  requestId: string;
  inputHash: string;
  timezone?: string;
};
export type LearningPlanDispatchResult =
  | { status: "completed"; proposal: LearningPlanProposal }
  | { status: "accepted" | "waiting"; blocker?: string };
export type LearningPlanDispatcher = (request: LearningPlanDispatchRequest) => Promise<LearningPlanDispatchResult>;

export type StudyAttempt = {
  version: 1;
  id: string;
  userId: string;
  sessionId: string;
  questionId: string;
  answer: string;
  correct?: boolean;
  submittedAt: string;
};

export type ReviewItem = {
  version: 1;
  id: string;
  userId: string;
  sourceType: string;
  sourceId: string;
  prompt: string;
  answer: string;
  dueAt: string;
  intervalDays: number;
  reviewCount: number;
  createdAt: string;
  updatedAt: string;
  lastReviewedAt?: string;
};

export type CodeAnalysisFinding = { code: string; message: string; line?: number };
export type CodeAnalysisResult = {
  version: 1;
  id: string;
  userId: string;
  sourceType: string;
  sourceId: string;
  language: string;
  provider: "local-static";
  summary: string;
  findings: CodeAnalysisFinding[];
  createdAt: string;
};

export type CodingExercise = {
  version: 1;
  id: string;
  userId: string;
  sessionId?: string;
  title: string;
  prompt: string;
  language: string;
  estimatedMinutes: number;
  verifier: { kind: "runtime-required"; spec: "local-runtime-executor" };
  createdAt: string;
};

export type CodingExerciseInput = {
  sessionId?: string;
  title: string;
  prompt: string;
  language: string;
  estimatedMinutes: number;
};

export type CodingPracticeReceipt = {
  checkKind: "syntax-only";
  passed: boolean;
  diagnostics: string[];
  exitCode?: number;
};
export type CodingPracticeResult =
  | { status: "environment-required"; artifactRefs: string[]; executorId: "none"; policyRef: "local-runtime-executor" }
  | { status: "syntax-verified" | "syntax-invalid"; artifactRefs: string[]; executorId: "local-syntax-verifier"; policyRef: "local-syntax-verifier-v1"; receipt: CodingPracticeReceipt };
export type CodingAttempt = {
  version: 1;
  id: string;
  userId: string;
  exerciseId: string;
  clientRequestId: string;
  response: string;
  submittedAt: string;
  revealedBeforeSubmit: false;
  practiceResult: CodingPracticeResult;
};

export type CodingAttemptInput = { exerciseId: string; clientRequestId: string; response: string };
export type CodingAttemptSubmission = { attempt: CodingAttempt; created: boolean };
export type CodingAttemptVerifierRequest = {
  principal: Principal;
  exercise: CodingExercise;
  attempt: CodingAttempt;
  complete: (practiceResult: CodingPracticeResult) => Promise<CodingAttempt>;
};
export type CodingAttemptVerifierResult = { status: "completed"; attempt: CodingAttempt } | { status: "waiting"; blocker?: string };
export type CodingAttemptVerifier = (request: CodingAttemptVerifierRequest) => Promise<CodingAttemptVerifierResult>;

export type LearningPlanInput = { title: string; description: string; goals: string[] };
export type LearningGoalInput = { subjectText: string; duration: LearningGoalDuration; dailyMinutes: number; optionalSettings?: LearningGoal["optionalSettings"] };
export type LearningGoalSessionInput = { planVersionId: string; dayId: string; expectedRevision?: number };
export type GoalInterpretation = {
  version: 1;
  id: string;
  userId: string;
  goalId: string;
  inputRevision: number;
  source: { kind: "local-template" | "local-runtime"; version: "learning-goal-template-v1" | "learning-goal-runtime-v1" };
  normalizedSubject: string;
  assumptions: string[];
  feasibleOutcomes: string[];
  exclusions: string[];
  prerequisites: string[];
  level: { value: "unknown" | "beginner" | "intermediate" | "advanced"; evidenceRefs: string[] };
  feasibleMinutes: number;
  createdAt: string;
};
export type LearningPlanDay = {
  id: string;
  dayIndex: number;
  localDate: string;
  conceptIds: string[];
  minutes: number;
  activities: Array<{ kind: "review" | "concept" | "practice" | "feedback"; minutes: number }>;
  checkpoint: "none" | "midpoint" | "final";
};
export type LearningPlanVersion = {
  version: 1;
  id: string;
  userId: string;
  goalId: string;
  inputRevision: number;
  templateVersion: "learning-plan-template-v1" | "learning-plan-runtime-v1";
  interpretationId: string;
  segments: Array<{ id: string; dayFrom: number; dayTo: number; outcomeIds: string[] }>;
  outcomes: string[];
  budget: { durationDays: number; dailyMinutes: number; totalMinutes: number };
  days: LearningPlanDay[];
  status: "validated-draft" | "active" | "superseded";
  createdAt: string;
  updatedAt: string;
};
export type LearningPlanPreview = { goal: LearningGoal; interpretation: GoalInterpretation; plan: LearningPlanVersion; created: boolean };
export type LearningPlanAdjustmentInput = {
  basePlanVersionId: string;
  expectedGoalRevision?: number;
  reason: "missed-days" | "blocked" | "changed-time" | "changed-duration" | "changed-goal";
  dailyMinutes?: number;
  durationDays?: number;
  note?: string;
};
export type LearningPlanAdjustment = {
  version: 1;
  id: string;
  userId: string;
  goalId: string;
  basePlanVersionId: string;
  baseGoalRevision: number;
  inputHash: string;
  reason: LearningPlanAdjustmentInput["reason"];
  note?: string;
  status: "proposed" | "accepted" | "rejected";
  preservedCompletedDayIds: string[];
  changes: Array<{ dayIndex: number; before?: { dayId: string; minutes: number; localDate: string }; after: { minutes: number; localDate: string }; reasonRefs: string[] }>;
  tradeoffs: string[];
  proposedPlan: { durationDays: number; dailyMinutes: number; totalMinutes: number };
  requiresAcceptance: true;
  acceptedPlanVersionId?: string;
  createdAt: string;
  updatedAt: string;
};
export type LearningPlanAdjustmentResult = { adjustment: LearningPlanAdjustment; goal: LearningGoal; plan?: LearningPlanVersion };
export type LearningProgress = {
  version: 1;
  userId: string;
  goalId: string;
  goalRevision: number;
  goalStatus: LearningGoal["status"];
  plan?: {
    id: string;
    inputRevision: number;
    status: LearningPlanVersion["status"];
    durationDays: number;
    dailyMinutes: number;
    totalMinutes: number;
  };
  schedule: {
    plannedDays: number;
    completedDays: number;
    activeDayIds: string[];
    upcomingDays: Array<{ id: string; dayIndex: number; localDate: string; minutes: number; checkpoint: LearningPlanDay["checkpoint"] }>;
  };
  actual: {
    sessions: { total: number; active: number; completed: number };
    verifiedCorrectAttempts: number;
    reportedIncorrectAttempts: number;
    unverifiedAttempts: number;
    codingAttempts: number;
    selfReports: number;
    runtimeWaitingActions: number;
  };
  evaluation: {
    pendingAnswers: number;
    feedbackReadyAnswers: number;
    disputedAnswers: number;
    pendingAnswerIds: string[];
  };
  reviews: { dueCount: number; dueItemIds: string[] };
  evidence: { verifiedAttemptIds: string[]; selfReportActionIds: string[] };
  warnings: string[];
  generatedAt: string;
};
export type LearningReportPeriod = { from: string; to: string; kind: "weekly" | "final" | "custom" };
export type LearningReport = {
  version: 1;
  id: string;
  userId: string;
  goalId: string;
  goalSubject: string;
  period: LearningReportPeriod;
  inputHash: string;
  templateVersion: "learning-report-local-v1";
  provenance: { kind: "local-evidence"; generatedBy: "system" };
  sourceRevision: { goalRevision: number; planVersionId?: string };
  participation: { plannedDays: number; plannedMinutes: number; completedSessions: number; activeSessions: number; completedMinutes: number };
  verifiedOutcomes: Array<{ outcomeId: string; label: string; evidenceRefs: string[] }>;
  unverifiedOutcomes: Array<{ outcomeId: string; label: string; evidenceRefs: string[] }>;
  remaining: string[];
  reviewSuggestions: Array<{ itemId: string; prompt: string; reasonRefs: string[] }>;
  summary: string;
  createdAt: string;
  updatedAt: string;
};
export type LearningReportResult = { report: LearningReport; created: boolean };
export type LearningToday = {
  version: 1;
  userId: string;
  goalId: string;
  goalRevision: number;
  goalStatus: LearningGoal["status"];
  plan?: { id: string; inputRevision: number; status: LearningPlanVersion["status"] };
  day?: LearningPlanDay;
  session?: LearningSession;
  state: "available" | "active" | "completed" | "content-pending" | "locked";
  warnings: string[];
  generatedAt: string;
};
export type StudyAttemptInput = { sessionId: string; questionId: string; answer: string; correct?: boolean };
export type ReviewItemInput = { sourceType: string; sourceId: string; prompt: string; answer: string; dueAt?: string };
export type CodeAnalysisInput = { sourceType: string; sourceId: string; language: string; code: string };
export type LearningProjectApplicationInput = {
  projectId: string;
  proposal: { title: string; objective: string; nodeRef?: string; acceptanceCriteria: string[]; tests: string[]; estimatedEffort: number };
  learningEvidenceRefs: string[];
  requiredPermissions: string[];
  actorAssignments: { human: string; ai?: string };
};
export type LearningProjectApplication = LearningProjectApplicationInput & {
  version: 1;
  id: string;
  userId: string;
  goalId: string;
  status: "proposed" | "accepted" | "rejected";
  inputHash: string;
  workRequestId?: string;
  createdAt: string;
  updatedAt: string;
};
export type LearningLink = { version: 1; id: string; userId: string; goalId: string; projectId: string; proposalId: string; workRequestId: string; sharingGrant: "owner-approved"; createdAt: string };
export type LearningProjectApplicationResult = { proposal: LearningProjectApplication; link: LearningLink; workRequest: ProjectWorkRequest };

export type LearningService = {
  createLearningGoal(principal: Principal, input: LearningGoalInput): Promise<LearningGoal>;
  listLearningGoals(principal: Principal): Promise<LearningGoal[]>;
  getLearningGoal(principal: Principal, goalId: string): Promise<LearningGoal | null>;
  createLearningPlanPreview(principal: Principal, goalId: string, expectedRevision?: number): Promise<LearningPlanPreview>;
  createLearningPlanAdjustment(principal: Principal, goalId: string, input: LearningPlanAdjustmentInput): Promise<LearningPlanAdjustment>;
  listLearningPlanAdjustments(principal: Principal, goalId: string): Promise<LearningPlanAdjustment[]>;
  acceptLearningPlanAdjustment(principal: Principal, goalId: string, adjustmentId: string): Promise<LearningPlanAdjustmentResult>;
  listLearningPlanVersions(principal: Principal, goalId: string): Promise<LearningPlanVersion[]>;
  getLearningPlanVersion(principal: Principal, goalId: string, versionId: string): Promise<LearningPlanVersion | null>;
  getLearningGoalProgress(principal: Principal, goalId: string): Promise<LearningProgress | null>;
  createLearningReport(principal: Principal, goalId: string, input: { period: LearningReportPeriod }): Promise<LearningReportResult>;
  listLearningReports(principal: Principal, goalId: string): Promise<LearningReport[]>;
  getLearningGoalToday(principal: Principal, goalId: string): Promise<LearningToday | null>;
  startLearningGoalSession(principal: Principal, goalId: string, input: LearningGoalSessionInput): Promise<LearningSession>;
  requestLearningSessionContent(principal: Principal, sessionId: string): Promise<LearningContentRequest>;
  getLearningSessionContent(principal: Principal, sessionId: string): Promise<LearningContentRequest | null>;
  completeLearningContent(principal: Principal, requestId: string, lesson: LearningLessonInput): Promise<LearningContentRequest>;
  recordLearningSessionAction(principal: Principal, sessionId: string, input: LearningSessionActionInput): Promise<LearningSessionAction>;
  completeLearningSessionAction(principal: Principal, actionId: string, response: string): Promise<LearningSessionAction>;
  listLearningSessionActions(principal: Principal, sessionId: string): Promise<LearningSessionAction[]>;
  submitLearningAnswer(principal: Principal, sessionId: string, input: { exerciseId: string; attemptId: string; response: string; artifactRefs?: string[] }): Promise<LearningAnswerReceipt>;
  listLearningAnswers(principal: Principal, sessionId: string): Promise<LearningAnswerReceipt[]>;
  getLearningAnswerFeedback(principal: Principal, answerId: string): Promise<LearningFeedback | null>;
  completeLearningFeedback(principal: Principal, feedbackId: string, input: LearningFeedbackEvaluationInput): Promise<LearningFeedback>;
  disputeLearningFeedback(principal: Principal, feedbackId: string, input: { reason: string }): Promise<LearningFeedbackDisputeResult>;
  createLearningPlan(principal: Principal, input: LearningPlanInput): Promise<LearningPlan>;
  listLearningPlans(principal: Principal): Promise<LearningPlan[]>;
  getLearningPlan(principal: Principal, planId: string): Promise<LearningPlan | null>;
  listLearningSessions(principal: Principal): Promise<LearningSession[]>;
  startLearningSession(principal: Principal, planId: string): Promise<LearningSession>;
  resumeLearningSession(principal: Principal, sessionId: string, expectedRevision?: number): Promise<LearningSession | null>;
  completeLearningSession(principal: Principal, sessionId: string, expectedRevision?: number): Promise<LearningSession | null>;
  recordStudyAttempt(principal: Principal, input: StudyAttemptInput): Promise<StudyAttempt>;
  listStudyAttempts(principal: Principal, sessionId: string): Promise<StudyAttempt[]>;
  createReviewItem(principal: Principal, input: ReviewItemInput): Promise<ReviewItem>;
  listDueReviewItems(principal: Principal, at: string): Promise<ReviewItem[]>;
  reviewItem(principal: Principal, itemId: string, input: { quality: number }): Promise<ReviewItem>;
  analyzeCodeForLearning(principal: Principal, input: CodeAnalysisInput): Promise<CodeAnalysisResult>;
  getCodeAnalysis(principal: Principal, analysisId: string): Promise<CodeAnalysisResult | null>;
  createCodingExercise(principal: Principal, input: CodingExerciseInput): Promise<CodingExercise>;
  listCodingExercises(principal: Principal, sessionId?: string): Promise<CodingExercise[]>;
  getCodingExercise(principal: Principal, exerciseId: string): Promise<CodingExercise | null>;
  submitCodingAttempt(principal: Principal, input: CodingAttemptInput): Promise<CodingAttemptSubmission>;
  listCodingAttempts(principal: Principal, exerciseId: string): Promise<CodingAttempt[]>;
  createLearningProjectApplication(principal: Principal, goalId: string, input: LearningProjectApplicationInput): Promise<{ proposal: LearningProjectApplication; created: boolean }>;
  listLearningProjectApplications(principal: Principal, goalId: string): Promise<LearningProjectApplication[]>;
  acceptLearningProjectApplication(principal: Principal, goalId: string, proposalId: string): Promise<LearningProjectApplicationResult>;
};

export type LearningServiceOptions = { now?: () => string; activityService?: ActivityService; growthService?: GrowthService; userProjectService?: UserProjectService; planDispatcher?: LearningPlanDispatcher; contentDispatcher?: LearningContentDispatcher; actionDispatcher?: LearningActionDispatcher; feedbackDispatcher?: LearningFeedbackDispatcher; codingAttemptVerifier?: CodingAttemptVerifier; dispatchForUser?: UserRuntimeDispatchGate };
