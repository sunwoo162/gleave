import { calendarDateForTimeZone } from '../domain/worldState';

export type CharacterType = 'a' | 'b' | 'c' | 'd';

export type UserWorld = {
  version: 1;
  userId: string;
  displayName: string;
  handle: string;
  character: CharacterType;
  interests: string[];
  activities: string[];
  onboardingCompleted: boolean;
  createdAt: string;
  updatedAt: string;
};

export type UserCharacter = {
  version: 1;
  userId: string;
  character: CharacterType;
  appearance: Record<string, string | number | boolean>;
  updatedAt: string;
};

export type AiAgentProfile = {
  version: 1;
  userId: string;
  agentId: 'default';
  name: string;
  avatarUrl: string;
  personality: string;
  tone: string;
  role: string;
  createdAt: string;
  updatedAt: string;
};

export type UserRecord = {
  id: string;
  email: string;
  displayName: string;
  timezone: string;
};

export type MemoryRecord = {
  id: string;
  userId: string;
  kind: string;
  content: string;
  source?: string;
  visibility: 'private';
  sharedTeamIds?: string[];
  createdAt: string;
  updatedAt: string;
};

export type GrowthSnapshot = {
  userId: string;
  level: number;
  xp: number;
  xpMax: number;
  stats: { development: number; learning: number; collaboration: number; consistency: number };
  actorBreakdown: { user: number; ai: number; system: number };
  evidenceEventIds: string[];
  achievements: Array<{
    id: 'first-evidence' | 'learning-session' | 'project-run' | 'collaboration' | 'consistency';
    badgeKey: string;
    title: string;
    description: string;
    unlockedAt: string;
    evidenceEventIds: string[];
  }>;
};

export type UserActivityEvent = {
  version: 1;
  id: string;
  userId: string;
  sourceType: string;
  sourceId: string;
  eventType: string;
  eventVersion: number;
  actorType: 'user' | 'ai' | 'system';
  verificationStatus: 'verified' | 'unverified' | 'unknown';
  status: 'active' | 'retracted';
  payload: Record<string, string | number | boolean | null>;
  occurredAt: string;
  createdAt: string;
  updatedAt: string;
  retractedAt?: string;
};

export type LearningPlan = {
  version: 1;
  id: string;
  userId: string;
  title: string;
  description: string;
  goals: string[];
  status: 'active' | 'completed' | 'archived';
  createdAt: string;
  updatedAt: string;
};

export type LearningGoal = {
  version: 1;
  id: string;
  userId: string;
  input: { subjectText: string; duration: { days: number } | { targetDate: string }; dailyMinutes: number };
  optionalSettings?: { level?: 'unknown' | 'beginner' | 'intermediate' | 'advanced'; goalText?: string; explanationPreference?: string };
  status: 'draft' | 'planning' | 'preview-ready' | 'active' | 'completed' | 'paused' | 'archived';
  revision: number;
  createdAt: string;
  updatedAt: string;
};

export type LearningPlanDay = {
  id: string;
  dayIndex: number;
  localDate: string;
  conceptIds: string[];
  minutes: number;
  activities: Array<{ kind: 'review' | 'concept' | 'practice' | 'feedback'; minutes: number }>;
  checkpoint: 'none' | 'midpoint' | 'final';
};

export type LearningPlanVersion = {
  version: 1;
  id: string;
  userId: string;
  goalId: string;
  inputRevision: number;
  templateVersion: 'learning-plan-template-v1' | 'learning-plan-runtime-v1';
  interpretationId: string;
  segments: Array<{ id: string; dayFrom: number; dayTo: number; outcomeIds: string[] }>;
  outcomes: string[];
  budget: { durationDays: number; dailyMinutes: number; totalMinutes: number };
  days: LearningPlanDay[];
  status: 'validated-draft' | 'active' | 'superseded';
  createdAt: string;
  updatedAt: string;
};

export type LearningPlanInterpretation = {
  version: 1;
  id: string;
  userId: string;
  goalId: string;
  inputRevision: number;
  source: { kind: 'local-template' | 'local-runtime'; version: 'learning-goal-template-v1' | 'learning-goal-runtime-v1' };
  normalizedSubject: string;
  assumptions: string[];
  feasibleOutcomes: string[];
  exclusions: string[];
  prerequisites: string[];
  level: { value: 'unknown' | 'beginner' | 'intermediate' | 'advanced'; evidenceRefs: string[] };
  feasibleMinutes: number;
  createdAt: string;
};

