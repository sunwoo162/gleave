import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router';
import { AppShell } from '../components/Navigation';
import { WorkroomBackground } from '../components/Character';
import { UserCharacterAsset, AICompanionAsset } from '../components/CharacterAssets';
import { PersonalWorkshopEnvironmentAsset } from '../components/EnvironmentAssets';
import { Icon, type IconName } from '../components/Icon';
import { XPBar, LevelBadge, StatCard, StatusBadge } from '../components/UI';
import { getRuntimeStatus, getUserProject, listActivityEvents, listAiTeamProposals, listDueReviewItems, listLearningPlans, listUserProjects, recordWorldMissionCompletion, type AiTeamProposal, type LearningPlan, type ReviewItem, type UserActivityEvent, type UserProject, type UserProjectView, type UserRuntimeStatus, UserApiError } from '../api/userApi';
import { useUser } from '../store/useUser';
import { buildWorldMissions, formatWorldDate, formatWorldDateTime } from '../domain/worldState';
import { userFacingError } from '../errorMessage';

const zones: Array<{ path: string; icon: IconName; label: string; desc: string; color: string; bg: string }> = [
  { path: '/idea-lab', icon: 'lightbulb', label: 'Idea Lab', desc: '새 프로젝트 구상', color: '#f59e0b', bg: 'linear-gradient(135deg, #fef3c7, #fde68a)' },
  { path: '/projects', icon: 'bolt', label: '프로젝트 작업실', desc: '개발 이어하기', color: '#6366f1', bg: 'linear-gradient(135deg, #e0e7ff, #c7d2fe)' },
  { path: '/learning', icon: 'book', label: '학습 공간', desc: '오늘의 학습', color: '#10b981', bg: 'linear-gradient(135deg, #d1fae5, #a7f3d0)' },
  { path: '/ai-chat', icon: 'sparkles', label: 'AI 이설', desc: '대화하기', color: '#8b5cf6', bg: 'linear-gradient(135deg, #ede9fe, #ddd6fe)' },
  { path: '/teams', icon: 'users', label: '팀 · 스터디', desc: '팀원 찾기', color: '#f43f5e', bg: 'linear-gradient(135deg, #fee2e2, #fecaca)' },
  { path: '/community', icon: 'globe', label: '커뮤니티', desc: '사람들과 소통', color: '#0ea5e9', bg: 'linear-gradient(135deg, #e0f2fe, #bae6fd)' },
];

function worldErrorMessage(error: unknown): string {
  if (error instanceof UserApiError && error.status === 401) return '로그인이 필요합니다.';
  return userFacingError(error, '세계 데이터를 불러오지 못했습니다.');
}

function projectRuntimeBadge(status: string): 'running' | 'success' | 'warning' | 'pending' | 'error' | 'unknown' {
  if (status === 'completed') return 'success';
  if (status === 'running') return 'running';
  if (status === 'waiting') return 'warning';
  if (status === 'failed') return 'error';
  if (status === 'not-started') return 'pending';
  return 'unknown';
}

function projectRuntimeSummary(view: UserProjectView | null, unavailable: boolean): string {
  if (unavailable) return '프로젝트 실행 상태 확인 불가';
  if (!view) return '프로젝트 실행 상태 확인 중';
  const runtime = view.runtime;
  if (runtime.status === 'completed') return `Run 완료${runtime.runId ? ` · ${runtime.runId}` : ''}`;
  if (runtime.status === 'running') return `Run 실행 중${runtime.runId ? ` · ${runtime.runId}` : ''}`;
  if (runtime.status === 'waiting') return runtime.blocker ?? 'Run 실행 대기 중';
  if (runtime.status === 'failed') return runtime.blocker ?? 'Run 실행 실패';
  if (runtime.status === 'not-started') return '실행된 Run 없음';
  return runtime.blocker ?? 'Run 상태 확인 불가';
}

