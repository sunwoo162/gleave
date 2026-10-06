import { useCallback, useEffect, useState } from 'react';
import { AppShell } from '../components/Navigation';
import { Btn, SectionHeader, StatusBadge } from '../components/UI';
import {
  analyzeCodeForLearning,
  createPortfolioEntry,
  acceptLearningProjectApplication,
  createLearningProjectApplication,
  completeLearningSession,
  createCodingExercise,
  createLearningGoal,
  createLearningPlanPreview,
  createLearningPlanAdjustment,
  createLearningReport,
  listLearningPlanAdjustments,
  listLearningProjectApplications,
  listLearningReports,
  acceptLearningPlanAdjustment,
  createLearningPlan,
  createReviewItem,
  getLearningGoalProgress,
  getLearningGoalToday,
  listDueReviewItems,
  listLearningPlans,
  listLearningSessions,
  listCodingExercises,
  listCodingAttempts,
  listLearningGoals,
  listUserProjects,
  getPortfolio,
  listStudyAttempts,
  getLearningSessionContent,
  recordLearningSessionAction,
  listLearningSessionActions,
  listLearningAnswers,
  requestLearningSessionContent,
  recordStudyAttempt,
  reviewItem,
  resumeLearningSession,
  startLearningSession,
  startLearningGoalSession,
  submitLearningAnswer,
  getLearningAnswerFeedback,
  disputeLearningFeedback,
  submitCodingAttempt,
  type CodeAnalysisResult,
  type CodingExercise,
  type CodingAttempt,
  type LearningGoal,
  type LearningContentRequest,
  type LearningFeedback,
  type LearningPlanPreview,
  type LearningPlanAdjustment,
  type LearningProjectApplication,
  type LearningReport,
  type LearningPlan,
  type LearningProgress,
  type LearningToday,
  type UserProject,
  type LearningSession,
  type LearningSessionAction,
  type ReviewItem,
  type StudyAttempt,
  UserApiError,
} from '../api/userApi';
import { userFacingError } from '../errorMessage';
import { useUser } from '../store/useUser';
import { formatWorldDateTime } from '../domain/worldState';

function formatDate(value: string, timezone?: string): string {
  return formatWorldDateTime(timezone, value);
}

function errorMessage(error: unknown): string {
  if (error instanceof UserApiError && error.status === 401) return '로그인이 필요합니다.';
  return userFacingError(error, '학습 데이터를 처리하지 못했습니다.');
}

function codingPracticeStatus(attempt: CodingAttempt | undefined): string {
  if (!attempt) return '답안 미제출';
  if (attempt.practiceResult.status === 'syntax-verified') return '구문 확인됨 · 정답/숙달 판정 아님';
  if (attempt.practiceResult.status === 'syntax-invalid') return '구문 오류 · 답안을 수정하세요';
  return '환경 필요 · 실행/채점 보류';
}