export type LearningPlanPreview = { goal: LearningGoal; interpretation: LearningPlanInterpretation; plan: LearningPlanVersion; created: boolean };
export type LearningPlanAdjustment = {
  version: 1;
  id: string;
  userId: string;
  goalId: string;
  basePlanVersionId: string;
  baseGoalRevision: number;
  inputHash: string;
  reason: 'missed-days' | 'blocked' | 'changed-time' | 'changed-duration' | 'changed-goal';
  note?: string;
  status: 'proposed' | 'accepted' | 'rejected';
  preservedCompletedDayIds: string[];
  changes: Array<{ dayIndex: number; before?: { dayId: string; minutes: number; localDate: string }; after: { minutes: number; localDate: string }; reasonRefs: string[] }>;
  tradeoffs: string[];
  proposedPlan: { durationDays: number; dailyMinutes: number; totalMinutes: number };
  requiresAcceptance: true;
  acceptedPlanVersionId?: string;
  createdAt: string;
  updatedAt: string;
};
export type LearningProjectApplication = {
  version: 1;
  id: string;
  userId: string;
  goalId: string;
  projectId: string;
  proposal: { title: string; objective: string; nodeRef?: string; acceptanceCriteria: string[]; tests: string[]; estimatedEffort: number };
  learningEvidenceRefs: string[];
  requiredPermissions: string[];
  actorAssignments: { human: string; ai?: string };
  inputHash: string;
  status: 'proposed' | 'accepted' | 'rejected';
  workRequestId?: string;
  createdAt: string;
  updatedAt: string;
};
export type LearningLink = { version: 1; id: string; userId: string; goalId: string; projectId: string; proposalId: string; workRequestId: string; sharingGrant: 'owner-approved'; createdAt: string };
export type LearningReport = {
  version: 1;
  id: string;
  userId: string;
  goalId: string;
  goalSubject: string;
  period: { from: string; to: string; kind: 'weekly' | 'final' | 'custom' };
  inputHash: string;
  templateVersion: 'learning-report-local-v1';
  provenance: { kind: 'local-evidence'; generatedBy: 'system' };
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
export type LearningProgress = {
  version: 1;
  userId: string;
  goalId: string;
  goalRevision: number;
  goalStatus: LearningGoal['status'];
  plan?: { id: string; inputRevision: number; status: LearningPlanVersion['status']; durationDays: number; dailyMinutes: number; totalMinutes: number };
  schedule: { plannedDays: number; completedDays: number; activeDayIds: string[]; upcomingDays: Array<{ id: string; dayIndex: number; localDate: string; minutes: number; checkpoint: LearningPlanDay['checkpoint'] }> };
  actual: { sessions: { total: number; active: number; completed: number }; verifiedCorrectAttempts: number; reportedIncorrectAttempts: number; unverifiedAttempts: number; codingAttempts: number; selfReports: number; runtimeWaitingActions: number };
  evaluation: { pendingAnswers: number; feedbackReadyAnswers: number; disputedAnswers: number; pendingAnswerIds: string[] };
  reviews: { dueCount: number; dueItemIds: string[] };
  evidence: { verifiedAttemptIds: string[]; selfReportActionIds: string[] };
  warnings: string[];
  generatedAt: string;
};
export type LearningToday = {
  version: 1;
  userId: string;
  goalId: string;
  goalRevision: number;
  goalStatus: LearningGoal['status'];
  plan?: { id: string; inputRevision: number; status: LearningPlanVersion['status'] };
  day?: LearningPlanDay;
  session?: LearningSession;
  state: 'available' | 'active' | 'completed' | 'content-pending' | 'locked';
  warnings: string[];
  generatedAt: string;
};

export type LearningSession = {
  version: 1;
  id: string;
  userId: string;
  planId: string;
  revision: number;
  status: 'active' | 'completed';
  startedAt: string;
  resumedAt: string;
  completedAt?: string;
  goalId?: string;
  planVersionId?: string;
  dayId?: string;
  contentStatus?: 'not-requested' | 'pending' | 'ready';
  contentRequestId?: string;
  contentId?: string;
};

export type LearningLessonBlock = {
  id: string;
  kind: 'review' | 'concept' | 'example' | 'question' | 'practice' | 'feedback';
  conceptIds: string[];
  minutes: number;
  title: string;
  content: string;
};

export type LearningLessonContent = {
  version: 1;
  id: string;
  userId: string;
  sessionId: string;
  goalId: string;
  planVersionId: string;
  dayId: string;
  title: string;
  estimatedMinutes: number;
  blocks: LearningLessonBlock[];
  source: { kind: 'local-runtime'; requestId: string };
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
  templateId: 'learning-day-content';
  templateVersion: 'learning-day-content-v1';
  scope: 'private';
  inputHash: string;
  state: 'queued' | 'waiting-runtime' | 'running' | 'validated' | 'failed' | 'unknown';
  budget: { maxMinutes: number };
  lesson?: LearningLessonContent;
  blocker?: string;
  createdAt: string;
  updatedAt: string;
};

export type LearningSessionAction = {
  version: 1;
  id: string;
  userId: string;
  sessionId: string;
  actionId: string;
  type: 'explanation' | 'example' | 'hint' | 'self-report';
  contentRef?: string;
  question?: string;
  status: 'recorded' | 'waiting-runtime';
  response?: string;
  source?: { kind: 'local-runtime' };
  blocker?: string;
  createdAt: string;
};

export type LearningAnswerReceipt = {
  version: 1;
  id: string;
  userId: string;
  sessionId: string;
  exerciseId: string;
  attemptId: string;
  response: string;
  artifactRefs: string[];
  status: 'submitted' | 'evaluation-pending' | 'feedback-ready' | 'disputed';
  evaluationRequestId: string;
  revealedBeforeEvaluation: false;
  submittedAt: string;
};

export type LearningFeedback = {
  version: 1;
  id: string;
  userId: string;
  answerId: string;
  status: 'pending' | 'tentative' | 'verified' | 'disputed';
  blocker?: string;
  evaluation?: LearningFeedbackEvaluation;
  evaluationHistory?: LearningFeedbackEvaluation[];
  createdAt: string;
  updatedAt: string;
};

export type LearningFeedbackEvaluation = {
  version: 1;
  attemptId: string;
  rubricVersion: string;
  evaluatorVersion: string;
  criteriaResults: Array<{ criterionId: string; result: 'correct' | 'partial' | 'incorrect' | 'undetermined'; evidenceRefs: string[]; explanation: string }>;
  feedback: string;
  misconceptions: Array<{ conceptId: string; observedEvidence: string }>;
  verification: 'tentative' | 'verified' | 'needs-review';
  nextAction: string;
  createdAt: string;
};

export type LearningFeedbackDispute = {
  version: 1;
  id: string;
  userId: string;
  feedbackId: string;
  answerId: string;
  reason: string;
  status: 'waiting-runtime' | 'recorded';
  blocker?: string;
  createdAt: string;
  updatedAt: string;
};

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

export type CodeAnalysisResult = {
  version: 1;
  id: string;
  userId: string;
  sourceType: string;
  sourceId: string;
  language: string;
  provider: 'local-static';
  summary: string;
  findings: Array<{ code: string; message: string; line?: number }>;
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
  verifier: { kind: 'runtime-required'; spec: 'local-runtime-executor' };
  createdAt: string;
};

export type CodingAttempt = {
  version: 1;
  id: string;
  userId: string;
  exerciseId: string;
  clientRequestId: string;
  response: string;
  submittedAt: string;
  revealedBeforeSubmit: false;
  practiceResult:
    | { status: 'environment-required'; artifactRefs: string[]; executorId: 'none'; policyRef: 'local-runtime-executor' }
    | { status: 'syntax-verified' | 'syntax-invalid'; artifactRefs: string[]; executorId: 'local-syntax-verifier'; policyRef: 'local-syntax-verifier-v1'; receipt: { checkKind: 'syntax-only'; passed: boolean; diagnostics: string[]; exitCode?: number } };
};

export type UserProject = {
  version: 1;
  id: string;
  ownerUserId: string;
  name: string;
  objective: string;
  purpose: string;
  teamMode: 'solo' | 'ai' | 'human' | 'mixed';
  teamId?: string;
  workspaceRoot: string;
  status: 'active' | 'archived';
  createdAt: string;
  updatedAt: string;
};
export type ProjectWorkRequest = { id: string; title: string; objective: string; status: string; idempotencyKey: string; attempts: number; dependencies?: string[]; runId?: string; blocker?: string; createdAt: string; updatedAt: string };
export type AiTeamProposal = { version: 1; id: string; projectId: string; teamId: string; agentId: string; assignmentRole: string; capabilities: Array<'context.read' | 'discussion.propose' | 'task.propose' | 'execution.request'>; approvalScope: 'suggestion-only' | 'owner-approved-execution'; requestId: string; title: string; objective: string; acceptanceCriteria: string[]; rationale: string; status: 'waiting-runtime' | 'proposed' | 'accepted' | 'rejected'; source: 'local-runtime'; workRequestId?: string; blocker?: string; createdAt: string; updatedAt: string };
export type AiTeamDiscussion = { version: 1; id: string; projectId: string; teamId: string; agentId: string; assignmentRole: string; capabilities: Array<'context.read' | 'discussion.propose' | 'task.propose' | 'execution.request'>; approvalScope: 'suggestion-only' | 'owner-approved-execution'; requestId: string; question: string; answer?: string; keyPoints: string[]; alternatives: string[]; risks: string[]; status: 'waiting-runtime' | 'completed'; source: 'local-runtime'; blocker?: string; createdAt: string; updatedAt: string };
export type ProjectExecutionProfile = { selectedRoles: string[]; executableRoles: string[]; plannedRoles: string[]; verificationStages: string[]; documentationRequired: boolean; koreanSummary?: string };
export type ProjectLifecycleItem = { version: 1; id: string; projectId: string; runId: string; evidenceId: string; kind: string; stage: string; summary: string; recordedAt: string; provider?: string; reference?: string };
export type ProjectHistoryEvent = { version: 1; id: string; projectId: string; type: string; at: string; occurredAt?: string; lifecycle?: string; summary: string; prototypeId?: string; runId?: string; nodeId?: string; source?: 'discord' | 'github' | 'figma' | 'notion' | 'calendar'; action?: string; reference?: string };
export type UserProjectRunEvidenceItem = { id: string; kind: string; stage: string; summary: string; recordedAt: string };
export type UserProjectRunObservation = { runId: string; status: string; stage?: string; blocker?: string; changedFiles: UserProjectRunEvidenceItem[]; checks: UserProjectRunEvidenceItem[]; logs: UserProjectRunEvidenceItem[]; preview: { status: 'ready'; url: string; provider?: string; recordedAt: string } | { status: 'not-available' | 'unknown'; blocker: string } };
export type UserProjectWorkspaceDiffLine = { kind: 'context' | 'addition' | 'deletion'; text: string; oldLine?: number; newLine?: number };
export type UserProjectWorkspaceDiffHunk = { header: string; lines: UserProjectWorkspaceDiffLine[] };
export type UserProjectWorkspaceFilePreview = { status: 'ready'; path: string; size: number; content: string } | { status: 'ready'; path: string; size: number; content: string; format: 'unified-diff'; stats: { additions: number; deletions: number }; hunks: UserProjectWorkspaceDiffHunk[] } | { status: 'not-available'; path: string; blocker: string };
export type UserProjectView = { project: UserProject; workspace: { id: string; purposeSelection?: { purpose: string; profile?: ProjectExecutionProfile }; tree: Array<{ id: string; title: string; status: string; runIds: string[] }>; files: { status: 'ready' | 'not-available'; items: Array<{ path: string; size: number }>; truncated?: boolean; blocker?: string }; }; workRequests: ProjectWorkRequest[]; runtime: { status: string; runId?: string; stage?: string; blocker?: string }; evidence: Array<{ id: string; kind: string; stage: string; summary: string; recordedAt: string; }>; observability: { runs: UserProjectRunObservation[] }; lifecycle: { artifacts: ProjectLifecycleItem[]; revisions: ProjectLifecycleItem[]; deployments: ProjectLifecycleItem[] }; history: ProjectHistoryEvent[] };
export type TeamRecord = { version: 1; id: string; ownerUserId: string; name: string; description: string; kind: 'project' | 'study'; visibility: 'public' | 'private'; capacity: number; status: 'active' | 'archived'; createdAt: string; updatedAt: string; viewerRole?: 'owner' | 'admin' | 'member' };
export type TeamMembership = { version: 1; id: string; teamId: string; userId: string; memberType: 'human' | 'ai'; aiMemberId?: string; role: 'owner' | 'admin' | 'member'; assignmentRole: string; capabilities: Array<'context.read' | 'discussion.propose' | 'task.propose' | 'execution.request'>; approvalScope: 'suggestion-only' | 'owner-approved-execution'; status: 'active' | 'left' | 'removed'; joinedAt: string; updatedAt: string };
export type StudySpace = { version: 1; id: string; teamId: string; ownerUserId: string; title: string; description: string; status: 'active' | 'archived'; createdAt: string; updatedAt: string };
export type StudyCurriculumLink = { version: 1; id: string; studySpaceId: string; kind: 'learning-goal' | 'resource'; referenceId: string; label: string; createdByUserId: string; createdAt: string };
export type StudyTask = { version: 1; id: string; studySpaceId: string; createdByUserId: string; title: string; instructions: string; dueLocalDate?: string; status: 'open' | 'closed'; createdAt: string; updatedAt: string };
export type StudyTaskSubmission = { version: 1; id: string; studySpaceId: string; taskId: string; userId: string; answer: string; status: 'draft' | 'submitted'; createdAt: string; updatedAt: string };
export type StudySpaceView = { space: StudySpace; curriculumLinks: StudyCurriculumLink[]; tasks: StudyTask[]; mySubmissions: StudyTaskSubmission[] };
export type RecruitmentPost = { version: 1; id: string; teamId: string; authorUserId: string; kind: 'project' | 'study'; title: string; description: string; roles: string[]; tags: string[]; status: 'open' | 'closed'; createdAt: string; updatedAt: string };
export type RecruitmentApplication = { version: 1; id: string; postId: string; teamId: string; applicantUserId: string; message: string; status: 'pending' | 'accepted' | 'rejected' | 'withdrawn'; createdAt: string; updatedAt: string };
export type PublicProfile = {
  version: 1;
  userId: string;
  handle: string;
  bio: string;
  skills: string[];
  visibility: 'public' | 'private';
  displayName: string;
  createdAt: string;
  updatedAt: string;
  publicGrowth?: { level: number; xp: number; xpMax: number; stats: { development: number; learning: number; collaboration: number; consistency: number }; achievements: Array<{ id: string; badgeKey: string; title: string; description: string; unlockedAt: string }> };
  publicProjects?: Array<{ name: string; objective: string; purpose: string; teamMode: 'solo' | 'ai' | 'human' | 'mixed'; status: 'active' | 'archived'; createdAt: string; updatedAt: string }>;
  publicLearning?: { goals: Array<{ subject: string; status: string; updatedAt: string }>; plans: Array<{ title: string; status: string; updatedAt: string }>; sessions: Array<{ status: string; startedAt: string; completedAt?: string }> };
  publicPortfolio?: Array<{ id: string; title: string; summary: string; updatedAt: string }>;
};
export type FriendRequest = { version: 1; id: string; requesterUserId: string; targetUserId: string; status: 'pending' | 'accepted' | 'rejected'; createdAt: string; updatedAt: string; requester?: PublicProfile | null };
export type DirectMessage = { version: 1; id: string; senderUserId: string; recipientUserId: string; body: string; createdAt: string };
export type TeamMessage = { version: 1; id: string; teamId: string; senderUserId: string; body: string; createdAt: string };
export type UserNotification = { version: 1; id: string; userId: string; kind: 'new-message' | 'team-invite' | 'achievement'; title: string; body: string; source: { type: 'team-message'; id: string; teamId: string; actorUserId: string } | { type: 'direct-message'; id: string; actorUserId: string; conversationUserId: string } | { type: 'ai-completion'; id: string; actorUserId: string; conversationId: string; messageId: string } | { type: 'community-comment'; id: string; postId: string; actorUserId: string } | { type: 'team-invite'; id: string; actorUserId: string; teamId: string; applicationId: string } | { type: 'achievement'; id: string; actorUserId: string; achievementId: string; evidenceEventId: string }; createdAt: string; updatedAt: string; readAt?: string };
export type UserNotificationStreamEvent = { id: string; type: 'user.notification.changed'; occurredAt: string; change: 'created' | 'read'; notificationId: string };
export type SocialBlock = { version: 1; id: string; blockerUserId: string; blockedUserId: string; status: 'active' | 'removed'; createdAt: string; updatedAt: string };
export type SocialReport = { version: 1; id: string; reporterUserId: string; targetUserId: string; reason: string; status: 'open' | 'closed'; createdAt: string; updatedAt: string };
export type PortfolioEvidence = { id: string; sourceType: 'activity' | 'project-evidence' | 'learning-report'; sourceId: string; projectId?: string; reportId?: string; actorType: 'user' | 'ai' | 'system'; verificationStatus: 'verified' | 'unverified' | 'unknown'; summary: string; occurredAt: string; provider?: string };
export type PortfolioEntry = { version: 1; id: string; userId: string; title: string; summary: string; visibility: 'public' | 'unlisted' | 'private'; evidenceIds: string[]; createdAt: string; updatedAt: string };
export type PortfolioSnapshot = { entries: PortfolioEntry[]; evidence: PortfolioEvidence[] };
export type PublicPortfolioEntry = Omit<PortfolioEntry, 'userId' | 'evidenceIds'>;
export type PublicPortfolioEvidence = Omit<PortfolioEvidence, 'id' | 'sourceId' | 'projectId' | 'reportId'>;
export type PublicPortfolioView = { entry: PublicPortfolioEntry; evidence: PublicPortfolioEvidence[] };
export type AiChatAttachment = { version: 1; id: string; name: string; mimeType: string; size: number; content: string; createdAt: string };
export type AiChatAttachmentInput = { name: string; mimeType?: string; content: string };
export type AiChatContextSelection = { memory: boolean; projectFiles: boolean; learningHistory: boolean; activityTimeline: boolean; teamDocs: boolean };
export type AiChatExecutionPlan = { version: 1; id: string; title: string; summary: string; steps: Array<{ id: string; title: string; description: string; operation: 'read' | 'write' | 'run' | 'external'; approvalRequired: boolean }>; status: 'proposed' | 'approved' | 'rejected'; createdAt: string; updatedAt: string; approvedAt?: string; rejectedAt?: string; workRequestId?: string };
export type AiChatMessage = { id: string; role: 'user' | 'assistant' | 'system'; content: string; status: 'persisted' | 'waiting_runtime'; createdAt: string; projectId?: string; contextSelection?: AiChatContextSelection; attachments?: AiChatAttachment[]; executionPlan?: AiChatExecutionPlan };
export type AiChatConversation = { version: 1; id: string; userId: string; title: string; messages: AiChatMessage[]; createdAt: string; updatedAt: string };
export type CommunityComment = { version: 1; id: string; postId: string; authorUserId: string; content: string; status: 'published' | 'hidden'; createdAt: string; updatedAt: string; author: { userId: string; displayName: string; handle: string } };
export type CommunityPost = { version: 1; id: string; authorUserId: string; category: '개발 이야기' | '학습 이야기' | '프로젝트 공유' | '질문 · 답변' | '팀 모집'; title: string; content: string; tags: string[]; status: 'published' | 'hidden'; createdAt: string; updatedAt: string; author: { userId: string; displayName: string; handle: string }; likeCount: number; viewerLiked: boolean; comments: CommunityComment[] };
export type UserSettings = {
  version: 1;
  userId: string;
  aiAccess: { memory: boolean; projectFiles: boolean; learningHistory: boolean; activityTimeline: boolean; teamDocs: boolean };
  aiApproval: { fileWrite: boolean; packageInstall: boolean; buildRun: boolean; externalApi: boolean };
  notifications: { aiDone: boolean; teamInvite: boolean; newMessage: boolean; achieve: boolean; weekly: boolean };
  privacy: { growthInfo: boolean; projectList: boolean; learningHistory: boolean };
  integrations: { calendar: boolean; github: boolean; discord: boolean };
  createdAt: string;
  updatedAt: string;
};
export type UserIntegrationProvider = 'calendar' | 'github' | 'discord';
export type UserIntegration = { provider: UserIntegrationProvider; optedIn: boolean; configured: boolean; lastDelivery: { state: 'queued' | 'delivered' | 'unknown' | 'not-configured' | 'blocked'; reason?: string } | null };

export type UserRuntimeStatus = {
  version: 1;
  source: { kind: 'local-runtime' };
  state: 'disabled' | 'ready' | 'blocked';
  projectExecution: 'ready' | 'unavailable';
  agent: 'ready' | 'unavailable';
  aiChat: 'ready' | 'unavailable';
  aiTeam: 'ready' | 'unavailable';
  learningAi: 'ready' | 'unavailable';
};
export type ActivityExport = { format: 'json' | 'markdown'; filename: string; content: string; events: Array<Record<string, unknown>> };

export class UserApiError extends Error {
  readonly status: number;
  readonly body: unknown;

  constructor(status: number, body: unknown) {
    super(typeof body === 'object' && body && 'error' in body ? String((body as { error: unknown }).error) : `User API request failed (${status})`);
    this.name = 'UserApiError';
    this.status = status;
    this.body = body;
  }
}

const SESSION_KEY = 'iseol.platform.session';

function sessionToken(): string | null {
  try {
    const value = window.localStorage.getItem(SESSION_KEY);
    if (!value) return null;
    const parsed = JSON.parse(value) as { token?: string; expiresAt?: string };
    if (!parsed.token || (parsed.expiresAt && Date.parse(parsed.expiresAt) <= Date.now())) {
      window.localStorage.removeItem(SESSION_KEY);
      return null;
    }
    return parsed.token;
  } catch {
    return null;
  }
}

function saveSession(session: { token: string; expiresAt: string }): void {
  window.localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

export function clearSession(): void {
  try { window.localStorage.removeItem(SESSION_KEY); } catch { /* browser storage may be unavailable */ }
}

function clearSessionIfCurrent(token: string): void {
  if (sessionToken() === token) clearSession();
}

async function request<T>(path: string, init: RequestInit = {}, authenticated = true): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !headers.has('content-type')) headers.set('content-type', 'application/json');
  const token = authenticated ? sessionToken() : null;
  if (token) headers.set('authorization', `Bearer ${token}`);
  const response = await fetch(path, { ...init, headers });
  const text = await response.text();
  let body: unknown = undefined;
  if (text) {
    try { body = JSON.parse(text); } catch { body = text; }
  }
  if (!response.ok) {
    if (response.status === 401 && authenticated && token) clearSessionIfCurrent(token);
    throw new UserApiError(response.status, body);
  }
  return body as T;
}