export default function MyWorld() {
  const [activeTab, setActiveTab] = useState<'overview' | 'missions' | 'achievements'>('overview');
  const [projects, setProjects] = useState<UserProject[]>([]);
  const [plans, setPlans] = useState<LearningPlan[]>([]);
  const [dueReviews, setDueReviews] = useState<ReviewItem[]>([]);
  const [recentActivity, setRecentActivity] = useState<UserActivityEvent[]>([]);
  const [worldLoading, setWorldLoading] = useState(true);
  const [worldError, setWorldError] = useState<string | null>(null);
  const [currentProjectView, setCurrentProjectView] = useState<UserProjectView | null>(null);
  const [aiProposals, setAiProposals] = useState<AiTeamProposal[]>([]);
  const [projectViewUnavailable, setProjectViewUnavailable] = useState(false);
  const [aiRuntimeStatus, setAiRuntimeStatus] = useState<UserRuntimeStatus['aiChat'] | null>(null);
  const [missionBusy, setMissionBusy] = useState<string | null>(null);
  const [missionStatus, setMissionStatus] = useState('');
  const profile = useUser();
  const name = profile.status === 'ready' ? profile.name : profile.status === 'loading' ? '불러오는 중…' : '내 세계';
  const handle = profile.status === 'ready' ? `@${profile.handle}` : '사용자 데이터 대기';
  const growth = profile.growth;
  const timezone = profile.status === 'ready' ? profile.timezone : undefined;
  const refreshWorld = useCallback(async () => {
    setWorldLoading(true);
    setWorldError(null);
    try {
      const [{ projects: nextProjects }, { plans: nextPlans }, { items: nextReviews }, { events: nextActivity }] = await Promise.all([
        listUserProjects(),
        listLearningPlans(),
        listDueReviewItems(),
        listActivityEvents(),
      ]);
      const nextProjectView = nextProjects[0] ? await getUserProject(nextProjects[0].id).catch(() => null) : null;
      const nextAiProposals = nextProjects[0] && (nextProjects[0].teamMode === 'ai' || nextProjects[0].teamMode === 'mixed')
        ? await listAiTeamProposals(nextProjects[0].id).then(({ proposals }) => proposals).catch(() => [])
        : [];
      setProjects(nextProjects);
      setPlans(nextPlans);
      setDueReviews(nextReviews);
      setRecentActivity(nextActivity);
      setCurrentProjectView(nextProjectView);
      setAiProposals(nextAiProposals);
      setProjectViewUnavailable(Boolean(nextProjects[0] && !nextProjectView));
    } catch (error) {
      setWorldError(worldErrorMessage(error));
    } finally {
      setWorldLoading(false);
    }
  }, []);
  useEffect(() => { void refreshWorld(); }, [refreshWorld]);
  useEffect(() => {
    let active = true;
    void getRuntimeStatus().then(({ runtime }) => {
      if (active) setAiRuntimeStatus(runtime.aiChat);
    }).catch(() => {
      if (active) setAiRuntimeStatus(null);
    });
    return () => { active = false; };
  }, []);

  const currentProject = projects[0];
  const currentProjectRuntimeView = currentProjectView?.project.id === currentProject?.id ? currentProjectView : null;
  const pendingAiWork = currentProjectRuntimeView?.workRequests
    .filter((request) => request.status === 'queued' || request.status === 'waiting')
    .flatMap((request) => {
      const proposal = aiProposals.find((item) => item.status === 'accepted' && item.workRequestId === request.id);
      return proposal ? [{ proposal, request }] : [];
    }) ?? [];
  const activePlan = plans.find((plan) => plan.status === 'active') ?? plans[0];
  const missions = buildWorldMissions({ projectCount: projects.length, learningPlanCount: plans.length, dueReviewCount: dueReviews.length, recentActivityEvents: recentActivity });
  const aiRuntimeLabel = aiRuntimeStatus === 'ready' ? '개인 AI 준비됨' : aiRuntimeStatus === 'unavailable' ? '개인 AI 연결 대기' : '개인 AI 상태 확인 중';

  const recordMission = async (missionId: 'projects' | 'learning' | 'reviews') => {
    try {
      setMissionBusy(missionId);
      setMissionStatus('');
      await recordWorldMissionCompletion(missionId, profile.status === 'ready' ? profile.timezone : undefined);
      setMissionStatus('미션 완료 기록을 저장했습니다. 검증된 활동 근거나 XP로 표시하지 않습니다.');
      await refreshWorld();
    } catch (error) {
      setMissionStatus(userFacingError(error, '미션 완료 기록을 저장하지 못했습니다.'));
    } finally {
      setMissionBusy(null);
    }
  };

  return (
    <AppShell>
      <div className="min-h-screen" style={{ fontFamily: 'var(--font-body)' }}>
        {/* World header - character space */}
        <div className="relative overflow-hidden" style={{ height: 320 }}>
          <div className="absolute inset-0">
            <WorkroomBackground />
            <PersonalWorkshopEnvironmentAsset className="z-[1]" />
          </div>
          <div className="absolute inset-0 flex items-end">
            <div className="w-full px-8 pb-8 flex items-end justify-between">
              {/* Characters */}
              <div className="flex items-end gap-4">
                <div className="float-anim">
                  <UserCharacterAsset size={110}/>
                </div>
                <div className="float-anim" style={{ animationDelay: '1.2s' }}>
                  <AICompanionAsset size={90}/>
                </div>
                {/* AI speech bubble */}
                <div className="mb-8 px-4 py-2.5 rounded-2xl rounded-bl-sm shadow-lg text-sm font-semibold" style={{ background: 'white', color: '#0f1b35', maxWidth: 200, border: '2px solid #ede9fe' }}>
                  {aiRuntimeStatus === 'ready' ? <><Icon name="sparkles" size={15} /> {aiRuntimeLabel} · 오늘의 작업을 함께 살펴봐요.</> : <><Icon name="clock" size={15} /> {aiRuntimeLabel} · 저장된 기록부터 확인해 보세요.</>}
                    </div>

                  </div>

              {/* User info card */}
              <div className="rounded-2xl p-5 shadow-xl" style={{ background: 'rgba(255,255,255,0.92)', backdropFilter: 'blur(12px)', border: '2px solid rgba(186,232,255,0.6)', minWidth: 220 }}>
                <div className="flex items-center gap-3 mb-3">
                  <LevelBadge level={profile.level} size="lg"/>
                  <div>
                    <p className="font-black text-lg leading-tight" style={{ fontFamily: 'var(--font-display)', color: '#0f1b35' }}>{name}</p>
                    <p className="text-xs" style={{ color: '#64748b' }}>{handle}</p>
                  </div>
                </div>
                <XPBar current={profile.xp} max={profile.xpMax}/>
                <div className="mt-3 flex gap-2 flex-wrap">
                  <span className="text-xs px-2 py-1 rounded-full font-bold" style={{ background: '#fef3c7', color: '#92400e' }}>{growth ? `검증된 증거 ${growth.evidenceEventIds.length}건` : '성장 데이터 연결 대기'}</span>
                  {profile.interests.slice(0, 1).map((interest) => <span key={interest} className="text-xs px-2 py-1 rounded-full font-bold" style={{ background: '#d1fae5', color: '#065f46' }}>{interest}</span>)}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="px-6 md:px-8 py-6">
          {worldError && <div role="alert" className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border-2 border-rose-200 bg-rose-50 p-4 text-sm font-semibold text-rose-700"><span>{worldError}</span><button onClick={() => void refreshWorld()} className="rounded-lg bg-white px-3 py-2 text-xs font-bold text-rose-700">다시 불러오기</button></div>}
          {worldLoading && <p role="status" className="mb-5 text-sm text-slate-500">프로젝트와 학습 데이터를 불러오는 중…</p>}

          {/* Recent activity stays in the scrollable content area so a growing ledger cannot be clipped by the fixed world header. */}
          <section className="card-game mb-6 p-5" aria-label="최근 활동">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div><p className="text-sm font-bold" style={{ color: '#94a3b8' }}>최근 활동</p><p className="mt-1 text-xs" style={{ color: '#64748b' }}>내 계정에 실제로 저장된 활동 원장입니다.</p></div>
              <Link to="/activity" className="text-xs font-bold text-blue-600 no-underline">전체 활동 보기 →</Link>
            </div>
            {recentActivity.length === 0 ? <p className="mt-4 rounded-xl bg-slate-50 p-4 text-sm text-slate-500">아직 저장된 활동이 없습니다.</p> : <div className="mt-4 space-y-2">{recentActivity.slice().reverse().slice(0, 5).map((event) => <article key={event.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-100 bg-white p-3"><div><p className="text-sm font-bold text-slate-800">{event.eventType}</p><p className="mt-1 text-xs text-slate-400">{formatWorldDateTime(timezone, event.occurredAt)} · {event.sourceType}/{event.sourceId} · 행위자 {event.actorType}</p><Link to={`/activity?event=${encodeURIComponent(event.id)}`} className="mt-2 inline-block text-xs font-bold text-blue-600 no-underline">활동 상세 보기 →</Link></div><span className={`rounded-full px-2.5 py-1 text-xs font-bold ${event.verificationStatus === 'verified' ? 'bg-emerald-50 text-emerald-700' : event.verificationStatus === 'unknown' ? 'bg-amber-50 text-amber-700' : 'bg-slate-100 text-slate-600'}`}>{event.verificationStatus === 'verified' ? '검증됨' : event.verificationStatus === 'unknown' ? '확인 불가' : '미검증'}</span></article>)}</div>}
          </section>

          {/* Quick actions */}
          <div className="flex gap-3 mb-6 overflow-x-auto pb-1">
            <Link to="/projects" className="flex-shrink-0 px-4 py-2.5 rounded-xl font-bold text-sm text-white" style={{ background: 'linear-gradient(135deg, #3b82f6, #6366f1)', textDecoration: 'none' }}>
              <Icon name="bolt" size={16} /> 프로젝트 이어하기
            </Link>
            <Link to="/learning" className="flex-shrink-0 px-4 py-2.5 rounded-xl font-bold text-sm text-white" style={{ background: 'linear-gradient(135deg, #10b981, #0891b2)', textDecoration: 'none' }}>
              <Icon name="book" size={16} /> 오늘 학습하기
            </Link>
            <Link to="/ai-chat" className="flex-shrink-0 px-4 py-2.5 rounded-xl font-bold text-sm text-white" style={{ background: 'linear-gradient(135deg, #7c3aed, #6366f1)', textDecoration: 'none' }}>
              <Icon name="sparkles" size={16} /> 이설과 대화하기
            </Link>
          </div>

          {/* Tabs */}
          <div className="flex gap-2 mb-6">
            {[['overview','전체 현황'], ['missions','오늘의 미션'], ['achievements','업적']].map(([v, l]) => (
              <button key={v} onClick={() => setActiveTab(v as typeof activeTab)} className={`px-4 py-2 rounded-xl font-bold text-sm transition-all ${activeTab === v ? 'text-white' : ''}`} style={{ background: activeTab === v ? 'linear-gradient(135deg, #3b82f6, #6366f1)' : '#f0f9ff', color: activeTab === v ? 'white' : '#475569' }}>
                {l}
              </button>
            ))}
          </div>

          {activeTab === 'overview' && (
            <div className="grid md:grid-cols-3 gap-6">
              {/* Left: stats + recent project */}
              <div className="md:col-span-2 space-y-6">
                {/* Stats */}
                <div className="grid grid-cols-2 gap-4">
                  <StatCard icon="bolt" label="개발 성장" value={growth ? `${growth.stats.development} XP` : '—'} color="#6366f1" sub="검증된 프로젝트 기록"/>
                  <StatCard icon="book" label="학습 성장" value={growth ? `${growth.stats.learning} XP` : '—'} color="#10b981" sub="검증된 학습 기록"/>
                  <StatCard icon="users" label="협업 성장" value={growth ? `${growth.stats.collaboration} XP` : '—'} color="#f43f5e" sub="검증된 협업 기록"/>
                  <StatCard icon="rotate" label="꾸준함" value={growth ? `${growth.stats.consistency} XP` : '—'} color="#f59e0b" sub="검증된 연속 활동 기록"/>
                </div>

                {/* Current project */}
                <div>
                  <p className="text-sm font-bold mb-3" style={{ color: '#94a3b8' }}>최근 작업한 프로젝트</p>
                  {currentProject ? <div className="card-game p-5">
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <p className="font-bold text-base" style={{ fontFamily: 'var(--font-display)', color: '#0f1b35' }}>{currentProject.name}</p>
                        <p className="text-sm" style={{ color: '#64748b' }}>{currentProject.objective}</p>
                      </div>
                      <StatusBadge status={currentProjectRuntimeView ? projectRuntimeBadge(currentProjectRuntimeView.runtime.status) : projectViewUnavailable ? 'unknown' : 'pending'} />
                    </div>
                    <p className="mt-2 text-xs font-semibold text-slate-500">{projectRuntimeSummary(currentProjectRuntimeView, projectViewUnavailable)}</p>
                    <div className="flex flex-wrap gap-2 text-xs" style={{ color: '#64748b' }}><span className="rounded-full bg-blue-50 px-2 py-1 text-blue-700">{currentProject.purpose}</span><span className="rounded-full bg-violet-50 px-2 py-1 text-violet-700">{currentProject.teamMode}</span></div>
                    <div className="mt-4 flex gap-2"><Link to={`/projects/${currentProject.id}`} className="flex-1 py-2 rounded-xl text-center text-sm font-bold text-white" style={{ background: 'linear-gradient(135deg, #3b82f6, #6366f1)', textDecoration: 'none' }}>작업실 열기</Link><Link to="/projects" className="px-4 py-2 rounded-xl text-sm font-bold border-2 border-blue-200 text-blue-600" style={{ textDecoration: 'none' }}>전체 보기</Link></div>
                  </div> : <div className="card-game p-5"><p className="font-bold text-base" style={{ fontFamily: 'var(--font-display)', color: '#0f1b35' }}>아직 저장된 프로젝트가 없습니다.</p><p className="text-sm mt-2" style={{ color: '#64748b' }}>프로젝트 작업실에서 실제 사용자 프로젝트를 만들면 이곳에 표시됩니다.</p><Link to="/projects" className="mt-4 inline-block py-2 px-4 rounded-xl text-sm font-bold text-white" style={{ background: 'linear-gradient(135deg, #3b82f6, #6366f1)', textDecoration: 'none' }}>프로젝트 만들기</Link></div>}
                </div>

                <section aria-label="사용자 확인이 필요한 AI 작업">
                  <p className="text-sm font-bold mb-3" style={{ color: '#94a3b8' }}>사용자 확인이 필요한 AI 작업</p>
                  {pendingAiWork.length === 0 ? <div className="card-game p-5" style={{ borderColor: '#ddd6fe' }}><p className="font-bold" style={{ color: '#0f1b35' }}>확인을 기다리는 AI 작업이 없습니다.</p><p className="text-xs mt-1" style={{ color: '#64748b' }}>AI 제안으로 생성된 작업은 승인 후에도 실제 실행 전에 작업실에서 다시 확인합니다.</p></div> : <div className="space-y-3">{pendingAiWork.map(({ proposal, request }) => <article key={request.id} className="card-game p-5" style={{ borderColor: '#ddd6fe' }}><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-bold" style={{ color: '#0f1b35' }}>{proposal.title}</p><p className="text-sm mt-1" style={{ color: '#64748b' }}>{proposal.objective}</p></div><span className="rounded-full px-2.5 py-1 text-xs font-bold" style={{ background: request.status === 'waiting' ? '#fef3c7' : '#ede9fe', color: request.status === 'waiting' ? '#92400e' : '#6d28d9' }}>{request.status === 'waiting' ? '재개 확인 대기' : '실행 확인 대기'}</span></div><p className="mt-3 text-xs" style={{ color: '#64748b' }}>AI 제안이 Work Request로 저장되었습니다. 아직 Runtime/Agent에 실행 요청을 보내지 않았습니다.</p><Link to={`/projects/${currentProject?.id ?? proposal.projectId}`} className="mt-4 inline-flex rounded-xl px-4 py-2 text-sm font-bold text-white no-underline" style={{ background: '#7c3aed' }}>작업실에서 확인 →</Link></article>)}</div>}
                </section>

                {/* Today's learning */}
                <div>
                  <p className="text-sm font-bold mb-3" style={{ color: '#94a3b8' }}>오늘의 학습</p>
                  {activePlan ? <div className="card-game p-5" style={{ borderColor: '#a7f3d0' }}>
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{ background: '#d1fae5', color: '#047857' }}><Icon name="book" size={25} /></div>
                      <div className="flex-1">
                        <p className="font-bold" style={{ color: '#0f1b35' }}>{activePlan.title}</p>
                        <p className="text-xs mt-1" style={{ color: '#64748b' }}>{activePlan.description}</p>
                        <p className="text-xs mt-2 font-semibold" style={{ color: '#047857' }}>목표 {activePlan.goals.length}개 · 도래한 복습 {dueReviews.length}개</p>
                      </div>
                      <Link to="/learning/session" className="px-3 py-2 rounded-xl text-xs font-bold text-white" style={{ background: 'linear-gradient(135deg, #10b981, #0891b2)', textDecoration: 'none' }}>
                        학습 공간
                      </Link>
                    </div>
                  </div> : <div className="card-game p-5" style={{ borderColor: '#a7f3d0' }}><p className="font-bold" style={{ color: '#0f1b35' }}>활성 학습 계획이 없습니다.</p><p className="text-xs mt-1" style={{ color: '#64748b' }}>학습 공간에서 계획을 저장하면 오늘의 학습으로 연결됩니다.</p><Link to="/learning" className="mt-3 inline-block px-3 py-2 rounded-xl text-xs font-bold text-white" style={{ background: 'linear-gradient(135deg, #10b981, #0891b2)', textDecoration: 'none' }}>학습 계획 만들기</Link></div>}
                </div>
              </div>

              {/* Right: zones */}
              <div className="space-y-3">
                <p className="text-sm font-bold" style={{ color: '#94a3b8' }}>이동할 공간</p>
                {zones.map(z => (
                  <Link key={z.path} to={z.path} className="flex items-center gap-3 p-3.5 rounded-2xl transition-all hover:scale-102" style={{ background: z.bg, textDecoration: 'none', border: `2px solid ${z.color}20` }}>
                    <Icon name={z.icon} size={26} className="shrink-0" />
                    <div>
                      <p className="font-bold text-sm" style={{ color: '#0f1b35' }}>{z.label}</p>
                      <p className="text-xs" style={{ color: '#64748b' }}>{z.desc}</p>
                    </div>
                    <span className="ml-auto text-xs" style={{ color: z.color }}>→</span>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'missions' && (
            <div className="max-w-2xl space-y-3">
              {missionStatus && <p role="status" className="rounded-xl bg-blue-50 p-3 text-sm font-semibold text-blue-700">{missionStatus}</p>}
              {missions.map((mission) => {
                const recorded = mission.state === 'recorded';
                const userRecorded = mission.userActionState === 'recorded';
                return <article key={mission.id} className="card-game flex items-center gap-4 p-5"><Icon name={mission.icon} size={26} /><Link to={mission.href} className="min-w-0 flex-1 no-underline" style={{ textDecoration: 'none' }}><p className="font-bold" style={{ color: '#0f1b35' }}>{mission.title}</p><p className="mt-1 text-sm" style={{ color: '#64748b' }}>{mission.description}</p><p className="mt-2 text-xs font-semibold" style={{ color: mission.evidenceCount > 0 ? '#047857' : '#64748b' }}>{mission.evidenceCount > 0 ? `검증된 활동 근거 ${mission.evidenceCount}건${mission.lastRecordedAt ? ` · ${formatWorldDate(timezone, mission.lastRecordedAt)}` : ''}` : '연결된 검증 근거 없음'}</p>{userRecorded && <p className="mt-1 text-xs font-semibold text-blue-700">사용자 완료 기록됨{mission.lastUserActionAt ? ` · ${formatWorldDate(timezone, mission.lastUserActionAt)}` : ''} · 검증/XP 제외</p>}</Link><div className="flex flex-col items-end gap-2"><span className="rounded-full px-3 py-1 text-xs font-bold" style={{ background: recorded ? '#e0f2fe' : '#fef3c7', color: recorded ? '#075985' : '#92400e' }}>{recorded ? '저장된 기록' : '다음 행동'}</span><button type="button" data-mission-id={mission.id} aria-label={`미션 완료 기록: ${mission.title}`} disabled={missionBusy !== null} onClick={() => void recordMission(mission.id)} className="rounded-lg border-2 border-blue-200 bg-white px-3 py-1.5 text-xs font-bold text-blue-600 disabled:opacity-50">{missionBusy === mission.id ? '저장 중…' : userRecorded ? '다시 기록' : '완료 기록'}</button></div></article>;
              })}
            </div>
          )}

          {activeTab === 'achievements' && (
            <div className="max-w-2xl">
              <p className="text-sm font-bold mb-4" style={{ color: '#94a3b8' }}>검증된 활동 업적</p>
              {growth ? <div className="space-y-4">
                <div className="card-game p-5">
                  <p className="font-bold" style={{ color: '#0f1b35' }}>검증된 증거 {growth.evidenceEventIds.length}건</p>
                  <p className="mt-2 text-sm" style={{ color: '#64748b' }}>사용자·AI·시스템 기여가 구분된 성장 기록입니다.</p>
                  <div className="mt-4 grid grid-cols-3 gap-2 text-xs"><span className="rounded-lg bg-blue-50 p-2 text-blue-700">사용자 {growth.actorBreakdown.user}</span><span className="rounded-lg bg-violet-50 p-2 text-violet-700">AI {growth.actorBreakdown.ai}</span><span className="rounded-lg bg-slate-100 p-2 text-slate-600">시스템 {growth.actorBreakdown.system}</span></div>
                </div>
                {growth.achievements.length > 0 ? <div className="space-y-3" aria-label="획득한 업적">{growth.achievements.map((achievement) => <div key={achievement.id} className="card-game flex items-start gap-3 p-4"><span className="rounded-xl bg-amber-100 px-3 py-2 text-amber-700" aria-hidden="true"><Icon name="sparkles" size={20} /></span><div><p className="font-bold" style={{ color: '#0f1b35' }}>{achievement.title}</p><p className="mt-1 text-sm" style={{ color: '#64748b' }}>{achievement.description}</p><p className="mt-2 text-xs font-semibold" style={{ color: '#92400e' }}>근거 증거 {achievement.evidenceEventIds.length}건 · {achievement.badgeKey}</p></div></div>)}</div> : <div className="card-game p-6 text-center"><p className="text-sm" style={{ color: '#64748b' }}>아직 획득한 검증 업적이 없습니다. 프로젝트·학습·협업 기록을 실제로 남겨보세요.</p></div>}
                <div className="grid grid-cols-2 gap-3"><StatCard icon="bolt" label="개발" value={`${growth.stats.development} XP`} color="#6366f1" sub="검증 기록"/><StatCard icon="book" label="학습" value={`${growth.stats.learning} XP`} color="#10b981" sub="검증 기록"/><StatCard icon="users" label="협업" value={`${growth.stats.collaboration} XP`} color="#f43f5e" sub="검증 기록"/><StatCard icon="rotate" label="꾸준함" value={`${growth.stats.consistency} XP`} color="#f59e0b" sub="검증 기록"/></div>
              </div> : <div className="card-game p-6 text-center"><p className="text-sm" style={{ color: '#64748b' }}>검증된 활동 증거가 아직 없습니다. 프로젝트·학습·협업 기록을 실제로 남겨보세요.</p></div>}
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