function LearningDashboard() {
  const profile = useUser();
  const timezone = profile.status === 'ready' ? profile.timezone : undefined;
  const [learningGoals, setLearningGoals] = useState<LearningGoal[]>([]);
  const [goalProgress, setGoalProgress] = useState<Record<string, LearningProgress>>({});
  const [goalToday, setGoalToday] = useState<Record<string, LearningToday>>({});
  const [goalPreviews, setGoalPreviews] = useState<Record<string, LearningPlanPreview>>({});
  const [goalAdjustments, setGoalAdjustments] = useState<Record<string, LearningPlanAdjustment[]>>({});
  const [projectApplications, setProjectApplications] = useState<Record<string, LearningProjectApplication[]>>({});
  const [learningReports, setLearningReports] = useState<Record<string, LearningReport[]>>({});
  const [projects, setProjects] = useState<UserProject[]>([]);
  const [projectTargetByGoal, setProjectTargetByGoal] = useState<Record<string, string>>({});
  const [plans, setPlans] = useState<LearningPlan[]>([]);
  const [dueItems, setDueItems] = useState<ReviewItem[]>([]);
  const [session, setSession] = useState<LearningSession | null>(null);
  const [contentRequest, setContentRequest] = useState<LearningContentRequest | null>(null);
  const [sessionActions, setSessionActions] = useState<LearningSessionAction[]>([]);
  const [actionNotice, setActionNotice] = useState<string | null>(null);
  const [answerFeedback, setAnswerFeedback] = useState<LearningFeedback | null>(null);
  const [disputeReason, setDisputeReason] = useState('');
  const [attempts, setAttempts] = useState<StudyAttempt[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [goals, setGoals] = useState('');
  const [questionId, setQuestionId] = useState('');
  const [answer, setAnswer] = useState('');
  const [correct, setCorrect] = useState(false);
  const [reviewPrompt, setReviewPrompt] = useState('');
  const [reviewAnswer, setReviewAnswer] = useState('');
  const [code, setCode] = useState('');
  const [analysis, setAnalysis] = useState<CodeAnalysisResult | null>(null);
  const [codingExercises, setCodingExercises] = useState<CodingExercise[]>([]);
  const [codingAttempts, setCodingAttempts] = useState<Record<string, CodingAttempt[]>>({});
  const [selectedCodingExerciseId, setSelectedCodingExerciseId] = useState<string | null>(null);
  const [codingTitle, setCodingTitle] = useState('');
  const [codingPrompt, setCodingPrompt] = useState('');
  const [codingLanguage, setCodingLanguage] = useState('typescript');
  const [codingMinutes, setCodingMinutes] = useState('15');
  const [codingResponse, setCodingResponse] = useState('');
  const [clientRequestId, setClientRequestId] = useState(() => `coding-${Date.now()}`);
  const [goalSubject, setGoalSubject] = useState('');
  const [goalDays, setGoalDays] = useState('14');
  const [goalMinutes, setGoalMinutes] = useState('30');
  const [adjustmentMinutes, setAdjustmentMinutes] = useState<Record<string, string>>({});
  const [actionQuestion, setActionQuestion] = useState('이 부분을 더 설명해 주세요.');
  const [reportFrom, setReportFrom] = useState(() => new Date(Date.now() - 6 * 86_400_000).toISOString().slice(0, 10));
  const [reportTo, setReportTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [reportKind, setReportKind] = useState<'weekly' | 'final'>('weekly');

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [{ plans: nextPlans }, { goals }, { items }, { sessions }, { exercises }, { projects: nextProjects }] = await Promise.all([listLearningPlans(), listLearningGoals(), listDueReviewItems(), listLearningSessions(), listCodingExercises(), listUserProjects()]);
      setPlans(nextPlans);
      setLearningGoals(goals);
      setProjects(nextProjects);
      const applicationResults = await Promise.all(goals.map(async (goal) => [goal.id, (await listLearningProjectApplications(goal.id)).proposals] as const));
      setProjectApplications(Object.fromEntries(applicationResults));
      const reportResults = await Promise.all(goals.map(async (goal) => [goal.id, (await listLearningReports(goal.id)).reports] as const));
      setLearningReports(Object.fromEntries(reportResults));
      const progressResults = await Promise.all(goals.map(async (goal) => {
        try { return [goal.id, (await getLearningGoalProgress(goal.id)).progress] as const; }
        catch (progressError) { if (progressError instanceof UserApiError && progressError.status === 404) return null; throw progressError; }
      }));
      setGoalProgress(Object.fromEntries(progressResults.filter((entry): entry is readonly [string, LearningProgress] => entry !== null)));
      const todayResults = await Promise.all(goals.map(async (goal) => {
        try { return [goal.id, (await getLearningGoalToday(goal.id)).today] as const; }
        catch (todayError) { if (todayError instanceof UserApiError && todayError.status === 404) return null; throw todayError; }
      }));
      setGoalToday(Object.fromEntries(todayResults.filter((entry): entry is readonly [string, LearningToday] => entry !== null)));
      setDueItems(items);
      setCodingExercises(exercises);
      const codingAttemptResults = await Promise.all(exercises.map(async (exercise) => [exercise.id, (await listCodingAttempts(exercise.id)).attempts] as const));
      setCodingAttempts(Object.fromEntries(codingAttemptResults));
      const candidate = sessions.find((nextSession) => nextSession.status === 'active') ?? sessions[0] ?? null;
      if (!candidate) {
        setSession(null);
        setContentRequest(null);
        setSessionActions([]);
        setAttempts([]);
        setSelectedCodingExerciseId(null);
        setCodingAttempts({});
        setAnswerFeedback(null);
      } else {
        const restored = candidate.status === 'active' ? (await resumeLearningSession(candidate.id, candidate.revision)).session : candidate;
        setSession(restored);
        if (restored.goalId) {
          try { setContentRequest((await getLearningSessionContent(restored.id)).request); }
          catch (contentError) { if (!(contentError instanceof UserApiError && contentError.status === 404)) throw contentError; setContentRequest(null); }
        } else setContentRequest(null);
        const [{ actions }, { attempts }, { answers }] = await Promise.all([
          listLearningSessionActions(restored.id),
          listStudyAttempts(restored.id),
          listLearningAnswers(restored.id),
        ]);
        setSessionActions(actions);
        setAttempts(attempts);
        const latestAnswer = answers[answers.length - 1];
        if (latestAnswer) {
          setSelectedCodingExerciseId(latestAnswer.exerciseId);
          try { setAnswerFeedback((await getLearningAnswerFeedback(latestAnswer.id)).feedback); }
          catch (feedbackError) {
            if (feedbackError instanceof UserApiError && feedbackError.status === 404) setAnswerFeedback(null);
            else throw feedbackError;
          }
        } else {
          setSelectedCodingExerciseId(null);
          setAnswerFeedback(null);
        }
      }
    } catch (nextError) {
      setError(errorMessage(nextError));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const createPlan = async () => {
    const parsedGoals = goals.split(/\r?\n|,/).map((goal) => goal.trim()).filter(Boolean);
    if (!title.trim() || !description.trim() || parsedGoals.length === 0) {
      setError('제목, 설명, 학습 목표를 모두 입력하세요.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await createLearningPlan({ title: title.trim(), description: description.trim(), goals: parsedGoals });
      setPlans((current) => [result.plan, ...current]);
      setTitle(''); setDescription(''); setGoals('');
    } catch (nextError) { setError(errorMessage(nextError)); }
    finally { setBusy(false); }
  };

  const createGoal = async () => {
    const days = Number(goalDays);
    const dailyMinutes = Number(goalMinutes);
    if (!goalSubject.trim() || !Number.isInteger(days) || days < 1 || days > 3650 || !Number.isInteger(dailyMinutes) || dailyMinutes < 1 || dailyMinutes > 1440) {
      setError('학습 분야, 기간(1~3650일), 하루 시간(1~1440분)을 확인하세요.');
      return;
    }
    setBusy(true); setError(null);
    try {
      const result = await createLearningGoal({ subjectText: goalSubject.trim(), duration: { days }, dailyMinutes });
      setLearningGoals((current) => [result.goal, ...current]);
      setGoalSubject('');
    } catch (nextError) { setError(errorMessage(nextError)); }
    finally { setBusy(false); }
  };

  const previewGoal = async (goal: LearningGoal) => {
    setBusy(true); setError(null);
    try {
      const preview = await createLearningPlanPreview(goal.id, goal.revision);
      setGoalPreviews((current) => ({ ...current, [goal.id]: preview }));
      const adjustmentList = await listLearningPlanAdjustments(goal.id);
      setGoalAdjustments((current) => ({ ...current, [goal.id]: adjustmentList.adjustments }));
      setLearningGoals((current) => current.map((candidate) => candidate.id === goal.id ? preview.goal : candidate));
      const progress = (await getLearningGoalProgress(goal.id)).progress;
      setGoalProgress((current) => ({ ...current, [goal.id]: progress }));
      const today = (await getLearningGoalToday(goal.id)).today;
      setGoalToday((current) => ({ ...current, [goal.id]: today }));
    } catch (nextError) { setError(errorMessage(nextError)); }
    finally { setBusy(false); }
  };

  const proposeAdjustment = async (goal: LearningGoal, preview: LearningPlanPreview) => {
    const dailyMinutes = Number(adjustmentMinutes[goal.id] ?? goal.input.dailyMinutes);
    if (!Number.isInteger(dailyMinutes) || dailyMinutes < 1 || dailyMinutes > 1440 || dailyMinutes === goal.input.dailyMinutes) {
      setError('기존 시간과 다른 재조정 시간을 입력하세요.');
      return;
    }
    setBusy(true); setError(null);
    try {
      const result = await createLearningPlanAdjustment(goal.id, { basePlanVersionId: preview.plan.id, expectedGoalRevision: goal.revision, reason: 'changed-time', dailyMinutes });
      setGoalAdjustments((current) => ({ ...current, [goal.id]: [result.adjustment, ...(current[goal.id] ?? []).filter((item) => item.id !== result.adjustment.id)] }));
    } catch (nextError) { setError(errorMessage(nextError)); }
    finally { setBusy(false); }
  };

  const acceptAdjustment = async (goal: LearningGoal, adjustment: LearningPlanAdjustment) => {
    setBusy(true); setError(null);
    try {
      const result = await acceptLearningPlanAdjustment(goal.id, adjustment.id);
      setLearningGoals((current) => current.map((candidate) => candidate.id === goal.id ? result.goal : candidate));
      setGoalAdjustments((current) => ({ ...current, [goal.id]: (current[goal.id] ?? []).map((item) => item.id === adjustment.id ? result.adjustment : item) }));
      const nextPlan = result.plan;
      if (nextPlan) setGoalPreviews((current) => { const existing = current[goal.id]; return existing ? { ...current, [goal.id]: { ...existing, goal: result.goal, plan: nextPlan, created: false } } : current; });
      setActionNotice('재조정안을 수락해 새 학습 계획 버전을 만들었습니다. 완료 기록은 이전 버전에 보존됩니다.');
    } catch (nextError) { setError(errorMessage(nextError)); }
    finally { setBusy(false); }
  };

  const createProjectApplication = async (goal: LearningGoal) => {
    const projectId = projectTargetByGoal[goal.id];
    if (!projectId) { setError('학습 내용을 적용할 프로젝트를 먼저 선택하세요.'); return; }
    setBusy(true); setError(null);
    try {
      const result = await createLearningProjectApplication(goal.id, {
        projectId,
        proposal: { title: `${goal.input.subjectText} 적용 작업`, objective: `학습한 ${goal.input.subjectText} 개념을 작은 프로젝트 초안으로 적용합니다.`, acceptanceCriteria: ['작업 범위와 완료 조건을 확인합니다.', '실행 결과를 주장하지 않고 검증 방법을 기록합니다.'], tests: ['사용자가 기존 프로젝트의 허용된 검증 방법을 확인합니다.'], estimatedEffort: Math.min(120, Math.max(15, goal.input.dailyMinutes)) },
        learningEvidenceRefs: [`goal:${goal.id}`],
        requiredPermissions: ['project.read', 'project.work-request.create'],
        actorAssignments: { human: '사용자 승인 필요', ai: '검토 제안만' },
      });
      setProjectApplications((current) => ({ ...current, [goal.id]: [result.proposal, ...(current[goal.id] ?? []).filter((item) => item.id !== result.proposal.id)] }));
      setActionNotice('프로젝트 적용 초안을 저장했습니다. 실행은 별도 승인 전까지 시작되지 않습니다.');
    } catch (nextError) { setError(errorMessage(nextError)); }
    finally { setBusy(false); }
  };

  const acceptProjectApplication = async (goal: LearningGoal, application: LearningProjectApplication) => {
    setBusy(true); setError(null);
    try {
      const result = await acceptLearningProjectApplication(goal.id, application.id);
      setProjectApplications((current) => ({ ...current, [goal.id]: (current[goal.id] ?? []).map((item) => item.id === application.id ? result.proposal : item) }));
      setActionNotice('프로젝트 Work Request를 만들었습니다. 실행은 기존 승인·Runtime 절차를 따릅니다.');
    } catch (nextError) { setError(errorMessage(nextError)); }
    finally { setBusy(false); }
  };

  const createReport = async (goal: LearningGoal) => {
    setBusy(true); setError(null);
    try {
      const result = await createLearningReport(goal.id, { from: reportFrom, to: reportTo, kind: reportKind });
      setLearningReports((current) => ({ ...current, [goal.id]: [result.report, ...(current[goal.id] ?? []).filter((item) => item.id !== result.report.id)] }));
      setActionNotice(result.created ? '기간 보고서를 저장했습니다. 검증된 이해와 미검증 self-report를 분리해 기록했습니다.' : '같은 기간과 근거 버전의 보고서를 다시 불러왔습니다.');
    } catch (nextError) { setError(errorMessage(nextError)); }
    finally { setBusy(false); }
  };

  const createPortfolioDraft = async (report: LearningReport) => {
    try {
      setBusy(true); setError(null);
      const snapshot = await getPortfolio();
      const evidenceIds = snapshot.evidence
        .filter((item) => item.sourceType === 'learning-report' && item.reportId === report.id && item.verificationStatus === 'verified')
        .map((item) => item.id);
      if (evidenceIds.length === 0) throw new Error('검증된 학습 보고서 근거가 없어 포트폴리오 초안을 만들 수 없습니다.');
      await createPortfolioEntry({
        title: `${report.goalSubject} 학습 보고서 초안`,
        summary: report.summary,
        visibility: 'private',
        evidenceIds,
      });
      setActionNotice('학습 보고서를 비공개 포트폴리오 초안으로 저장했습니다. 포트폴리오에서 편집 후 공개할 수 있습니다.');
    } catch (caught) {
      setError(errorMessage(caught));
    } finally { setBusy(false); }
  };

  const startGoalDay = async (goal: LearningGoal, preview: LearningPlanPreview) => {
    const day = preview.plan.days[0];
    if (!day) { setError('시작할 학습 일이 없습니다.'); return; }
    setBusy(true); setError(null);
    try {
      const result = await startLearningGoalSession(goal.id, { planVersionId: preview.plan.id, dayId: day.id, expectedRevision: goal.revision });
      setSession(result.session);
      setSessionActions((await listLearningSessionActions(result.session.id)).actions);
      setAttempts((await listStudyAttempts(result.session.id)).attempts);
      setLearningGoals((await listLearningGoals()).goals);
      const progress = (await getLearningGoalProgress(goal.id)).progress;
      setGoalProgress((current) => ({ ...current, [goal.id]: progress }));
      const today = (await getLearningGoalToday(goal.id)).today;
      setGoalToday((current) => ({ ...current, [goal.id]: today }));
    } catch (nextError) { setError(errorMessage(nextError)); }
    finally { setBusy(false); }
  };

  const begin = async (planId: string) => {
    setBusy(true); setError(null);
    try {
      const result = await startLearningSession(planId);
      setSession(result.session);
      setSessionActions((await listLearningSessionActions(result.session.id)).actions);
      setAttempts((await listStudyAttempts(result.session.id)).attempts);
    } catch (nextError) { setError(errorMessage(nextError)); }
    finally { setBusy(false); }
  };

  const completeSession = async () => {
    if (!session || session.status !== 'active') return;
    setBusy(true); setError(null);
    try {
    const result = await completeLearningSession(session.id, session.revision);
      setSession(result.session);
      setAttempts((await listStudyAttempts(result.session.id)).attempts);
    } catch (nextError) { setError(errorMessage(nextError)); }
    finally { setBusy(false); }
  };

  const requestContent = async () => {
    if (!session || session.status !== 'active' || !session.goalId) return;
    setBusy(true); setError(null);
    try {
      const result = await requestLearningSessionContent(session.id);
      setContentRequest(result.request);
      const { sessions: refreshedSessions } = await listLearningSessions();
      const refreshedSession = refreshedSessions.find((candidate) => candidate.id === session.id);
      if (refreshedSession) setSession(refreshedSession);
    } catch (nextError) { setError(errorMessage(nextError)); }
    finally { setBusy(false); }
  };

  const recordUnderstanding = async () => {
    if (!session || session.status !== 'active') return;
    setBusy(true); setError(null);
    try {
      const result = await recordLearningSessionAction(session.id, { actionId: `self-report-${Date.now()}`, type: 'self-report', ...(session.dayId ? { contentRef: session.dayId } : {}), question: '이해했어요' });
      setSessionActions((current) => [...current, result.action]);
      setActionNotice('이해했다는 self-report를 저장했습니다. 숙달 증거가 아님을 구분해 기록합니다.');
    } catch (nextError) { setError(errorMessage(nextError)); }
    finally { setBusy(false); }
  };

  const requestLearningAction = async (type: LearningSessionAction['type']) => {
    if (!session || session.status !== 'active' || type === 'self-report') return;
    if (!actionQuestion.trim()) { setError('학습 도움 요청 내용을 입력하세요.'); return; }
    setBusy(true); setError(null);
    try {
      const result = await recordLearningSessionAction(session.id, { actionId: `learning-action-${type}-${Date.now()}`, type, ...(session.dayId ? { contentRef: session.dayId } : {}), question: actionQuestion.trim() });
      setSessionActions((current) => [...current, result.action]);
      setActionNotice(result.action.status === 'recorded' && result.action.response ? '로컬 Runtime 응답을 저장했습니다. 이 응답은 학습 도움 기록이며 숙달 판정이 아닙니다.' : '학습 도움 요청을 저장했습니다. 로컬 Runtime 응답을 기다립니다.');
    } catch (nextError) { setError(errorMessage(nextError)); }
    finally { setBusy(false); }
  };

  const submitAttempt = async () => {
    if (!session || !questionId.trim() || !answer.trim()) { setError('학습 세션, 문제 ID, 답변이 필요합니다.'); return; }
    setBusy(true); setError(null);
    try {
      const result = await recordStudyAttempt({ sessionId: session.id, questionId: questionId.trim(), answer: answer.trim(), correct });
      setAttempts((current) => [...current, result.attempt]);
      setQuestionId(''); setAnswer(''); setCorrect(false);
      await refresh();
    } catch (nextError) { setError(errorMessage(nextError)); }
    finally { setBusy(false); }
  };

  const addReview = async () => {
    if (!reviewPrompt.trim() || !reviewAnswer.trim()) { setError('복습 질문과 답변이 필요합니다.'); return; }
    setBusy(true); setError(null);
    try {
      const result = await createReviewItem({ sourceType: 'learning-ui', sourceId: session?.id ?? 'manual', prompt: reviewPrompt.trim(), answer: reviewAnswer.trim() });
      setDueItems((current) => [...current, result.item]);
      setReviewPrompt(''); setReviewAnswer('');
    } catch (nextError) { setError(errorMessage(nextError)); }
    finally { setBusy(false); }
  };

  const completeReview = async (item: ReviewItem, quality: number) => {
    setBusy(true); setError(null);
    try {
      await reviewItem(item.id, quality);
      setDueItems((current) => current.filter((candidate) => candidate.id !== item.id));
    } catch (nextError) { setError(errorMessage(nextError)); }
    finally { setBusy(false); }
  };

  const analyze = async () => {
    if (!code.trim()) { setError('분석할 코드를 입력하세요.'); return; }
    setBusy(true); setError(null);
    try {
      const result = await analyzeCodeForLearning({ sourceType: 'learning-editor', sourceId: session?.id ?? 'manual', language: 'typescript', code });
      setAnalysis(result.result);
    } catch (nextError) { setError(errorMessage(nextError)); }
    finally { setBusy(false); }
  };

  const createCoding = async () => {
    const estimatedMinutes = Number(codingMinutes);
    if (!codingTitle.trim() || !codingPrompt.trim() || !codingLanguage.trim() || !Number.isInteger(estimatedMinutes) || estimatedMinutes < 1) {
      setError('코딩 테스트 제목, 문제, 언어와 예상 시간을 입력하세요.');
      return;
    }
    setBusy(true); setError(null);
    try {
      const result = await createCodingExercise({
        ...(session ? { sessionId: session.id } : {}),
        title: codingTitle.trim(), prompt: codingPrompt.trim(), language: codingLanguage.trim(), estimatedMinutes,
      });
      setCodingExercises((current) => [result.exercise, ...current]);
      setSelectedCodingExerciseId(result.exercise.id);
      setCodingTitle(''); setCodingPrompt('');
    } catch (nextError) { setError(errorMessage(nextError)); }
    finally { setBusy(false); }
  };

  const submitCoding = async () => {
    if (!selectedCodingExerciseId || !codingResponse.trim()) { setError('코딩 테스트 문제와 답변을 선택하세요.'); return; }
    setBusy(true); setError(null);
    try {
      const submittedResponse = codingResponse.trim();
      const selectedExercise = codingExercises.find((exercise) => exercise.id === selectedCodingExerciseId);
      const result = await submitCodingAttempt(selectedCodingExerciseId, { clientRequestId, response: submittedResponse });
      setCodingAttempts((current) => ({ ...current, [selectedCodingExerciseId]: [...(current[selectedCodingExerciseId] ?? []).filter((attempt) => attempt.id !== result.attempt.id), result.attempt] }));
      if (session && selectedExercise?.sessionId === session.id) {
        const answer = await submitLearningAnswer(session.id, { exerciseId: selectedExercise.id, attemptId: result.attempt.id, response: submittedResponse, artifactRefs: result.attempt.practiceResult.artifactRefs });
        setAnswerFeedback((await getLearningAnswerFeedback(answer.answer.id)).feedback);
      }
      setCodingResponse('');
      setClientRequestId(`coding-${Date.now()}`);
      setActionNotice(result.attempt.practiceResult.status === 'environment-required'
        ? '답변은 저장되었고 평가 대기 상태입니다. 현재 실행 환경이 연결되지 않아 자동 채점과 숙달 판정은 보류되었습니다.'
        : result.attempt.practiceResult.status === 'syntax-verified'
          ? '답변 파일의 JavaScript 구문만 확인했습니다. 문제 정답·숙달·성장 증거로 승격하지 않습니다.'
          : '답변에 구문 오류가 있어 수정이 필요합니다. 문제 정답 판정은 아직 하지 않았습니다.');
    } catch (nextError) { setError(errorMessage(nextError)); }
    finally { setBusy(false); }
  };

  const disputeFeedback = async () => {
    if (!answerFeedback || !disputeReason.trim()) { setError('평가 이의 제기 사유가 필요합니다.'); return; }
    setBusy(true); setError(null);
    try {
      const result = await disputeLearningFeedback(answerFeedback.id, { reason: disputeReason.trim() });
      setAnswerFeedback(result.feedback);
      setActionNotice(result.dispute.status === 'waiting-runtime' ? '이의 제기는 저장되었고 재평가는 로컬 Runtime 연결을 기다립니다.' : '이의 제기가 저장되었습니다.');
      setDisputeReason('');
    } catch (nextError) { setError(errorMessage(nextError)); }
    finally { setBusy(false); }
  };

  const selectedCodingAttempt = selectedCodingExerciseId
    ? codingAttempts[selectedCodingExerciseId]?.[codingAttempts[selectedCodingExerciseId].length - 1]
    : undefined;

  return (
    <div className="p-6 md:p-8" style={{ fontFamily: 'var(--font-body)' }}>
      <SectionHeader
        title="학습 공간"
        subtitle="학습 계획, 실제 학습 시도, 복습 기록과 로컬 코드 분석을 한 곳에서 관리합니다."
        action={<Btn variant="mint" onClick={() => void refresh()} disabled={loading || busy}>{loading ? '불러오는 중…' : '새로고침'}</Btn>}
      />

      {error && <div role="alert" className="mb-5 rounded-xl border-2 border-rose-200 bg-rose-50 p-4 text-sm font-semibold text-rose-700">{error}</div>}
      {actionNotice && <div role="status" className="mb-5 rounded-xl border-2 border-blue-200 bg-blue-50 p-4 text-sm font-semibold text-blue-700">{actionNotice}</div>}

      <div className="grid gap-4 md:grid-cols-3 mb-6">
        <div className="card-game p-4"><p className="text-xs text-slate-500">저장된 학습 계획</p><p className="text-2xl font-black text-slate-900">{plans.length}</p></div>
        <div className="card-game p-4"><p className="text-xs text-slate-500">이번 세션 학습 시도</p><p className="text-2xl font-black text-slate-900">{attempts.length}</p></div>
        <div className="card-game p-4"><p className="text-xs text-slate-500">오늘 복습할 항목</p><p className="text-2xl font-black text-slate-900">{dueItems.length}</p></div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
            <section className="card-game p-5 xl:col-span-2">
          <h3 className="mb-1 text-lg font-black text-slate-900">새 학습 목표</h3>
          <p className="mb-4 text-sm text-slate-500">분야·기간·하루 시간을 먼저 저장합니다. 계획 미리보기는 사용자 소유의 검증된 초안이며, 연결된 로컬 Runtime이 없으면 local-template으로 대기 없이 준비됩니다.</p>
          <div className="grid gap-3 md:grid-cols-[1.5fr_140px_140px_auto]">
            <input aria-label="학습 분야" value={goalSubject} onChange={(event) => setGoalSubject(event.target.value)} placeholder="예: TypeScript 제네릭" className="rounded-xl border-2 border-blue-100 px-3 py-2.5 text-sm" />
            <input aria-label="학습 기간" type="number" min="1" max="3650" value={goalDays} onChange={(event) => setGoalDays(event.target.value)} placeholder="일수" className="rounded-xl border-2 border-blue-100 px-3 py-2.5 text-sm" />
            <input aria-label="하루 학습 시간" type="number" min="1" max="1440" value={goalMinutes} onChange={(event) => setGoalMinutes(event.target.value)} placeholder="분" className="rounded-xl border-2 border-blue-100 px-3 py-2.5 text-sm" />
            <Btn variant="mint" onClick={() => void createGoal()} disabled={busy}>학습 목표 초안 저장</Btn>
          </div>
              {learningGoals.length > 0 && <div className="mt-4 grid gap-3 md:grid-cols-2">{learningGoals.map((goal) => { const preview = goalPreviews[goal.id]; const progress = goalProgress[goal.id]; const today = goalToday[goal.id]; const adjustments = goalAdjustments[goal.id] ?? []; return <div key={goal.id} className="rounded-xl border-2 border-emerald-100 bg-emerald-50 p-4"><div className="flex items-center justify-between gap-2"><p className="font-bold text-emerald-900">{goal.input.subjectText}</p><span className="text-xs font-semibold text-emerald-700">{goal.status === 'active' ? '진행 중' : goal.status === 'preview-ready' ? '미리보기 준비됨' : '초안'} · v{goal.revision}</span></div><p className="mt-1 text-sm text-emerald-800">{('days' in goal.input.duration ? `${goal.input.duration.days}일` : goal.input.duration.targetDate)} · 하루 {goal.input.dailyMinutes}분</p>{today && <p className="mt-2 text-xs font-semibold text-emerald-800">오늘 상태: {today.state === 'available' ? '학습 예정' : today.state === 'active' ? '학습 중' : today.state === 'content-pending' ? '콘텐츠 준비 대기' : today.state === 'completed' ? '오늘 학습 완료' : '예정 없음'}{today.day ? ` · ${today.day.dayIndex}일차 · ${today.day.minutes}분` : ''}</p>}<Btn variant="secondary" size="sm" onClick={() => void previewGoal(goal)} disabled={busy}>학습 계획 미리보기</Btn>{preview && <div className="mt-3 rounded-lg border border-emerald-200 bg-white p-3 text-xs text-slate-600"><p className="font-bold text-emerald-800">{preview.interpretation.source.kind} · 검증된 초안 v{preview.plan.inputRevision}</p><p className="mt-1">총 {preview.plan.budget.totalMinutes}분 · {preview.plan.days.length}일 · 첫날 {preview.plan.days[0]?.minutes ?? 0}분</p><p className="mt-1">가정: {preview.interpretation.assumptions[0]}</p>{goal.status !== 'active' && <Btn variant="mint" size="sm" onClick={() => void startGoalDay(goal, preview)} disabled={busy}>오늘의 학습 세션 시작</Btn>}<p className="mt-2 text-slate-500">세션 콘텐츠 상태: {preview.plan.days[0] ? '계획만 준비됨 · AI 콘텐츠 요청 전' : '없음'}</p><div className="mt-3 border-t border-emerald-100 pt-3"><p className="font-bold text-emerald-800">학습 계획 재조정</p><p className="mt-1 text-slate-500">완료 기록은 보존하고, 남은 학습 시간 변경안을 먼저 확인합니다.</p><div className="mt-2 flex flex-wrap gap-2"><input aria-label={`재조정 하루 시간 ${goal.input.subjectText}`} type="number" min="1" max="1440" value={adjustmentMinutes[goal.id] ?? ''} onChange={(event) => setAdjustmentMinutes((current) => ({ ...current, [goal.id]: event.target.value }))} placeholder={`${goal.input.dailyMinutes}분`} className="w-28 rounded-lg border border-emerald-200 px-2 py-1.5" /><Btn variant="secondary" size="sm" onClick={() => void proposeAdjustment(goal, preview)} disabled={busy}>재조정안 만들기</Btn></div>{adjustments.map((adjustment) => <div key={adjustment.id} className="mt-2 rounded-lg bg-amber-50 p-2 text-amber-900"><p>{adjustment.status === 'proposed' ? '수락 전 재조정안' : '수락된 재조정안'} · 하루 {adjustment.proposedPlan.dailyMinutes}분</p>{adjustment.status === 'proposed' && <Btn variant="mint" size="sm" onClick={() => void acceptAdjustment(goal, adjustment)} disabled={busy}>이 재조정안 수락</Btn>}</div>)}</div></div>}{progress && <div className="mt-3 rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs text-slate-700"><p className="font-bold text-blue-900">진도 근거</p><p className="mt-1">예정 {progress.schedule.plannedDays}일 · 완료 세션 {progress.actual.sessions.completed}회 · 실제 활성 세션 {progress.actual.sessions.active}회</p><p className="mt-1">검증된 시도 {progress.actual.verifiedCorrectAttempts}건 · 검증 전 시도 {progress.actual.unverifiedAttempts}건 · 코딩 실습 {progress.actual.codingAttempts}건 · 평가 대기 {progress.evaluation.pendingAnswers}건</p><p className="mt-1">복습 대기 {progress.reviews.dueCount}건 · 자기보고 {progress.actual.selfReports}건</p><p className="mt-2 text-blue-700">숙달률을 임의 계산하지 않습니다.</p></div>}</div>; })}</div>}
        </section>

        <section className="card-game p-5 xl:col-span-2">
          <h3 className="mb-1 text-lg font-black text-slate-900">학습 내용을 프로젝트에 적용</h3>
          <p className="mb-4 text-sm text-slate-500">학습 근거에서 작업 초안을 만들고, 사용자가 수락할 때만 프로젝트 Work Request를 만듭니다. 실행·배포·push는 별도 승인 전까지 시작되지 않습니다.</p>
          {learningGoals.length === 0 ? <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">먼저 학습 목표를 저장하세요.</p> : <div className="grid gap-3 md:grid-cols-2">{learningGoals.map((goal) => <div key={`application-${goal.id}`} className="rounded-xl border-2 border-cyan-100 bg-cyan-50 p-4"><p className="font-bold text-cyan-900">{goal.input.subjectText}</p><div className="mt-3 flex flex-wrap gap-2"><label className="sr-only" htmlFor={`learning-project-${goal.id}`}>학습 적용 프로젝트 {goal.input.subjectText}</label><select id={`learning-project-${goal.id}`} aria-label={`학습 적용 프로젝트 ${goal.input.subjectText}`} value={projectTargetByGoal[goal.id] ?? ''} onChange={(event) => setProjectTargetByGoal((current) => ({ ...current, [goal.id]: event.target.value }))} className="min-w-0 flex-1 rounded-lg border-2 border-cyan-200 bg-white px-3 py-2 text-sm"><option value="">프로젝트 선택</option>{projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select><Btn variant="secondary" size="sm" onClick={() => void createProjectApplication(goal)} disabled={busy || !projectTargetByGoal[goal.id]}>적용 초안 만들기</Btn></div>{(projectApplications[goal.id] ?? []).map((application) => <div key={application.id} className="mt-3 rounded-lg border border-cyan-200 bg-white p-3 text-xs text-slate-700"><div className="flex items-center justify-between gap-2"><span className="font-bold text-cyan-900">{application.proposal.title}</span><span className="font-semibold text-cyan-700">{application.status === 'accepted' ? 'Work Request 생성됨' : '사용자 수락 대기'}</span></div><p className="mt-1">{application.proposal.objective}</p>{application.status === 'proposed' && <Btn variant="mint" size="sm" onClick={() => void acceptProjectApplication(goal, application)} disabled={busy}>학습 적용 작업 수락</Btn>}<p className="mt-2 text-slate-500">실행 상태를 완료로 표시하지 않으며, 기존 프로젝트 승인 경계를 유지합니다.</p></div>)}</div>)}</div>}
        </section>

        <section className="card-game p-5 xl:col-span-2">
          <h3 className="mb-1 text-lg font-black text-slate-900">학습 주간·최종 보고</h3>
          <p className="mb-4 text-sm text-slate-500">저장된 계획·세션·답변·복습 근거를 기간별로 요약합니다. 이 로컬 보고는 실제 결과가 없는 숙달이나 역량을 주장하지 않습니다.</p>
          <div className="mb-4 grid gap-3 sm:grid-cols-[1fr_1fr_1fr_auto]">
            <label className="text-xs font-bold text-slate-600">보고 시작일<input aria-label="보고 시작일" type="date" value={reportFrom} onChange={(event) => setReportFrom(event.target.value)} className="mt-1 w-full rounded-lg border-2 border-cyan-100 bg-white px-3 py-2 text-sm" /></label>
            <label className="text-xs font-bold text-slate-600">보고 종료일<input aria-label="보고 종료일" type="date" value={reportTo} onChange={(event) => setReportTo(event.target.value)} className="mt-1 w-full rounded-lg border-2 border-cyan-100 bg-white px-3 py-2 text-sm" /></label>
            <label className="text-xs font-bold text-slate-600">보고 유형<select aria-label="보고 유형" value={reportKind} onChange={(event) => setReportKind(event.target.value as 'weekly' | 'final')} className="mt-1 w-full rounded-lg border-2 border-cyan-100 bg-white px-3 py-2 text-sm"><option value="weekly">주간 보고</option><option value="final">최종 보고</option></select></label>
            <span className="self-end rounded-lg bg-cyan-50 px-3 py-2 text-xs font-semibold text-cyan-800">근거 기반 · local-evidence</span>
          </div>
          {learningGoals.length === 0 ? <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">먼저 학습 목표를 저장하세요.</p> : <div className="grid gap-3 md:grid-cols-2">{learningGoals.map((goal) => <div key={`report-${goal.id}`} className="rounded-xl border-2 border-cyan-100 bg-cyan-50 p-4"><div className="flex items-center justify-between gap-2"><p className="font-bold text-cyan-900">{goal.input.subjectText}</p><Btn variant="secondary" size="sm" onClick={() => void createReport(goal)} disabled={busy}>근거 기반 보고서 생성</Btn></div>{(learningReports[goal.id] ?? []).map((report) => <div key={report.id} className="mt-3 rounded-lg border border-cyan-200 bg-white p-3 text-xs text-slate-700"><p className="font-bold text-cyan-900">{report.period.from} ~ {report.period.to} · {report.provenance.kind}</p><p className="mt-1">{report.summary}</p><p className="mt-2 font-semibold text-emerald-800">검증된 이해 {report.verifiedOutcomes.length}건 · 근거 {report.verifiedOutcomes.reduce((total, outcome) => total + outcome.evidenceRefs.length, 0)}건</p><p className="mt-1 text-amber-700">미검증 기록 {report.unverifiedOutcomes.length}건 · 남은 항목 {report.remaining.length}건</p>{report.unverifiedOutcomes.length > 0 && <div className="mt-2 rounded-lg border border-amber-100 bg-amber-50 p-2"><p className="font-semibold text-amber-800">미검증 기록 상세</p><ul className="mt-1 space-y-1 text-amber-900">{report.unverifiedOutcomes.map((outcome) => <li key={outcome.outcomeId}>{outcome.label} · 근거 {outcome.evidenceRefs.length}건</li>)}</ul></div>}{report.reviewSuggestions.length > 0 && <p className="mt-1 text-violet-700">복습 제안 {report.reviewSuggestions.length}건</p>}{report.verifiedOutcomes.length > 0 && <Btn variant="secondary" size="sm" onClick={() => void createPortfolioDraft(report)} disabled={busy}>학습 보고서를 포트폴리오 초안으로 저장</Btn>}</div>)}</div>)}</div>}
        </section>

        <section className="card-game p-5">
          <h3 className="mb-4 text-lg font-black text-slate-900">학습 계획</h3>
          <div className="grid gap-3">
            <input aria-label="학습 계획 제목" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="예: TypeScript 타입 설계" className="rounded-xl border-2 border-blue-100 px-3 py-2.5 text-sm" />
            <textarea aria-label="학습 계획 설명" value={description} onChange={(event) => setDescription(event.target.value)} placeholder="무엇을 어떤 맥락에서 배우려는지 적어주세요." rows={2} className="rounded-xl border-2 border-blue-100 px-3 py-2.5 text-sm" />
            <textarea aria-label="학습 목표" value={goals} onChange={(event) => setGoals(event.target.value)} placeholder="학습 목표를 줄바꿈 또는 쉼표로 구분하세요." rows={3} className="rounded-xl border-2 border-blue-100 px-3 py-2.5 text-sm" />
            <Btn variant="mint" onClick={() => void createPlan()} disabled={busy}>계획 저장</Btn>
          </div>
          <div className="mt-6 space-y-3">
            {plans.length === 0 && !loading && <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">아직 저장된 계획이 없습니다. 첫 계획을 직접 만들어 보세요.</p>}
            {plans.map((plan) => (
              <div key={plan.id} className="rounded-xl border-2 border-blue-100 bg-white p-4">
                <div className="flex items-start justify-between gap-3">
                  <div><h4 className="font-black text-slate-900">{plan.title}</h4><p className="mt-1 text-sm text-slate-600">{plan.description}</p></div>
                  <StatusBadge status={plan.status === 'active' ? 'running' : plan.status === 'completed' ? 'success' : 'pending'} />
                </div>
                <div className="mt-3 flex flex-wrap gap-2">{plan.goals.map((goal) => <span key={goal} className="rounded-full bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700">{goal}</span>)}</div>
                <div className="mt-3 flex items-center justify-between text-xs text-slate-400"><span>저장 {formatDate(plan.createdAt, timezone)}</span><Btn variant="secondary" size="sm" onClick={() => void begin(plan.id)} disabled={busy}>이 계획으로 세션 시작</Btn></div>
              </div>
            ))}
          </div>
        </section>

        <section className="card-game p-5">
          <h3 className="mb-4 text-lg font-black text-slate-900">학습 세션</h3>
          {!session ? <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">학습 계획에서 세션을 시작하면 실제 시도 기록을 남길 수 있습니다.</p> : (
            <>
              <div className="mb-4 rounded-xl border-2 border-emerald-100 bg-emerald-50 p-4"><div className="flex items-center justify-between gap-3"><p className="text-xs font-bold text-emerald-700">{session.status === 'active' ? '활성 세션' : '완료된 세션'}</p>{session.status === 'active' ? <div className="flex flex-wrap justify-end gap-2">{session.goalId && <Btn variant="secondary" size="sm" onClick={() => void requestContent()} disabled={busy || contentRequest?.state === 'waiting-runtime' || contentRequest?.state === 'validated'}>오늘 수업 콘텐츠 준비 요청</Btn>}<Btn variant="secondary" size="sm" onClick={() => void recordUnderstanding()} disabled={busy}>이해했어요 기록</Btn><Btn variant="secondary" size="sm" onClick={() => void completeSession()} disabled={busy}>학습 세션 완료</Btn></div> : <span className="text-xs font-bold text-emerald-700">{session.completedAt ? `완료 ${formatDate(session.completedAt, timezone)}` : '완료됨'}</span>}</div><p className="mt-1 break-all text-sm text-emerald-900">{session.id}</p><p className="mt-1 text-xs text-emerald-700">최근 재개 {formatDate(session.resumedAt, timezone)}</p>{session.goalId && <p className="mt-2 text-xs font-semibold text-emerald-800">콘텐츠 상태: {contentRequest?.state === 'validated' ? '검증된 오늘 수업' : contentRequest?.state === 'waiting-runtime' || session.contentStatus === 'pending' ? '로컬 Runtime 대기' : '아직 요청하지 않음'}</p>}{contentRequest?.state === 'waiting-runtime' && <p className="mt-1 text-xs text-amber-700">{contentRequest.blocker ?? '콘텐츠 생성 요청은 저장되었지만 아직 응답이 없습니다.'}</p>}</div>
              <div className="mb-4 rounded-xl border-2 border-cyan-100 bg-cyan-50 p-4"><p className="font-black text-cyan-900">학습 도움 요청</p><p className="mt-1 text-xs text-cyan-800">설명·예시·힌트를 요청할 수 있습니다. 응답이 없으면 로컬 Runtime 대기로 저장됩니다.</p><textarea aria-label="학습 도움 요청" value={actionQuestion} onChange={(event) => setActionQuestion(event.target.value)} rows={2} disabled={session.status === 'completed'} className="mt-3 w-full rounded-lg border-2 border-cyan-200 bg-white px-3 py-2 text-sm disabled:bg-slate-100" /><div className="mt-3 flex flex-wrap gap-2"><Btn variant="secondary" size="sm" onClick={() => void requestLearningAction('explanation')} disabled={busy || session.status === 'completed'}>설명 요청</Btn><Btn variant="secondary" size="sm" onClick={() => void requestLearningAction('example')} disabled={busy || session.status === 'completed'}>예시 요청</Btn><Btn variant="secondary" size="sm" onClick={() => void requestLearningAction('hint')} disabled={busy || session.status === 'completed'}>힌트 요청</Btn></div></div>
              {sessionActions.length > 0 && <div className="mb-4 rounded-xl border-2 border-cyan-100 bg-white p-4"><p className="mb-2 text-xs font-black text-cyan-900">학습 도움 기록</p><div className="space-y-2">{sessionActions.map((action) => <div key={action.id} className="rounded-lg bg-cyan-50 p-3 text-sm"><div className="flex items-center justify-between gap-2"><span className="font-bold text-cyan-900">{action.type === 'self-report' ? '이해했어요 기록' : action.type === 'explanation' ? '설명 요청' : action.type === 'example' ? '예시 요청' : '힌트 요청'}</span><span className="text-xs text-cyan-700">{action.status === 'recorded' ? action.response ? '로컬 Runtime 응답 저장' : '사용자 기록' : '로컬 Runtime 대기'}</span></div>{action.question && <p className="mt-1 text-xs text-slate-500">요청: {action.question}</p>}<p className="mt-1 text-sm text-slate-700">{action.response ?? action.blocker ?? '응답을 기다리는 중입니다.'}</p></div>)}</div></div>}
              {contentRequest?.state === 'validated' && contentRequest.lesson && <div className="mb-4 rounded-xl border-2 border-blue-100 bg-blue-50 p-4"><p className="font-black text-blue-900">{contentRequest.lesson.title}</p><p className="mt-1 text-xs text-blue-700">{contentRequest.lesson.estimatedMinutes}분 · local Runtime 검증 결과</p><div className="mt-3 space-y-2">{contentRequest.lesson.blocks.map((block) => <div key={block.id} className="rounded-lg bg-white p-3"><div className="flex items-center justify-between gap-2"><span className="font-bold text-slate-800">{block.title}</span><span className="text-xs text-slate-500">{block.kind} · {block.minutes}분</span></div><p className="mt-1 text-sm text-slate-600">{block.content}</p></div>)}</div></div>}
              <div className="grid gap-3">
                <input aria-label="문제 ID" value={questionId} onChange={(event) => setQuestionId(event.target.value)} disabled={session.status === 'completed'} placeholder="문제 ID 또는 학습 단위" className="rounded-xl border-2 border-blue-100 px-3 py-2.5 text-sm disabled:bg-slate-100" />
                <textarea aria-label="학습 답변" value={answer} onChange={(event) => setAnswer(event.target.value)} disabled={session.status === 'completed'} placeholder="답변 또는 이해한 내용을 기록하세요." rows={3} className="rounded-xl border-2 border-blue-100 px-3 py-2.5 text-sm disabled:bg-slate-100" />
                <label className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={correct} onChange={(event) => setCorrect(event.target.checked)} disabled={session.status === 'completed'} /> 검증된 정답으로 기록</label>
                <Btn variant="mint" onClick={() => void submitAttempt()} disabled={busy || session.status === 'completed'}>학습 시도 저장</Btn>
              </div>
              <div className="mt-5 space-y-2"><p className="text-xs font-bold text-slate-500">이 세션의 기록</p>{attempts.length === 0 ? <p className="text-sm text-slate-400">아직 기록이 없습니다.</p> : attempts.map((attempt) => <div key={attempt.id} className="rounded-lg bg-slate-50 p-3 text-sm"><div className="flex justify-between gap-2"><span className="font-semibold text-slate-800">{attempt.questionId}</span><span className={attempt.correct ? 'text-emerald-600' : 'text-slate-500'}>{attempt.correct === undefined ? '검증 전' : attempt.correct ? '정답' : '오답'}</span></div><p className="mt-1 text-slate-600">{attempt.answer}</p></div>)}</div>
            </>
          )}
        </section>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <section className="card-game p-5">
          <h3 className="mb-1 text-lg font-black text-slate-900">복습 큐</h3>
          <p className="mb-4 text-sm text-slate-500">저장된 복습 항목을 평가하면 다음 복습 시점이 기록됩니다.</p>
          <div className="grid gap-3 mb-5"><input aria-label="복습 질문" value={reviewPrompt} onChange={(event) => setReviewPrompt(event.target.value)} placeholder="복습 질문" className="rounded-xl border-2 border-blue-100 px-3 py-2.5 text-sm" /><textarea aria-label="복습 답변" value={reviewAnswer} onChange={(event) => setReviewAnswer(event.target.value)} placeholder="정답 또는 핵심 설명" rows={2} className="rounded-xl border-2 border-blue-100 px-3 py-2.5 text-sm" /><Btn variant="secondary" onClick={() => void addReview()} disabled={busy}>복습 항목 저장</Btn></div>
          {dueItems.length === 0 ? <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">현재 도래한 복습 항목이 없습니다.</p> : <div className="space-y-3">{dueItems.map((item) => <div key={item.id} className="rounded-xl border-2 border-amber-100 bg-amber-50 p-4"><p className="font-bold text-slate-900">{item.prompt}</p><p className="mt-2 text-sm text-slate-600">{item.answer}</p><div className="mt-3 flex items-center justify-between gap-2"><span className="text-xs text-amber-700">복습 {item.reviewCount}회 · {formatDate(item.dueAt, timezone)}</span><div className="flex gap-2"><Btn variant="secondary" size="sm" onClick={() => void completeReview(item, 2)} disabled={busy}>다시 필요</Btn><Btn variant="mint" size="sm" onClick={() => void completeReview(item, 5)} disabled={busy}>이해함</Btn></div></div></div>)}</div>}
        </section>

        <section className="card-game p-5">
          <h3 className="mb-1 text-lg font-black text-slate-900">코드 학습 분석</h3>
          <p className="mb-4 text-sm text-slate-500">외부 AI 호출 없이 로컬 정적 분석기로 TODO와 any 사용을 학습 포인트로 표시합니다.</p>
          <textarea aria-label="분석할 코드" value={code} onChange={(event) => setCode(event.target.value)} placeholder="분석할 TypeScript 코드를 붙여넣으세요." rows={8} className="w-full rounded-xl border-2 border-blue-100 px-3 py-2.5 font-mono text-sm" />
          <div className="mt-3 flex items-center justify-between gap-3"><span className="text-xs text-slate-400">provider: local-static</span><Btn variant="violet" onClick={() => void analyze()} disabled={busy}>코드 분석 실행</Btn></div>
          {analysis && <div className="mt-5 rounded-xl border-2 border-violet-100 bg-violet-50 p-4"><div className="flex items-center justify-between gap-2"><p className="font-bold text-violet-900">{analysis.summary}</p><span className="text-xs text-violet-700">{formatDate(analysis.createdAt, timezone)}</span></div>{analysis.findings.length === 0 ? <p className="mt-2 text-sm text-violet-800">즉시 표시할 학습 포인트가 없습니다.</p> : <ul className="mt-3 space-y-2">{analysis.findings.map((finding, index) => <li key={`${finding.code}-${index}`} className="text-sm text-violet-900"><span className="font-bold">{finding.code}</span>{finding.line ? ` · ${finding.line}행` : ''} — {finding.message}</li>)}</ul>}</div>}
        </section>
      </div>

      <section className="card-game mt-6 p-5">
        <h3 className="mb-1 text-lg font-black text-slate-900">코딩 테스트 학습</h3>
        <p className="mb-4 text-sm text-slate-500">문제와 답변을 사용자별로 저장합니다. 실행 환경이 확인되기 전에는 자동 채점이나 통과를 표시하지 않습니다.</p>
        <div className="grid gap-3 md:grid-cols-[1fr_1.4fr_160px_120px_auto]">
          <input aria-label="코딩 테스트 제목" value={codingTitle} onChange={(event) => setCodingTitle(event.target.value)} placeholder="문제 제목" className="rounded-xl border-2 border-blue-100 px-3 py-2.5 text-sm" />
          <input aria-label="코딩 테스트 문제" value={codingPrompt} onChange={(event) => setCodingPrompt(event.target.value)} placeholder="문제 또는 연습 목표" className="rounded-xl border-2 border-blue-100 px-3 py-2.5 text-sm" />
          <input aria-label="코딩 테스트 언어" value={codingLanguage} onChange={(event) => setCodingLanguage(event.target.value)} placeholder="언어" className="rounded-xl border-2 border-blue-100 px-3 py-2.5 text-sm" />
          <input aria-label="예상 시간" type="number" min="1" max="1440" value={codingMinutes} onChange={(event) => setCodingMinutes(event.target.value)} placeholder="분" className="rounded-xl border-2 border-blue-100 px-3 py-2.5 text-sm" />
          <Btn variant="violet" onClick={() => void createCoding()} disabled={busy}>문제 저장</Btn>
        </div>
        {codingExercises.length === 0 ? <p className="mt-4 rounded-xl bg-slate-50 p-4 text-sm text-slate-500">저장된 코딩 테스트 문제가 없습니다.</p> : <div className="mt-4 grid gap-3 md:grid-cols-2">{codingExercises.map((exercise) => <button type="button" key={exercise.id} onClick={() => setSelectedCodingExerciseId(exercise.id)} className={`rounded-xl border-2 p-4 text-left ${selectedCodingExerciseId === exercise.id ? 'border-violet-400 bg-violet-50' : 'border-blue-100 bg-white'}`}><div className="flex items-center justify-between gap-2"><span className="font-bold text-slate-900">{exercise.title}</span><span className="text-xs text-slate-500">{exercise.language} · {exercise.estimatedMinutes}분</span></div><p className="mt-2 text-sm text-slate-600">{exercise.prompt}</p></button>)}</div>}
        {selectedCodingExerciseId && <div className="mt-4 rounded-xl border-2 border-violet-100 bg-violet-50 p-4"><label className="mb-2 block text-sm font-bold text-violet-900" htmlFor="coding-test-response">선택한 문제의 답변</label><textarea id="coding-test-response" aria-label="코딩 테스트 답변" value={codingResponse} onChange={(event) => setCodingResponse(event.target.value)} rows={7} placeholder="코드 또는 풀이를 작성하세요." className="w-full rounded-xl border-2 border-violet-200 bg-white px-3 py-2.5 font-mono text-sm" /><div className="mt-3 flex flex-wrap items-center justify-between gap-3"><span className="text-xs font-semibold text-violet-800">현재 상태: {codingPracticeStatus(selectedCodingAttempt)}</span><Btn variant="mint" onClick={() => void submitCoding()} disabled={busy}>답변 저장</Btn></div>{selectedCodingAttempt?.practiceResult.status === 'syntax-invalid' && selectedCodingAttempt.practiceResult.receipt.diagnostics.length > 0 && <p className="mt-2 rounded-lg border border-rose-200 bg-rose-50 p-2 text-xs text-rose-700">구문 검사 진단: {selectedCodingAttempt.practiceResult.receipt.diagnostics.join(' · ')}</p>}{answerFeedback && <div className="mt-3 space-y-2"><p className="text-xs font-semibold text-violet-800">평가 상태: {answerFeedback.status === 'pending' ? '평가 대기' : answerFeedback.status === 'disputed' ? '재평가 대기' : answerFeedback.status} · {answerFeedback.blocker ?? '판정 근거를 기다리는 중'}</p>{answerFeedback.evaluation && <div className="rounded-lg border border-violet-200 bg-white p-3 text-xs text-violet-900"><p className="font-bold">평가 결과</p><p className="mt-1">{answerFeedback.evaluation.feedback}</p><p className="mt-1">검증 상태: {answerFeedback.evaluation.verification === 'verified' ? '검증됨' : answerFeedback.evaluation.verification === 'needs-review' ? '검토 필요' : '검증 대기 · 아직 검증되지 않았습니다.'}</p><p className="mt-1">기준 {answerFeedback.evaluation.criteriaResults.length}개 · 다음 행동: {answerFeedback.evaluation.nextAction}</p></div>}<label className="block text-xs font-bold text-violet-900" htmlFor="learning-feedback-dispute">평가 이의 제기 사유</label><textarea id="learning-feedback-dispute" aria-label="평가 이의 제기 사유" value={disputeReason} onChange={(event) => setDisputeReason(event.target.value)} rows={2} placeholder="평가 근거를 다시 확인해야 하는 이유를 적어주세요." disabled={busy || answerFeedback.status === 'disputed'} className="w-full rounded-xl border-2 border-violet-200 bg-white px-3 py-2.5 text-sm disabled:bg-slate-100" /><Btn variant="secondary" onClick={() => void disputeFeedback()} disabled={busy || answerFeedback.status === 'disputed'}>평가 이의 제기 저장</Btn>{answerFeedback.status === 'disputed' && <p className="text-xs font-semibold text-amber-700">재평가 대기: 이의 제기는 저장되었지만 로컬 Runtime 재평가 결과는 아직 없습니다.</p>}</div>}</div>}
      </section>
    </div>
  );
}

export default function Learning() {
  return <AppShell><LearningDashboard /></AppShell>;
}