export async function signUp(input: { email: string; displayName: string; password: string; timezone?: string }): Promise<{ user: UserRecord; token: string; expiresAt: string }> {
  const result = await request<{ user: UserRecord; session: { token: string; expiresAt: string } }>('/api/user/signup', {
    method: 'POST',
    body: JSON.stringify({ ...input, timezone: input.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone }),
  }, false);
  saveSession(result.session);
  return { user: result.user, token: result.session.token, expiresAt: result.session.expiresAt };
}

export async function logIn(input: { email: string; password: string }): Promise<{ user: UserRecord; token: string; expiresAt: string }> {
  const result = await request<{ user: UserRecord; session: { token: string; expiresAt: string } }>('/api/user/login', {
    method: 'POST',
    body: JSON.stringify(input),
  }, false);
  saveSession(result.session);
  return { user: result.user, token: result.session.token, expiresAt: result.session.expiresAt };
}

export async function changePassword(input: { currentPassword: string; newPassword: string }): Promise<{ passwordChanged: true }> {
  return request<{ passwordChanged: true }>('/api/user/password', { method: 'POST', body: JSON.stringify(input) });
}

export async function logOut(): Promise<void> {
  try {
    await request<{ loggedOut: true }>('/api/user/logout', { method: 'POST', body: '{}' });
  } finally {
    clearSession();
  }
}

