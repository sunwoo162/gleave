import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import { AppShell } from '../components/Navigation';
import { Icon, type IconName } from '../components/Icon';
import { changePassword, exportActivity, getAiAgentProfile, getMe, getRuntimeStatus, getSettings, getUserIntegrations, updateAiAgentProfile, updateSettings, type AiAgentProfile, type UserIntegration, type UserIntegrationProvider, type UserRuntimeStatus, type UserSettings, UserApiError } from '../api/userApi';
import { signOut } from '../store/userStore';
import { useUser } from '../store/useUser';
import { userFacingError } from '../errorMessage';

const sections = ['계정', '캐릭터', 'AI 설정', '알림', '개인정보', '연동 환경'];
const notificationControls = [
  { key: 'aiDone', label: 'AI 작업 완료 알림', available: true },
  { key: 'teamInvite', label: '팀 초대 및 지원 알림', available: true },
  { key: 'newMessage', label: '새 메시지 알림', available: true },
  { key: 'achieve', label: '업적 달성 알림', available: true },
  { key: 'weekly', label: '주간 활동 요약', available: false },
] as const;

function Integrations({ runtimeStatus, settings, integrationStatus, onToggle }: { runtimeStatus: UserRuntimeStatus | null; settings: UserSettings | null; integrationStatus: UserIntegration[] | null; onToggle: (provider: UserIntegrationProvider) => void }) {
  const runtimeState = runtimeStatus?.state ?? 'unknown';
  const runtimeBadge = runtimeState === 'ready'
    ? { label: 'Runtime 준비됨', background: '#dcfce7', color: '#166534' }
    : runtimeState === 'blocked'
      ? { label: 'Runtime 확인 필요', background: '#fef3c7', color: '#92400e' }
      : runtimeState === 'disabled'
        ? { label: 'Runtime 미연결', background: '#f1f5f9', color: '#64748b' }
        : { label: '상태 확인 필요', background: '#fef3c7', color: '#92400e' };
  const aiChatBadge = runtimeStatus?.aiChat === 'ready'
    ? { label: '개인 AI 준비됨', background: '#dcfce7', color: '#166534' }
    : runtimeStatus?.aiChat === 'unavailable'
      ? { label: '개인 AI 미연결', background: '#f1f5f9', color: '#64748b' }
      : { label: '개인 AI 상태 확인 필요', background: '#fef3c7', color: '#92400e' };
  const aiTeamBadge = runtimeStatus?.aiTeam === 'ready'
    ? { label: 'AI 팀 준비됨', background: '#dcfce7', color: '#166534' }
    : runtimeStatus?.aiTeam === 'unavailable'
      ? { label: 'AI 팀 미연결', background: '#f1f5f9', color: '#64748b' }
      : { label: 'AI 팀 상태 확인 필요', background: '#fef3c7', color: '#92400e' };
  const learningAiBadge = runtimeStatus?.learningAi === 'ready'
    ? { label: '학습 AI 준비됨', background: '#dcfce7', color: '#166534' }
    : runtimeStatus?.learningAi === 'unavailable'
      ? { label: '학습 AI 미연결', background: '#f1f5f9', color: '#64748b' }
      : { label: '학습 AI 상태 확인 필요', background: '#fef3c7', color: '#92400e' };
  const agentBadge = runtimeStatus?.agent === 'ready'
    ? { label: 'Agent 준비됨', background: '#dcfce7', color: '#166534' }
    : { label: 'Agent 미연결', background: '#f1f5f9', color: '#64748b' };
  const runtimeDescription = runtimeStatus?.projectExecution === 'ready'
    ? runtimeStatus.agent === 'ready' ? '로컬 실행 capability와 Desktop Agent가 준비되어 있어요' : '로컬 실행 capability는 준비됐지만 Desktop Agent를 기다리는 중이에요'
    : '로컬에서 코드를 실행하기 위한 Desktop Agent';
  const integrations: Array<{ name: string; desc: string; icon: IconName; status: string; provider?: UserIntegrationProvider; badge?: { label: string; background: string; color: string }; agentBadge?: { label: string; background: string; color: string } }> = [
    { name: 'Runtime 실행 환경', desc: runtimeDescription, icon: 'monitor' as IconName, status: runtimeState, badge: runtimeBadge, agentBadge },
    { name: '개인 AI Runtime', desc: runtimeStatus?.aiChat === 'ready' ? '개인 AI 답변 capability가 준비되어 있어요' : '개인 AI 답변을 위한 로컬 dispatcher', icon: 'sparkles' as IconName, status: runtimeStatus?.aiChat ?? 'unknown', badge: aiChatBadge },
    { name: 'AI 팀 Runtime', desc: runtimeStatus?.aiTeam === 'ready' ? 'AI 팀 제안과 기술 토론 capability가 준비되어 있어요' : 'AI 팀 제안과 기술 토론을 위한 로컬 dispatcher', icon: 'users' as IconName, status: runtimeStatus?.aiTeam ?? 'unknown', badge: aiTeamBadge },
    { name: '학습 AI Runtime', desc: runtimeStatus?.learningAi === 'ready' ? '학습 계획·콘텐츠·피드백 capability가 준비되어 있어요' : '학습 계획·콘텐츠·피드백을 위한 로컬 dispatcher', icon: 'book' as IconName, status: runtimeStatus?.learningAi ?? 'unknown', badge: learningAiBadge },
    { name: 'Calendar', desc: '학습·프로젝트 일정을 기존 캘린더와 연결해요', icon: 'calendar' as IconName, status: 'unavailable', provider: 'calendar' },
    { name: 'GitHub', desc: '프로젝트를 GitHub에 연동하고 코드를 관리해요', icon: 'code' as IconName, status: 'unavailable', provider: 'github' },
    { name: 'ChatGPT Web', desc: 'ChatGPT 웹 인터페이스 연결', icon: 'robot' as IconName, status: 'unavailable' },
    { name: 'Discord', desc: '팀 알림을 Discord로 받아요', icon: 'message' as IconName, status: 'unavailable', provider: 'discord' },
    { name: 'Notion', desc: '학습 노트를 Notion에 동기화', icon: 'fileText' as IconName, status: 'coming' },
    { name: 'Vercel', desc: '프로젝트를 바로 배포해요', icon: 'rocket' as IconName, status: 'coming' },
  ];

  return (
    <div className="space-y-3">
      {integrations.map(i => (
        <div key={i.name} className="card-game p-4 flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{ background: '#f8fafc' }}><Icon name={i.icon} size={24} /></div>
          <div className="flex-1">
            <p className="font-bold text-sm" style={{ color: '#0f1b35' }}>{i.name}</p>
            <p className="text-xs" style={{ color: '#64748b' }}>{i.desc}</p>
          </div>
          <div className="flex flex-col items-end gap-2">
            {i.name === 'Runtime 실행 환경' && (
              <div className="flex flex-wrap justify-end gap-1">
                <span className="text-xs font-bold px-2 py-1 rounded-full" style={{ background: i.badge?.background, color: i.badge?.color }}>{i.badge?.label}</span>
                <span className="text-xs font-bold px-2 py-1 rounded-full" style={{ background: i.agentBadge?.background, color: i.agentBadge?.color }}>{i.agentBadge?.label}</span>
              </div>
            )}
            {i.name === '개인 AI Runtime' && (
              <span className="text-xs font-bold px-2 py-1 rounded-full" style={{ background: i.badge?.background, color: i.badge?.color }}>{i.badge?.label}</span>
            )}
            {i.name === 'AI 팀 Runtime' && (
              <span className="text-xs font-bold px-2 py-1 rounded-full" style={{ background: i.badge?.background, color: i.badge?.color }}>{i.badge?.label}</span>
            )}
            {i.name === '학습 AI Runtime' && (
              <span className="text-xs font-bold px-2 py-1 rounded-full" style={{ background: i.badge?.background, color: i.badge?.color }}>{i.badge?.label}</span>
            )}
            {i.provider && (
              <>
                <span className="text-xs font-bold px-2 py-1 rounded-full" style={{ background: integrationStatus?.find((item) => item.provider === i.provider)?.configured ? '#dcfce7' : '#f1f5f9', color: integrationStatus?.find((item) => item.provider === i.provider)?.configured ? '#166534' : '#64748b' }}>{integrationStatus?.find((item) => item.provider === i.provider)?.configured ? '어댑터 준비됨' : '연동 API 미연결'}</span>
                <button type="button" onClick={() => onToggle(i.provider!)} disabled={!settings} role="switch" aria-checked={settings?.integrations[i.provider!] ?? false} aria-label={`${i.name} 외부 전달 동의`} className="text-xs font-bold text-blue-600 disabled:cursor-not-allowed disabled:opacity-50">외부 전달 동의: {settings?.integrations[i.provider!] ? '켜짐' : '꺼짐'}</button>
              </>
            )}
            {!i.provider && i.status === 'unavailable' && (
              <span className="text-xs font-bold px-2 py-1 rounded-full" style={{ background: '#f1f5f9', color: '#64748b' }}>연동 API 미연결</span>
            )}
            {i.status === 'coming' && (
              <span className="text-xs font-bold px-2 py-1 rounded-full" style={{ background: '#f1f5f9', color: '#94a3b8' }}>준비 중</span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function downloadActivity(filename: string, content: string): void {
  const blob = new Blob([content], { type: filename.endsWith('.json') ? 'application/json' : 'text/markdown' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export default function Settings() {
  const location = useLocation();
  const navigate = useNavigate();
  const profile = useUser();
  const [section, setSection] = useState(() => location.pathname === '/integrations' ? '연동 환경' : '계정');
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [runtimeStatus, setRuntimeStatus] = useState<UserRuntimeStatus | null>(null);
  const [integrationStatus, setIntegrationStatus] = useState<UserIntegration[] | null>(null);
  const [settingsError, setSettingsError] = useState('');
  const [settingsStatus, setSettingsStatus] = useState('');
  const [settingsBusy, setSettingsBusy] = useState(false);
  const [notifSettings, setNotifSettings] = useState({
    aiDone: true, teamInvite: true, newMessage: true, achieve: true, weekly: false,
  });
  const [aiAccess, setAiAccess] = useState({
    memory: true, projectFiles: true, learningHistory: true, activityTimeline: true, teamDocs: false,
  });
  const [aiApproval, setAiApproval] = useState({
    fileWrite: true, packageInstall: true, buildRun: false, externalApi: true,
  });
  const [privacySettings, setPrivacySettings] = useState({
    growthInfo: true, projectList: true, learningHistory: false,
  });
  const [agentProfile, setAgentProfile] = useState<AiAgentProfile | null>(null);
  const [agentBusy, setAgentBusy] = useState(false);
  const [passwordChange, setPasswordChange] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const settingsRef = useRef<UserSettings | null>(null);
  const settingsLoadRef = useRef<Promise<UserSettings> | null>(null);
  const settingsQueueRef = useRef(Promise.resolve());

  useEffect(() => {
    const settingsLoad = Promise.all([getMe(), getSettings(), getAiAgentProfile()]).then(([, result, agentResult]) => {
      setSettings(result.settings);
      settingsRef.current = result.settings;
      setAiAccess(result.settings.aiAccess);
      setAiApproval(result.settings.aiApproval);
      setNotifSettings(result.settings.notifications);
      setPrivacySettings(result.settings.privacy);
      setAgentProfile(agentResult.profile);
      return result.settings;
    }).catch((error) => {
      setSettingsError(userFacingError(error, '설정을 불러오지 못했습니다.'));
      throw error;
    });
    settingsLoadRef.current = settingsLoad;
    void settingsLoad.catch(() => undefined);
  }, []);

  useEffect(() => {
    let active = true;
    void getUserIntegrations().then((result) => { if (active) setIntegrationStatus(result.integrations); }).catch(() => { if (active) setIntegrationStatus(null); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    let active = true;
    const refreshRuntimeStatus = (): void => {
      if (document.visibilityState === 'hidden') return;
      void getRuntimeStatus()
        .then(result => { if (active) setRuntimeStatus(result.runtime); })
        .catch(() => { if (active) setRuntimeStatus(null); });
    };
    const onVisibilityChange = (): void => {
      if (document.visibilityState === 'visible') refreshRuntimeStatus();
    };
    const interval = window.setInterval(refreshRuntimeStatus, 10_000);
    document.addEventListener('visibilitychange', onVisibilityChange);
    refreshRuntimeStatus();
    return () => {
      active = false;
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, []);

  async function saveAgentProfile(): Promise<void> {
    if (!agentProfile || agentBusy) return;
    setAgentBusy(true); setSettingsError(''); setSettingsStatus('');
    try {
      const result = await updateAiAgentProfile({
        name: agentProfile.name,
        avatarUrl: agentProfile.avatarUrl,
        personality: agentProfile.personality,
        tone: agentProfile.tone,
        role: agentProfile.role,
      });
      setAgentProfile(result.profile);
      setSettingsStatus('개인 AI 프로필을 저장했습니다.');
    } catch (error) {
      setSettingsError(userFacingError(error, '개인 AI 프로필을 저장하지 못했습니다.'));
    } finally { setAgentBusy(false); }
  }

  async function submitPasswordChange(): Promise<void> {
    if (settingsBusy) return;
    if (!passwordChange.currentPassword || !passwordChange.newPassword || !passwordChange.confirmPassword) {
      setSettingsError('현재 비밀번호와 새 비밀번호를 모두 입력하세요.');
      return;
    }
    if (passwordChange.newPassword !== passwordChange.confirmPassword) {
      setSettingsError('새 비밀번호 확인이 일치하지 않습니다.');
      return;
    }
    setSettingsBusy(true); setSettingsError(''); setSettingsStatus('');
    try {
      await changePassword({ currentPassword: passwordChange.currentPassword, newPassword: passwordChange.newPassword });
      await signOut();
      navigate('/login', { replace: true });
    } catch (error) {
      setSettingsError(userFacingError(error, '비밀번호를 변경하지 못했습니다.'));
    } finally { setSettingsBusy(false); }
  }

  async function toggleSetting<G extends 'aiAccess' | 'aiApproval' | 'notifications' | 'privacy' | 'integrations'>(group: G, key: keyof UserSettings[G]): Promise<void> {
    let currentSettings = settingsRef.current ?? settings;
    if (!currentSettings && settingsLoadRef.current) {
      try { currentSettings = await settingsLoadRef.current; } catch { return; }
    }
    const current = currentSettings?.[group];
    if (!current || typeof current[key] !== 'boolean') return;
    const value = !current[key];
    const optimisticSettings = { ...currentSettings, [group]: { ...current, [key]: value } } as UserSettings;
    settingsRef.current = optimisticSettings;
    setSettings(optimisticSettings);
    setAiAccess(optimisticSettings.aiAccess); setAiApproval(optimisticSettings.aiApproval);
    setNotifSettings(optimisticSettings.notifications); setPrivacySettings(optimisticSettings.privacy);
    setSettingsBusy(true); setSettingsError(''); setSettingsStatus('');
    let queuedOperation!: Promise<void>;
    const operation = async (): Promise<void> => {
      try {
        const result = await updateSettings({ [group]: { [key]: value } } as Partial<Pick<UserSettings, G>>);
        settingsRef.current = result.settings;
        setSettings(result.settings);
        setAiAccess(result.settings.aiAccess); setAiApproval(result.settings.aiApproval);
        setNotifSettings(result.settings.notifications); setPrivacySettings(result.settings.privacy);
        if (settingsQueueRef.current === queuedOperation) setSettingsStatus('설정을 저장했습니다.');
      } catch (error) {
        if (settingsQueueRef.current === queuedOperation) setSettingsError(userFacingError(error, '설정 저장에 실패했습니다.'));
      } finally {
        if (settingsQueueRef.current === queuedOperation) setSettingsBusy(false);
      }
    };
    queuedOperation = settingsQueueRef.current.then(operation, operation);
    settingsQueueRef.current = queuedOperation;
    await queuedOperation;
  }

  async function downloadActivityExport(format: 'json' | 'markdown'): Promise<void> {
    if (settingsBusy) return;
    setSettingsBusy(true); setSettingsError(''); setSettingsStatus('');
    try {
      const result = await exportActivity(format);
      downloadActivity(result.filename, result.content);
      setSettingsStatus(format === 'json' ? '활동 기록 내보내기를 시작했습니다.' : 'Markdown 활동 기록 내보내기를 시작했습니다.');
    } catch (error) {
      setSettingsError(userFacingError(error, '활동 기록을 내보내지 못했습니다.'));
    } finally { setSettingsBusy(false); }
  }

  return (
    <AppShell>
      <div className="flex min-h-screen" style={{ fontFamily: 'var(--font-body)' }}>
        {/* Settings nav */}
        <div className="w-56 border-r-2 border-blue-100 bg-white p-4 flex-shrink-0">
          <p className="text-xs font-bold mb-3" style={{ color: '#94a3b8' }}>설정</p>
          <nav className="space-y-0.5">
            {sections.map(s => (
              <button key={s} onClick={() => setSection(s)} className="w-full text-left px-3 py-2.5 rounded-xl text-sm font-semibold transition-all" style={{ background: section === s ? 'linear-gradient(135deg, #dbeafe, #ede9fe)' : 'transparent', color: section === s ? '#2563eb' : '#475569' }}>
                {s}
              </button>
            ))}
            <div className="mt-4 pt-4 border-t border-blue-100">
              <button onClick={() => { void signOut().finally(() => navigate('/login')); }} className="w-full text-left px-3 py-2.5 rounded-xl text-sm font-semibold" style={{ color: '#ef4444' }}>로그아웃</button>
            </div>
          </nav>
        </div>

        {/* Settings content */}
        <div className="flex-1 p-8 max-w-2xl">
          <h2 className="text-2xl font-black mb-6" style={{ fontFamily: 'var(--font-display)', color: '#0f1b35' }}>{section}</h2>
          {settingsError && <p role="alert" className="mb-4 rounded-xl bg-rose-50 p-4 text-sm text-rose-700">{settingsError}</p>}
          {settingsStatus && <p role="status" className="mb-4 rounded-xl bg-emerald-50 p-4 text-sm text-emerald-700">{settingsStatus}</p>}

          {section === '계정' && (
            <div className="space-y-5">
              <div className="card-game p-5">
                <p className="font-bold text-sm mb-4" style={{ color: '#0f1b35' }}>기본 정보</p>
                <div className="space-y-4">
                  {[
                    { label: '사용자 ID', value: profile.id || '불러오는 중…', type: 'text' },
                    { label: '이메일', value: profile.email || '불러오는 중…', type: 'email' },
                    { label: '표시 이름', value: profile.name || '불러오는 중…', type: 'text' },
                  ].map(f => (
                    <div key={f.label}>
                      <label className="block text-xs font-bold mb-1" style={{ color: '#94a3b8' }}>{f.label}</label>
                      <input readOnly aria-readonly="true" value={f.value} type={f.type} className="w-full px-3 py-2.5 rounded-xl border-2 outline-none text-sm bg-slate-50" style={{ border: '2px solid #e0f4ff' }}/>
                    </div>
                  ))}
                  <p className="text-xs" style={{ color: '#64748b' }}>계정 식별자와 이메일은 인증 서비스가 관리합니다. 표시 이름은 내 세계에서 변경할 수 있습니다.</p>
                </div>
                <Link to="/profile" className="mt-4 inline-flex rounded-xl border-2 border-blue-100 px-4 py-2 text-sm font-bold text-blue-600 no-underline">공개 프로필 편집</Link>
              </div>
              <div className="card-game p-5">
                <p className="font-bold text-sm mb-3" style={{ color: '#0f1b35' }}>보안</p>
                <p className="text-xs mb-4" style={{ color: '#64748b' }}>비밀번호를 바꾸면 현재 계정의 기존 세션이 모두 종료되고 다시 로그인해야 합니다.</p>
                <div className="space-y-3">
                  <label className="block text-xs font-bold text-slate-600">현재 비밀번호<input aria-label="현재 비밀번호" type="password" autoComplete="current-password" value={passwordChange.currentPassword} onChange={(event) => setPasswordChange({ ...passwordChange, currentPassword: event.target.value })} className="mt-1 w-full rounded-xl border-2 border-blue-100 px-3 py-2.5 text-sm" /></label>
                  <label className="block text-xs font-bold text-slate-600">새 비밀번호<input aria-label="새 비밀번호" type="password" autoComplete="new-password" minLength={8} value={passwordChange.newPassword} onChange={(event) => setPasswordChange({ ...passwordChange, newPassword: event.target.value })} className="mt-1 w-full rounded-xl border-2 border-blue-100 px-3 py-2.5 text-sm" /></label>
                  <label className="block text-xs font-bold text-slate-600">새 비밀번호 확인<input aria-label="새 비밀번호 확인" type="password" autoComplete="new-password" minLength={8} value={passwordChange.confirmPassword} onChange={(event) => setPasswordChange({ ...passwordChange, confirmPassword: event.target.value })} className="mt-1 w-full rounded-xl border-2 border-blue-100 px-3 py-2.5 text-sm" /></label>
                  <button type="button" onClick={() => void submitPasswordChange()} disabled={settingsBusy} className="px-4 py-2.5 rounded-xl text-sm font-bold text-white disabled:opacity-40" style={{ background: '#3b82f6' }}>{settingsBusy ? '변경 중…' : '비밀번호 변경'}</button>
                </div>
              </div>
            </div>
          )}

          {section === 'AI 설정' && (
            <div className="space-y-5">
              <div className="card-game p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-bold text-sm mb-1" style={{ color: '#0f1b35' }}>AI 프로필</p>
                    <p className="text-xs" style={{ color: '#64748b' }}>이설은 통칭이고, 실제 이름과 성격은 사용자마다 다르게 설정할 수 있어요.</p>
                  </div>
                  <span className="rounded-full bg-violet-50 px-2.5 py-1 text-xs font-bold text-violet-700">NPC</span>
                </div>
                {agentProfile ? <div className="mt-4 space-y-3">
                  <label className="block text-xs font-bold text-slate-600">에이전트 이름<input aria-label="에이전트 이름" value={agentProfile.name} onChange={(event) => setAgentProfile({ ...agentProfile, name: event.target.value })} maxLength={40} className="mt-1 w-full rounded-xl border-2 border-violet-100 px-3 py-2.5 text-sm" /></label>
                  <label className="block text-xs font-bold text-slate-600">프로필 이미지 URL<input aria-label="프로필 이미지 URL" value={agentProfile.avatarUrl} onChange={(event) => setAgentProfile({ ...agentProfile, avatarUrl: event.target.value })} placeholder="https://..." className="mt-1 w-full rounded-xl border-2 border-violet-100 px-3 py-2.5 text-sm" /></label>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="block text-xs font-bold text-slate-600">성격<textarea aria-label="AI 성격" value={agentProfile.personality} onChange={(event) => setAgentProfile({ ...agentProfile, personality: event.target.value })} maxLength={500} rows={3} className="mt-1 w-full rounded-xl border-2 border-violet-100 px-3 py-2.5 text-sm" /></label>
                    <label className="block text-xs font-bold text-slate-600">말투<textarea aria-label="AI 말투" value={agentProfile.tone} onChange={(event) => setAgentProfile({ ...agentProfile, tone: event.target.value })} maxLength={200} rows={3} className="mt-1 w-full rounded-xl border-2 border-violet-100 px-3 py-2.5 text-sm" /></label>
                  </div>
                  <label className="block text-xs font-bold text-slate-600">역할<input aria-label="AI 역할" value={agentProfile.role} onChange={(event) => setAgentProfile({ ...agentProfile, role: event.target.value })} maxLength={200} className="mt-1 w-full rounded-xl border-2 border-violet-100 px-3 py-2.5 text-sm" /></label>
                  <button type="button" onClick={() => void saveAgentProfile()} disabled={agentBusy || !agentProfile.name.trim()} className="rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-40">{agentBusy ? '저장 중…' : 'AI 프로필 저장'}</button>
                </div> : <p className="mt-4 text-sm text-slate-500">AI 프로필을 불러오는 중…</p>}
              </div>
              <div className="card-game p-5">
                <p className="font-bold text-sm mb-1" style={{ color: '#0f1b35' }}>AI 이설의 데이터 접근 권한</p>
                <p className="text-xs mb-4" style={{ color: '#64748b' }}>AI가 참조할 수 있는 정보를 직접 설정해요</p>
                <Link to="/memory" className="mb-4 flex items-center gap-2 rounded-xl bg-violet-50 p-3 text-xs font-bold text-violet-700 no-underline"><Icon name="brain" size={15} /> 개인 기억 보관함에서 저장된 맥락을 관리하기 →</Link>
                <div className="space-y-3">
                      {([
                        { key: 'memory', label: '개인 기억 참조', desc: '개인 기억 보관함의 맥락을 AI 이설이 참고해요' },
                        { key: 'projectFiles', label: '내 프로젝트 파일 접근', desc: '코드 작성 시 기존 프로젝트 파일을 참조해요' },
                    { key: 'learningHistory', label: '학습 기록 참조', desc: '학습 이력을 기반으로 더 잘 맞는 설명을 제공해요' },
                    { key: 'activityTimeline', label: '활동 타임라인 참조', desc: '이전 활동을 기억하고 맥락에 맞게 도와드려요' },
                    { key: 'teamDocs', label: '팀 공유 문서 접근', desc: '팀 프로젝트에서 공유 문서를 참조해요' },
                  ] as const).map(item => (
                    <div key={item.key} className="flex items-start justify-between p-3 rounded-xl" style={{ background: '#f8fafc' }}>
                      <div className="flex-1">
                        <p className="text-sm font-semibold" style={{ color: '#0f1b35' }}>{item.label}</p>
                        <p className="text-xs" style={{ color: '#64748b' }}>{item.desc}</p>
                      </div>
                      <button
                        onClick={() => void toggleSetting('aiAccess', item.key)}
                        className="w-10 h-6 rounded-full relative cursor-pointer ml-4 flex-shrink-0 transition-all"
                        style={{ background: aiAccess[item.key] ? '#3b82f6' : '#e2e8f0', border: 'none' }}
                        role="switch"
                        aria-checked={aiAccess[item.key]}
                        aria-label={item.label}
                      >
                        <div className="w-5 h-5 rounded-full bg-white absolute top-0.5 transition-all" style={{ left: aiAccess[item.key] ? '18px' : '2px', boxShadow: '0 1px 4px rgba(0,0,0,0.2)' }}/>
                      </button>
                    </div>
                  ))}
                </div>
              </div>
              <div className="card-game p-5">
                <p className="font-bold text-sm mb-1" style={{ color: '#0f1b35' }}>실행 승인 설정</p>
                <p className="text-xs mb-4" style={{ color: '#64748b' }}>AI가 실제 코드를 실행하거나 파일을 수정하기 전에 승인을 요청할지 설정해요</p>
                <div className="space-y-2">
                  {([
                    { key: 'fileWrite', label: '파일 생성/수정 전 승인' },
                    { key: 'packageInstall', label: '패키지 설치 전 승인' },
                    { key: 'buildRun', label: '빌드 실행 전 승인' },
                    { key: 'externalApi', label: '외부 API 요청 전 승인' },
                  ] as const).map(item => (
                    <div key={item.key} className="flex items-center justify-between py-2">
                      <span className="text-sm" style={{ color: '#0f1b35' }}>{item.label}</span>
                      <button
                        onClick={() => void toggleSetting('aiApproval', item.key)}
                        className="w-10 h-6 rounded-full relative cursor-pointer transition-all"
                        style={{ background: aiApproval[item.key] ? '#3b82f6' : '#e2e8f0', border: 'none' }}
                        role="switch"
                        aria-checked={aiApproval[item.key]}
                        aria-label={item.label}
                      >
                        <div className="w-5 h-5 rounded-full bg-white absolute top-0.5 transition-all" style={{ left: aiApproval[item.key] ? '18px' : '2px', boxShadow: '0 1px 4px rgba(0,0,0,0.2)' }}/>
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {section === '알림' && (
            <div className="card-game p-5">
              <p className="font-bold text-sm mb-4" style={{ color: '#0f1b35' }}>알림 설정</p>
              <div className="space-y-3">
                {notificationControls.map(n => (
                  <div key={n.key} className="flex items-center justify-between py-2">
                    <div className="flex items-center gap-2">
                      <span className="text-sm" style={{ color: '#0f1b35' }}>{n.label}</span>
                      {!n.available && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-400">준비 중</span>}
                    </div>
                    <button
                      onClick={() => void toggleSetting('notifications', n.key as keyof UserSettings['notifications'])}
                      disabled={!n.available || settingsBusy}
                      aria-disabled={!n.available}
                      className="w-10 h-6 rounded-full relative cursor-pointer transition-all disabled:cursor-not-allowed disabled:opacity-50"
                      style={{ background: notifSettings[n.key as keyof typeof notifSettings] ? '#3b82f6' : '#e2e8f0', border: 'none' }}
                      role="switch"
                      aria-checked={notifSettings[n.key as keyof typeof notifSettings]}
                      aria-label={n.label}
                    >
                      <div className="w-5 h-5 rounded-full bg-white absolute top-0.5 transition-all" style={{ left: notifSettings[n.key as keyof typeof notifSettings] ? '18px' : '2px', boxShadow: '0 1px 4px rgba(0,0,0,0.2)' }}/>
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {section === '연동 환경' && <Integrations runtimeStatus={runtimeStatus} settings={settings} integrationStatus={integrationStatus} onToggle={(provider) => { void toggleSetting('integrations', provider); }}/>}

          {section === '개인정보' && (
            <div className="space-y-5">
              <div className="card-game p-5">
                <p className="font-bold text-sm mb-4" style={{ color: '#0f1b35' }}>공개 프로필 설정</p>
                {([
                  { key: 'growthInfo', label: '성장 정보 공개', desc: '레벨, 경험치, 활동 분야를 프로필에 표시' },
                  { key: 'projectList', label: '프로젝트 목록 공개', desc: '완료된 프로젝트를 다른 사람이 볼 수 있어요' },
                  { key: 'learningHistory', label: '학습 기록 공개', desc: '학습한 과정과 진행 상황을 표시' },
                ] as const).map(item => (
                  <div key={item.key} className="flex items-start justify-between p-3 rounded-xl mb-2" style={{ background: '#f8fafc' }}>
                    <div>
                      <p className="text-sm font-semibold" style={{ color: '#0f1b35' }}>{item.label}</p>
                      <p className="text-xs" style={{ color: '#64748b' }}>{item.desc}</p>
                    </div>
                    <button
                      onClick={() => void toggleSetting('privacy', item.key)}
                      className="w-10 h-6 rounded-full relative ml-4 flex-shrink-0 transition-all"
                      style={{ background: privacySettings[item.key] ? '#3b82f6' : '#e2e8f0', border: 'none' }}
                      role="switch"
                      aria-checked={privacySettings[item.key]}
                      aria-label={item.label}
                    >
                      <div className="w-5 h-5 rounded-full bg-white absolute top-0.5 transition-all" style={{ left: privacySettings[item.key] ? '18px' : '2px', boxShadow: '0 1px 4px rgba(0,0,0,0.2)' }}/>
                    </button>
                  </div>
                ))}
              </div>
              <div className="card-game p-5">
                <p className="font-bold text-sm mb-2" style={{ color: '#0f1b35' }}>데이터 관리</p>
                <p className="text-xs mb-3" style={{ color: '#64748b' }}>내 계정에 귀속된 활동 원장을 JSON 또는 Markdown으로 내려받습니다. 계정 삭제는 복구 정책이 연결된 후 제공됩니다.</p>
                <div className="flex gap-3 flex-wrap">
                  <button onClick={() => void downloadActivityExport('json')} disabled={settingsBusy} className="px-4 py-2 rounded-xl text-sm font-bold border-2 border-blue-200 text-blue-600 disabled:cursor-not-allowed disabled:opacity-50">{settingsBusy ? '내보내는 중…' : '활동 기록 내보내기'}</button>
                  <button onClick={() => void downloadActivityExport('markdown')} disabled={settingsBusy} className="px-4 py-2 rounded-xl text-sm font-bold border-2 border-violet-200 text-violet-600 disabled:cursor-not-allowed disabled:opacity-50">{settingsBusy ? '내보내는 중…' : '활동 기록 Markdown 내보내기'}</button>
                  <button disabled className="px-4 py-2 rounded-xl text-sm font-bold border-2 border-slate-200 text-slate-400 disabled:cursor-not-allowed">계정 삭제</button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