export async function getMe(): Promise<{ user: UserRecord }> {
  return request<{ user: UserRecord }>('/api/user/me');
}

export async function getWorld(): Promise<{ world: UserWorld; character: UserCharacter }> {
  return request<{ world: UserWorld; character: UserCharacter }>('/api/user/world');
}

export async function getAiAgentProfile(): Promise<{ profile: AiAgentProfile }> {
  return request<{ profile: AiAgentProfile }>('/api/user/agent');
}

export async function updateAiAgentProfile(patch: Partial<Pick<AiAgentProfile, 'name' | 'avatarUrl' | 'personality' | 'tone' | 'role'>>): Promise<{ profile: AiAgentProfile }> {
  return request<{ profile: AiAgentProfile }>('/api/user/agent', { method: 'PATCH', body: JSON.stringify(patch) });
}

export async function getGrowth(): Promise<GrowthSnapshot> {
  return request<GrowthSnapshot>('/api/user/growth');
}

export async function listActivityEvents(): Promise<{ events: UserActivityEvent[] }> {
  return request<{ events: UserActivityEvent[] }>('/api/user/activity');
}

export async function recordWorldMissionCompletion(missionId: 'projects' | 'learning' | 'reviews', timezone?: string): Promise<{ event: UserActivityEvent }> {
  const occurrenceDate = calendarDateForTimeZone(timezone);
  return request<{ event: UserActivityEvent }>('/api/user/activity', {
    method: 'POST',
    body: JSON.stringify({
      sourceType: 'world-mission',
      sourceId: `${missionId}:${occurrenceDate}`,
      eventType: 'world.mission.completed',
      eventVersion: 1,
      actorType: 'user',
      verificationStatus: 'unverified',
      // A mission is a date-scoped self-report. Keeping the occurrence timestamp stable makes
      // repeated clicks/retries idempotent without changing the verified-evidence boundary.
      occurredAt: `${occurrenceDate}T00:00:00.000Z`,
      payload: { missionId, occurrenceDate },
    }),
  });
}

export async function updateWorld(patch: Partial<Pick<UserWorld, 'displayName' | 'handle' | 'character' | 'interests' | 'activities' | 'onboardingCompleted'>>): Promise<{ world: UserWorld; character: UserCharacter }> {
  return request<{ world: UserWorld; character: UserCharacter }>('/api/user/world', { method: 'PUT', body: JSON.stringify(patch) });
}

export async function updateCharacter(patch: { character?: CharacterType; appearance?: Record<string, string | number | boolean> }): Promise<{ character: UserCharacter }> {
  return request<{ character: UserCharacter }>('/api/user/character', { method: 'PATCH', body: JSON.stringify(patch) });
}

export async function listMemories(search?: string): Promise<{ memories: MemoryRecord[] }> {
  const query = search ? `?search=${encodeURIComponent(search)}` : '';
  return request<{ memories: MemoryRecord[] }>(`/api/user/memory${query}`);
}

export async function appendMemory(input: { kind: string; content: string; source?: string }): Promise<{ memory: MemoryRecord }> {
  return request<{ memory: MemoryRecord }>('/api/user/memory', { method: 'POST', body: JSON.stringify(input) });
}

export async function updateMemory(memoryId: string, patch: { kind?: string; content?: string; source?: string | null }): Promise<{ memory: MemoryRecord }> {
  return request<{ memory: MemoryRecord }>(`/api/user/memory/${encodeURIComponent(memoryId)}`, { method: 'PATCH', body: JSON.stringify(patch) });
}

export async function deleteMemory(memoryId: string): Promise<void> {
  await request<void>(`/api/user/memory/${encodeURIComponent(memoryId)}`, { method: 'DELETE' });
}

export async function updateMemorySharing(memoryId: string, teamIds: string[]): Promise<{ memory: MemoryRecord }> {
  return request<{ memory: MemoryRecord }>(`/api/user/memory/${encodeURIComponent(memoryId)}/sharing`, { method: 'PATCH', body: JSON.stringify({ teamIds }) });
}

export async function listSharedMemories(teamId: string): Promise<{ memories: MemoryRecord[] }> {
  return request<{ memories: MemoryRecord[] }>(`/api/user/memory/shared?teamId=${encodeURIComponent(teamId)}`);
}

export async function listLearningPlans(): Promise<{ plans: LearningPlan[] }> {
  return request<{ plans: LearningPlan[] }>('/api/user/learning/plans');
}

export async function listLearningGoals(): Promise<{ goals: LearningGoal[] }> {
  return request<{ goals: LearningGoal[] }>('/api/user/learning/goals');
}

export async function createLearningGoal(input: { subjectText: string; duration: { days: number } | { targetDate: string }; dailyMinutes: number; optionalSettings?: LearningGoal['optionalSettings'] }): Promise<{ goal: LearningGoal }> {
  return request<{ goal: LearningGoal }>('/api/user/learning/goals', { method: 'POST', body: JSON.stringify(input) });
}

export async function listLearningProjectApplications(goalId: string): Promise<{ proposals: LearningProjectApplication[] }> {
  return request<{ proposals: LearningProjectApplication[] }>(`/api/user/learning/goals/${encodeURIComponent(goalId)}/project-proposals`);
}

export async function createLearningProjectApplication(goalId: string, input: { projectId: string; proposal: LearningProjectApplication['proposal']; learningEvidenceRefs: string[]; requiredPermissions: string[]; actorAssignments: LearningProjectApplication['actorAssignments'] }): Promise<{ proposal: LearningProjectApplication; created: boolean }> {
  return request<{ proposal: LearningProjectApplication; created: boolean }>(`/api/user/learning/goals/${encodeURIComponent(goalId)}/project-proposals`, { method: 'POST', body: JSON.stringify(input) });
}

export async function acceptLearningProjectApplication(goalId: string, proposalId: string): Promise<{ proposal: LearningProjectApplication; link: LearningLink; workRequest: ProjectWorkRequest }> {
  return request<{ proposal: LearningProjectApplication; link: LearningLink; workRequest: ProjectWorkRequest }>(`/api/user/learning/goals/${encodeURIComponent(goalId)}/project-proposals/${encodeURIComponent(proposalId)}/accept`, { method: 'POST', body: '{}' });
}

export async function listLearningReports(goalId: string): Promise<{ reports: LearningReport[] }> {
  return request<{ reports: LearningReport[] }>(`/api/user/learning/goals/${encodeURIComponent(goalId)}/reports`);
}

export async function createLearningReport(goalId: string, period: LearningReport['period']): Promise<{ report: LearningReport; created: boolean }> {
  return request<{ report: LearningReport; created: boolean }>(`/api/user/learning/goals/${encodeURIComponent(goalId)}/reports`, { method: 'POST', body: JSON.stringify({ period }) });
}

export async function createLearningPlanPreview(goalId: string, expectedRevision?: number): Promise<LearningPlanPreview> {
  return request<LearningPlanPreview>(`/api/user/learning/goals/${encodeURIComponent(goalId)}/plan-preview`, { method: 'POST', body: JSON.stringify(expectedRevision === undefined ? {} : { expectedRevision }) });
}

export async function createLearningPlanAdjustment(goalId: string, input: { basePlanVersionId: string; expectedGoalRevision?: number; reason: LearningPlanAdjustment['reason']; dailyMinutes?: number; durationDays?: number; note?: string }): Promise<{ adjustment: LearningPlanAdjustment }> {
  return request<{ adjustment: LearningPlanAdjustment }>(`/api/user/learning/goals/${encodeURIComponent(goalId)}/adjustment-preview`, { method: 'POST', body: JSON.stringify(input) });
}

export async function listLearningPlanAdjustments(goalId: string): Promise<{ adjustments: LearningPlanAdjustment[] }> {
  return request<{ adjustments: LearningPlanAdjustment[] }>(`/api/user/learning/goals/${encodeURIComponent(goalId)}/adjustments`);
}

export async function acceptLearningPlanAdjustment(goalId: string, adjustmentId: string): Promise<{ adjustment: LearningPlanAdjustment; goal: LearningGoal; plan?: LearningPlanVersion }> {
  return request<{ adjustment: LearningPlanAdjustment; goal: LearningGoal; plan?: LearningPlanVersion }>(`/api/user/learning/goals/${encodeURIComponent(goalId)}/adjustments/${encodeURIComponent(adjustmentId)}/accept`, { method: 'POST', body: '{}' });
}

export async function listLearningPlanVersions(goalId: string): Promise<{ plans: LearningPlanVersion[] }> {
  return request<{ plans: LearningPlanVersion[] }>(`/api/user/learning/goals/${encodeURIComponent(goalId)}/plans`);
}

export async function getLearningGoalProgress(goalId: string): Promise<{ progress: LearningProgress }> {
  return request<{ progress: LearningProgress }>(`/api/user/learning/goals/${encodeURIComponent(goalId)}/progress`);
}

export async function getLearningGoalToday(goalId: string): Promise<{ today: LearningToday }> {
  return request<{ today: LearningToday }>(`/api/user/learning/goals/${encodeURIComponent(goalId)}/today`);
}

export async function startLearningGoalSession(goalId: string, input: { planVersionId: string; dayId: string; expectedRevision?: number }): Promise<{ session: LearningSession }> {
  return request<{ session: LearningSession }>(`/api/user/learning/goals/${encodeURIComponent(goalId)}/start`, { method: 'POST', body: JSON.stringify(input) });
}

export async function createLearningPlan(input: { title: string; description: string; goals: string[] }): Promise<{ plan: LearningPlan }> {
  return request<{ plan: LearningPlan }>('/api/user/learning/plans', { method: 'POST', body: JSON.stringify(input) });
}

export async function startLearningSession(planId: string): Promise<{ session: LearningSession }> {
  return request<{ session: LearningSession }>('/api/user/learning/sessions', { method: 'POST', body: JSON.stringify({ planId }) });
}

export async function listLearningSessions(): Promise<{ sessions: LearningSession[] }> {
  return request<{ sessions: LearningSession[] }>('/api/user/learning/sessions');
}

export async function resumeLearningSession(sessionId: string, expectedRevision?: number): Promise<{ session: LearningSession }> {
  const query = expectedRevision === undefined ? '' : `?expectedRevision=${encodeURIComponent(String(expectedRevision))}`;
  return request<{ session: LearningSession }>(`/api/user/learning/sessions/${encodeURIComponent(sessionId)}${query}`);
}
export async function completeLearningSession(sessionId: string, expectedRevision?: number): Promise<{ session: LearningSession }> {
  return request<{ session: LearningSession }>(`/api/user/learning/sessions/${encodeURIComponent(sessionId)}/complete`, { method: 'POST', body: JSON.stringify(expectedRevision === undefined ? {} : { expectedRevision }) });
}

export async function requestLearningSessionContent(sessionId: string): Promise<{ request: LearningContentRequest }> {
  return request<{ request: LearningContentRequest }>(`/api/user/learning/sessions/${encodeURIComponent(sessionId)}/content`, { method: 'POST', body: '{}' });
}

export async function getLearningSessionContent(sessionId: string): Promise<{ request: LearningContentRequest }> {
  return request<{ request: LearningContentRequest }>(`/api/user/learning/sessions/${encodeURIComponent(sessionId)}/content`);
}

export async function recordLearningSessionAction(sessionId: string, input: { actionId: string; type: LearningSessionAction['type']; contentRef?: string; question?: string }): Promise<{ action: LearningSessionAction }> {
  return request<{ action: LearningSessionAction }>(`/api/user/learning/sessions/${encodeURIComponent(sessionId)}/actions`, { method: 'POST', body: JSON.stringify(input) });
}

export async function listLearningSessionActions(sessionId: string): Promise<{ actions: LearningSessionAction[] }> {
  return request<{ actions: LearningSessionAction[] }>(`/api/user/learning/sessions/${encodeURIComponent(sessionId)}/actions`);
}

export async function submitLearningAnswer(sessionId: string, input: { exerciseId: string; attemptId: string; response: string; artifactRefs?: string[] }): Promise<{ answer: LearningAnswerReceipt }> {
  return request<{ answer: LearningAnswerReceipt }>(`/api/user/learning/sessions/${encodeURIComponent(sessionId)}/answers`, { method: 'POST', body: JSON.stringify(input) });
}

export async function listLearningAnswers(sessionId: string): Promise<{ answers: LearningAnswerReceipt[] }> {
  return request<{ answers: LearningAnswerReceipt[] }>(`/api/user/learning/sessions/${encodeURIComponent(sessionId)}/answers`);
}

export async function getLearningAnswerFeedback(answerId: string): Promise<{ feedback: LearningFeedback }> {
  return request<{ feedback: LearningFeedback }>(`/api/user/learning/answers/${encodeURIComponent(answerId)}/feedback`);
}

export async function disputeLearningFeedback(feedbackId: string, input: { reason: string }): Promise<{ dispute: LearningFeedbackDispute; feedback: LearningFeedback; answer: LearningAnswerReceipt }> {
  return request<{ dispute: LearningFeedbackDispute; feedback: LearningFeedback; answer: LearningAnswerReceipt }>(`/api/user/learning/feedback/${encodeURIComponent(feedbackId)}/disputes`, { method: 'POST', body: JSON.stringify(input) });
}

export async function listStudyAttempts(sessionId: string): Promise<{ attempts: StudyAttempt[] }> {
  return request<{ attempts: StudyAttempt[] }>(`/api/user/learning/sessions/${encodeURIComponent(sessionId)}/attempts`);
}

export async function recordStudyAttempt(input: { sessionId: string; questionId: string; answer: string; correct?: boolean }): Promise<{ attempt: StudyAttempt }> {
  return request<{ attempt: StudyAttempt }>('/api/user/learning/attempts', { method: 'POST', body: JSON.stringify(input) });
}

export async function listDueReviewItems(at?: string): Promise<{ items: ReviewItem[] }> {
  const query = at ? `?at=${encodeURIComponent(at)}` : '';
  return request<{ items: ReviewItem[] }>(`/api/user/learning/reviews${query}`);
}

export async function createReviewItem(input: { sourceType: string; sourceId: string; prompt: string; answer: string; dueAt?: string }): Promise<{ item: ReviewItem }> {
  return request<{ item: ReviewItem }>('/api/user/learning/reviews', { method: 'POST', body: JSON.stringify(input) });
}

export async function reviewItem(itemId: string, quality: number): Promise<{ item: ReviewItem }> {
  return request<{ item: ReviewItem }>(`/api/user/learning/reviews/${encodeURIComponent(itemId)}`, { method: 'POST', body: JSON.stringify({ quality }) });
}

export async function analyzeCodeForLearning(input: { sourceType: string; sourceId: string; language: string; code: string }): Promise<{ result: CodeAnalysisResult }> {
  return request<{ result: CodeAnalysisResult }>('/api/user/learning/analyze', { method: 'POST', body: JSON.stringify(input) });
}

export async function listCodingExercises(sessionId?: string): Promise<{ exercises: CodingExercise[] }> {
  const query = sessionId ? `?sessionId=${encodeURIComponent(sessionId)}` : '';
  return request<{ exercises: CodingExercise[] }>(`/api/user/learning/coding-exercises${query}`);
}

export async function createCodingExercise(input: { sessionId?: string; title: string; prompt: string; language: string; estimatedMinutes: number }): Promise<{ exercise: CodingExercise }> {
  return request<{ exercise: CodingExercise }>('/api/user/learning/coding-exercises', { method: 'POST', body: JSON.stringify(input) });
}

export async function listCodingAttempts(exerciseId: string): Promise<{ attempts: CodingAttempt[] }> {
  return request<{ attempts: CodingAttempt[] }>(`/api/user/learning/coding-exercises/${encodeURIComponent(exerciseId)}/attempts`);
}

export async function submitCodingAttempt(exerciseId: string, input: { clientRequestId: string; response: string }): Promise<{ attempt: CodingAttempt; created: boolean }> {
  return request<{ attempt: CodingAttempt; created: boolean }>(`/api/user/learning/coding-exercises/${encodeURIComponent(exerciseId)}/attempts`, { method: 'POST', body: JSON.stringify(input) });
}

export async function listUserProjects(): Promise<{ projects: UserProject[] }> {
  return request<{ projects: UserProject[] }>('/api/user/projects');
}

export async function createUserProject(input: { name: string; objective: string; purpose: string; teamMode: UserProject['teamMode']; teamId?: string }): Promise<{ project: UserProject }> {
  return request<{ project: UserProject }>('/api/user/projects', { method: 'POST', body: JSON.stringify(input) });
}

export async function getUserProject(projectId: string): Promise<UserProjectView> {
  return request<UserProjectView>(`/api/user/projects/${encodeURIComponent(projectId)}`);
}
export async function getUserProjectFile(projectId: string, path: string): Promise<UserProjectWorkspaceFilePreview> {
  return request<UserProjectWorkspaceFilePreview>(`/api/user/projects/${encodeURIComponent(projectId)}/files?path=${encodeURIComponent(path)}`);
}
export async function updateUserProjectTeam(projectId: string, input: { teamMode: UserProject['teamMode']; teamId?: string }): Promise<{ project: UserProject }> { return request<{ project: UserProject }>(`/api/user/projects/${encodeURIComponent(projectId)}/team`, { method: 'PATCH', body: JSON.stringify(input) }); }

export async function createProjectWorkRequest(projectId: string, input: { title: string; objective: string; idempotencyKey: string; dependencies?: string[] }): Promise<{ request: ProjectWorkRequest; created: boolean }> {
  return request<{ request: ProjectWorkRequest; created: boolean }>(`/api/user/projects/${encodeURIComponent(projectId)}/work-requests`, { method: 'POST', body: JSON.stringify(input) });
}
export async function cancelProjectWorkRequest(projectId: string, workRequestId: string): Promise<{ request: ProjectWorkRequest }> {
  return request<{ request: ProjectWorkRequest }>(`/api/user/projects/${encodeURIComponent(projectId)}/work-requests/${encodeURIComponent(workRequestId)}/cancel`, { method: 'POST', body: '{}' });
}
export async function listAiTeamProposals(projectId: string): Promise<{ proposals: AiTeamProposal[] }> { return request<{ proposals: AiTeamProposal[] }>(`/api/user/projects/${encodeURIComponent(projectId)}/ai-proposals`); }
export async function requestAiTeamProposal(projectId: string, input: { agentId: string; requestId: string }): Promise<{ proposal: AiTeamProposal }> { return request<{ proposal: AiTeamProposal }>(`/api/user/projects/${encodeURIComponent(projectId)}/ai-proposals`, { method: 'POST', body: JSON.stringify(input) }); }
export async function acceptAiTeamProposal(projectId: string, proposalId: string): Promise<{ proposal: AiTeamProposal; workRequest: ProjectWorkRequest }> { return request<{ proposal: AiTeamProposal; workRequest: ProjectWorkRequest }>(`/api/user/projects/${encodeURIComponent(projectId)}/ai-proposals/${encodeURIComponent(proposalId)}/accept`, { method: 'POST', body: '{}' }); }
export async function rejectAiTeamProposal(projectId: string, proposalId: string): Promise<{ proposal: AiTeamProposal }> { return request<{ proposal: AiTeamProposal }>(`/api/user/projects/${encodeURIComponent(projectId)}/ai-proposals/${encodeURIComponent(proposalId)}/reject`, { method: 'POST', body: '{}' }); }
export async function listAiTeamDiscussions(projectId: string): Promise<{ discussions: AiTeamDiscussion[] }> { return request<{ discussions: AiTeamDiscussion[] }>(`/api/user/projects/${encodeURIComponent(projectId)}/ai-discussions`); }
export async function requestAiTeamDiscussion(projectId: string, input: { agentId: string; requestId: string; question: string }): Promise<{ discussion: AiTeamDiscussion }> { return request<{ discussion: AiTeamDiscussion }>(`/api/user/projects/${encodeURIComponent(projectId)}/ai-discussions`, { method: 'POST', body: JSON.stringify(input) }); }

export async function startUserProjectRun(projectId: string, input: { workRequestId: string; runId: string; approved?: boolean }): Promise<{ status: string; request: ProjectWorkRequest; runId?: string; blocker?: string }> {
  return request<{ status: string; request: ProjectWorkRequest; runId?: string; blocker?: string }>(`/api/user/projects/${encodeURIComponent(projectId)}/runs`, { method: 'POST', body: JSON.stringify(input) });
}
export async function scheduleUserProjectRuns(projectId: string, input: { maxConcurrent?: number; approved?: boolean }): Promise<{ selected: number; maxConcurrent: number; results: Array<{ status: string; request: ProjectWorkRequest; runId?: string; blocker?: string }> }> {
  return request<{ selected: number; maxConcurrent: number; results: Array<{ status: string; request: ProjectWorkRequest; runId?: string; blocker?: string }> }>(`/api/user/projects/${encodeURIComponent(projectId)}/schedule`, { method: 'POST', body: JSON.stringify(input) });
}
export async function resumeUserProjectRun(projectId: string, input: { workRequestId: string; approved?: boolean }): Promise<{ status: string; request: ProjectWorkRequest; runId?: string; blocker?: string }> {
  return request<{ status: string; request: ProjectWorkRequest; runId?: string; blocker?: string }>(`/api/user/projects/${encodeURIComponent(projectId)}/runs/resume`, { method: 'POST', body: JSON.stringify(input) });
}
export async function pauseUserProjectRun(projectId: string, input: { workRequestId: string }): Promise<{ status: string; request: ProjectWorkRequest; runId?: string; blocker?: string }> {
  return request<{ status: string; request: ProjectWorkRequest; runId?: string; blocker?: string }>(`/api/user/projects/${encodeURIComponent(projectId)}/runs/pause`, { method: 'POST', body: JSON.stringify(input) });
}
export async function retryUserProjectRun(projectId: string, input: { workRequestId: string; approved?: boolean }): Promise<{ status: string; request: ProjectWorkRequest; runId?: string; blocker?: string }> {
  return request<{ status: string; request: ProjectWorkRequest; runId?: string; blocker?: string }>(`/api/user/projects/${encodeURIComponent(projectId)}/runs/retry`, { method: 'POST', body: JSON.stringify(input) });
}

export async function listTeams(): Promise<{ teams: TeamRecord[] }> { return request<{ teams: TeamRecord[] }>('/api/user/teams'); }
export async function createTeam(input: { name: string; description: string; kind: TeamRecord['kind']; visibility: TeamRecord['visibility']; capacity: number }): Promise<{ team: TeamRecord }> { return request<{ team: TeamRecord }>('/api/user/teams', { method: 'POST', body: JSON.stringify(input) }); }
export async function getTeam(teamId: string): Promise<{ team: TeamRecord; members: TeamMembership[] }> { return request<{ team: TeamRecord; members: TeamMembership[] }>(`/api/user/teams/${encodeURIComponent(teamId)}`); }
export async function leaveTeam(teamId: string): Promise<{ membership: TeamMembership }> { return request<{ membership: TeamMembership }>(`/api/user/teams/${encodeURIComponent(teamId)}/leave`, { method: 'POST', body: '{}' }); }
export async function listTeamMessages(teamId: string): Promise<{ messages: TeamMessage[] }> { return request<{ messages: TeamMessage[] }>(`/api/user/teams/${encodeURIComponent(teamId)}/messages`); }
export async function sendTeamMessage(teamId: string, body: string): Promise<{ message: TeamMessage }> { return request<{ message: TeamMessage }>(`/api/user/teams/${encodeURIComponent(teamId)}/messages`, { method: 'POST', body: JSON.stringify({ body }) }); }
export async function listUserNotifications(unreadOnly = false): Promise<{ notifications: UserNotification[]; unreadCount: number }> { return request<{ notifications: UserNotification[]; unreadCount: number }>(`/api/user/notifications${unreadOnly ? '?unreadOnly=1' : ''}`); }
export async function markUserNotificationRead(notificationId: string): Promise<{ notification: UserNotification }> { return request<{ notification: UserNotification }>(`/api/user/notifications/${encodeURIComponent(notificationId)}/read`, { method: 'POST', body: '{}' }); }
export function openUserNotificationStream(onChange: (event: UserNotificationStreamEvent) => void, onReconnect?: () => void): () => void {
  let stopped = false;
  let controller: AbortController | undefined;
  let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
  let connectionCount = 0;
  let reconnectAttempt = 0;
  let lastEventId: string | undefined;
  const token = sessionToken();
  if (!token) return () => { stopped = true; };

  const scheduleReconnect = () => {
    if (stopped || reconnectTimer) return;
    const delay = Math.min(1_000, 50 * (2 ** Math.min(reconnectAttempt, 4)));
    reconnectAttempt += 1;
    reconnectTimer = setTimeout(() => {
      reconnectTimer = undefined;
      void connect();
    }, delay);
  };

  const connect = async (): Promise<void> => {
    if (stopped) return;
    controller = new AbortController();
    try {
      const headers: Record<string, string> = { authorization: `Bearer ${token}` };
      if (lastEventId) headers['last-event-id'] = lastEventId;
      const response = await fetch('/api/user/notifications/stream', { headers, signal: controller.signal });
      if (!response.ok || !response.body) {
        scheduleReconnect();
        return;
      }
      connectionCount += 1;
      if (connectionCount > 1) {
        reconnectAttempt = 0;
        try { onReconnect?.(); } catch { /* refresh callbacks must not stop stream recovery */ }
      }
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      while (!stopped) {
        const next = await reader.read();
        if (next.done) break;
        buffer += decoder.decode(next.value, { stream: true });
        const frames = buffer.split(/\r?\n\r?\n/);
        buffer = frames.pop() ?? '';
        for (const frame of frames) {
          const eventName = frame.match(/^event:\s*(.+)$/m)?.[1]?.trim();
          const data = frame.match(/^data:\s*(.+)$/m)?.[1]?.trim();
          if (eventName !== 'user.notification.changed' || !data) continue;
          try {
            const event = JSON.parse(data) as UserNotificationStreamEvent;
            if (event.id) lastEventId = event.id;
            onChange(event);
          } catch { /* malformed refresh signals are ignored; REST remains canonical */ }
        }
      }
    } catch {
      // A disconnected stream never replaces the durable REST snapshot.
    }
    scheduleReconnect();
  };

  void connect();
  return () => {
    stopped = true;
    if (reconnectTimer) clearTimeout(reconnectTimer);
    reconnectTimer = undefined;
    controller?.abort();
  };
}
export async function addAiTeamMember(teamId: string, input: { agentId: string; assignmentRole: string; capabilities: TeamMembership['capabilities']; approvalScope: TeamMembership['approvalScope'] }): Promise<{ member: TeamMembership }> { return request<{ member: TeamMembership }>(`/api/user/teams/${encodeURIComponent(teamId)}/ai-members`, { method: 'POST', body: JSON.stringify(input) }); }
    export async function removeAiTeamMember(teamId: string, agentId: string): Promise<{ member: TeamMembership }> { return request<{ member: TeamMembership }>(`/api/user/teams/${encodeURIComponent(teamId)}/ai-members/${encodeURIComponent(agentId)}`, { method: 'DELETE' }); }
    export async function listStudySpaces(): Promise<{ studies: StudySpace[] }> { return request<{ studies: StudySpace[] }>('/api/user/studies'); }
    export async function createStudySpace(input: { teamId: string; title: string; description: string }): Promise<{ space: StudySpace }> { return request<{ space: StudySpace }>('/api/user/studies', { method: 'POST', body: JSON.stringify(input) }); }
    export async function getStudySpace(studySpaceId: string): Promise<StudySpaceView> { return request<StudySpaceView>(`/api/user/studies/${encodeURIComponent(studySpaceId)}`); }
    export async function addStudyCurriculumLink(studySpaceId: string, input: { kind: StudyCurriculumLink['kind']; referenceId: string; label: string }): Promise<{ link: StudyCurriculumLink }> { return request<{ link: StudyCurriculumLink }>(`/api/user/studies/${encodeURIComponent(studySpaceId)}/curriculum-links`, { method: 'POST', body: JSON.stringify(input) }); }
    export async function createStudyTask(studySpaceId: string, input: { title: string; instructions: string; dueLocalDate?: string }): Promise<{ task: StudyTask }> { return request<{ task: StudyTask }>(`/api/user/studies/${encodeURIComponent(studySpaceId)}/tasks`, { method: 'POST', body: JSON.stringify(input) }); }
    export async function saveStudyTaskSubmission(studySpaceId: string, taskId: string, input: { answer: string; status: StudyTaskSubmission['status'] }): Promise<{ submission: StudyTaskSubmission }> { return request<{ submission: StudyTaskSubmission }>(`/api/user/studies/${encodeURIComponent(studySpaceId)}/tasks/${encodeURIComponent(taskId)}/submissions`, { method: 'PUT', body: JSON.stringify(input) }); }
    export async function listRecruitmentPosts(kind?: RecruitmentPost['kind']): Promise<{ posts: RecruitmentPost[] }> { return request<{ posts: RecruitmentPost[] }>(`/api/user/recruitment${kind ? `?kind=${encodeURIComponent(kind)}` : ''}`); }
export async function createRecruitmentPost(input: { teamId: string; kind: RecruitmentPost['kind']; title: string; description: string; roles: string[]; tags: string[] }): Promise<{ post: RecruitmentPost }> { return request<{ post: RecruitmentPost }>('/api/user/recruitment', { method: 'POST', body: JSON.stringify(input) }); }
export async function getRecruitmentPost(postId: string): Promise<{ post: RecruitmentPost; applications: RecruitmentApplication[] }> { return request<{ post: RecruitmentPost; applications: RecruitmentApplication[] }>(`/api/user/recruitment/${encodeURIComponent(postId)}`); }
export async function applyToRecruitment(postId: string, message: string): Promise<{ application: RecruitmentApplication }> { return request<{ application: RecruitmentApplication }>(`/api/user/recruitment/${encodeURIComponent(postId)}/applications`, { method: 'POST', body: JSON.stringify({ message }) }); }
export async function reviewRecruitmentApplication(applicationId: string, action: 'accept' | 'reject'): Promise<{ application: RecruitmentApplication }> { return request<{ application: RecruitmentApplication }>(`/api/user/recruitment/applications/${encodeURIComponent(applicationId)}`, { method: 'POST', body: JSON.stringify({ action }) }); }
export async function listProfiles(search?: string): Promise<{ profiles: PublicProfile[] }> { return request<{ profiles: PublicProfile[] }>(`/api/user/social/users${search ? `?search=${encodeURIComponent(search)}` : ''}`); }
export async function getProfile(userId?: string): Promise<{ profile: PublicProfile | null }> { return request<{ profile: PublicProfile | null }>(`/api/user/social/profile${userId ? `?userId=${encodeURIComponent(userId)}` : ''}`); }
export async function updateProfile(input: { handle?: string; bio?: string; skills?: string[]; visibility?: PublicProfile['visibility'] }): Promise<{ profile: PublicProfile }> { return request<{ profile: PublicProfile }>('/api/user/social/profile', { method: 'PUT', body: JSON.stringify(input) }); }
export async function listFriends(): Promise<{ friends: PublicProfile[] }> { return request<{ friends: PublicProfile[] }>('/api/user/social/friends'); }
export async function listFriendRequests(): Promise<{ requests: FriendRequest[] }> { return request<{ requests: FriendRequest[] }>('/api/user/social/friend-requests'); }
export async function createFriendRequest(targetUserId: string): Promise<{ request: FriendRequest; created: boolean }> { return request<{ request: FriendRequest; created: boolean }>('/api/user/social/friend-requests', { method: 'POST', body: JSON.stringify({ targetUserId }) }); }
export async function respondToFriendRequest(requestId: string, action: 'accept' | 'reject'): Promise<{ request: FriendRequest }> { return request<{ request: FriendRequest }>(`/api/user/social/friend-requests/${encodeURIComponent(requestId)}`, { method: 'POST', body: JSON.stringify({ action }) }); }
export async function listDirectMessages(userId: string): Promise<{ messages: DirectMessage[] }> { return request<{ messages: DirectMessage[] }>(`/api/user/social/messages?userId=${encodeURIComponent(userId)}`); }
export async function sendDirectMessage(userId: string, body: string): Promise<{ message: DirectMessage }> { return request<{ message: DirectMessage }>(`/api/user/social/messages?userId=${encodeURIComponent(userId)}`, { method: 'POST', body: JSON.stringify({ body }) }); }
export async function listBlocks(): Promise<{ blocks: SocialBlock[] }> { return request<{ blocks: SocialBlock[] }>('/api/user/social/blocks'); }
export async function blockUser(targetUserId: string): Promise<{ block: SocialBlock }> { return request<{ block: SocialBlock }>('/api/user/social/blocks', { method: 'POST', body: JSON.stringify({ targetUserId }) }); }
export async function unblockUser(targetUserId: string): Promise<{ block: SocialBlock }> { return request<{ block: SocialBlock }>(`/api/user/social/blocks/${encodeURIComponent(targetUserId)}`, { method: 'DELETE' }); }
export async function reportUser(targetUserId: string, reason: string): Promise<{ report: SocialReport }> { return request<{ report: SocialReport }>('/api/user/social/reports', { method: 'POST', body: JSON.stringify({ targetUserId, reason }) }); }
export async function listReports(): Promise<{ reports: SocialReport[] }> { return request<{ reports: SocialReport[] }>('/api/user/social/reports'); }
export async function getPortfolio(): Promise<PortfolioSnapshot> { return request<PortfolioSnapshot>('/api/user/portfolio'); }
export async function createPortfolioEntry(input: { title: string; summary: string; visibility: PortfolioEntry['visibility']; evidenceIds: string[] }): Promise<{ entry: PortfolioEntry }> { return request<{ entry: PortfolioEntry }>('/api/user/portfolio', { method: 'POST', body: JSON.stringify(input) }); }
export async function updatePortfolioEntry(entryId: string, patch: Partial<Pick<PortfolioEntry, 'title' | 'summary' | 'visibility' | 'evidenceIds'>>): Promise<{ entry: PortfolioEntry }> { return request<{ entry: PortfolioEntry }>(`/api/user/portfolio/${encodeURIComponent(entryId)}`, { method: 'PATCH', body: JSON.stringify(patch) }); }
export async function exportPortfolio(format: 'json' | 'markdown'): Promise<{ format: 'json' | 'markdown'; filename: string; content: string }> { return request<{ format: 'json' | 'markdown'; filename: string; content: string }>(`/api/user/portfolio/export?format=${format}`); }
export async function getPublicPortfolioEntry(entryId: string): Promise<PublicPortfolioView> { return request<PublicPortfolioView>(`/api/public/portfolio/${encodeURIComponent(entryId)}`, {}, false); }
export async function listAiChatConversations(): Promise<{ conversations: AiChatConversation[] }> { return request<{ conversations: AiChatConversation[] }>('/api/user/ai-chat/conversations'); }
export async function createAiChatConversation(title?: string): Promise<{ conversation: AiChatConversation }> { return request<{ conversation: AiChatConversation }>('/api/user/ai-chat/conversations', { method: 'POST', body: JSON.stringify(title ? { title } : {}) }); }
export async function getAiChatConversation(conversationId: string): Promise<{ conversation: AiChatConversation }> { return request<{ conversation: AiChatConversation }>(`/api/user/ai-chat/conversations/${encodeURIComponent(conversationId)}`); }
export async function sendAiChatMessage(conversationId: string, content: string, options?: { projectId?: string; contextSelection?: AiChatContextSelection; attachments?: AiChatAttachmentInput[] }): Promise<{ conversation: AiChatConversation; runtimeStatus: 'waiting_runtime' | 'completed' }> { return request<{ conversation: AiChatConversation; runtimeStatus: 'waiting_runtime' | 'completed' }>(`/api/user/ai-chat/conversations/${encodeURIComponent(conversationId)}/messages`, { method: 'POST', body: JSON.stringify({ content, ...(options?.projectId ? { projectId: options.projectId } : {}), ...(options?.contextSelection ? { contextSelection: options.contextSelection } : {}), ...(options?.attachments?.length ? { attachments: options.attachments } : {}) }) }); }
export async function approveAiChatExecutionPlan(conversationId: string, messageId: string): Promise<{ conversation: AiChatConversation }> { return request<{ conversation: AiChatConversation }>(`/api/user/ai-chat/conversations/${encodeURIComponent(conversationId)}/execution-plans/${encodeURIComponent(messageId)}/approve`, { method: 'POST', body: '{}' }); }
export async function rejectAiChatExecutionPlan(conversationId: string, messageId: string): Promise<{ conversation: AiChatConversation }> { return request<{ conversation: AiChatConversation }>(`/api/user/ai-chat/conversations/${encodeURIComponent(conversationId)}/execution-plans/${encodeURIComponent(messageId)}/reject`, { method: 'POST', body: '{}' }); }
export async function createAiChatExecutionPlanWorkRequest(conversationId: string, messageId: string): Promise<{ conversation: AiChatConversation; workRequest: ProjectWorkRequest; created: boolean }> { return request<{ conversation: AiChatConversation; workRequest: ProjectWorkRequest; created: boolean }>(`/api/user/ai-chat/conversations/${encodeURIComponent(conversationId)}/execution-plans/${encodeURIComponent(messageId)}/work-requests`, { method: 'POST', body: '{}' }); }
export async function listCommunityPosts(category?: CommunityPost['category']): Promise<{ posts: CommunityPost[] }> { return request<{ posts: CommunityPost[] }>(`/api/user/community${category ? `?category=${encodeURIComponent(category)}` : ''}`); }
export async function createCommunityPost(input: { category: CommunityPost['category']; title: string; content: string; tags: string[] }): Promise<{ post: CommunityPost }> { return request<{ post: CommunityPost }>('/api/user/community', { method: 'POST', body: JSON.stringify(input) }); }
export async function listCommunityComments(postId: string): Promise<{ comments: CommunityComment[] }> { return request<{ comments: CommunityComment[] }>(`/api/user/community/${encodeURIComponent(postId)}/comments`); }
    export async function createCommunityComment(postId: string, content: string): Promise<{ comment: CommunityComment }> { return request<{ comment: CommunityComment }>(`/api/user/community/${encodeURIComponent(postId)}/comments`, { method: 'POST', body: JSON.stringify({ content }) }); }
    export async function reportCommunityContent(postId: string, input: { targetType: 'post' | 'comment'; targetId: string; reason: string }): Promise<{ report: { id: string; targetType: 'post' | 'comment'; targetId: string; postId: string; status: 'open' | 'closed'; createdAt: string } }> { return request<{ report: { id: string; targetType: 'post' | 'comment'; targetId: string; postId: string; status: 'open' | 'closed'; createdAt: string } }>(`/api/user/community/${encodeURIComponent(postId)}/report`, { method: 'POST', body: JSON.stringify(input) }); }
    export async function toggleCommunityLike(postId: string): Promise<{ liked: boolean; likeCount: number }> { return request<{ liked: boolean; likeCount: number }>(`/api/user/community/${encodeURIComponent(postId)}/like`, { method: 'POST' }); }
export async function getSettings(): Promise<{ settings: UserSettings }> { return request<{ settings: UserSettings }>('/api/user/settings'); }
export async function updateSettings(patch: { aiAccess?: Partial<UserSettings['aiAccess']>; aiApproval?: Partial<UserSettings['aiApproval']>; notifications?: Partial<UserSettings['notifications']>; privacy?: Partial<UserSettings['privacy']>; integrations?: Partial<UserSettings['integrations']> }): Promise<{ settings: UserSettings }> { return request<{ settings: UserSettings }>('/api/user/settings', { method: 'PATCH', body: JSON.stringify(patch) }); }
export async function getUserIntegrations(): Promise<{ integrations: UserIntegration[] }> { return request<{ integrations: UserIntegration[] }>('/api/user/integrations'); }
export async function getRuntimeStatus(): Promise<{ runtime: UserRuntimeStatus }> { return request<{ runtime: UserRuntimeStatus }>('/api/user/runtime-status'); }
export async function exportActivity(format: ActivityExport['format']): Promise<ActivityExport> { return request<ActivityExport>(`/api/user/activity/export?format=${encodeURIComponent(format)}`); }
